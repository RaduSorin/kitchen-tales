import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { randomUUID } from 'node:crypto'
import type { Schema } from '../../data/resource'
import { EVERYONE, SPACE_PREFIX, spaceOf } from '../../shared/spaces'

const cognito = new CognitoIdentityProviderClient({})
// Set by Amplify because auth grants this function access (auth/resource.ts).
const POOL_ID = process.env.AMPLIFY_AUTH_USERPOOL_ID!

type Member = Schema['FamilyMember']['type']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toMember(u: UserType, space: string | undefined, mySpace: string | undefined): Member {
  const attr = (n: string) => u.Attributes?.find((a) => a.Name === n)?.Value
  return {
    email: attr('email') ?? u.Username ?? '',
    // FORCE_CHANGE_PASSWORD means the person was invited but never signed in.
    pending: u.UserStatus === 'FORCE_CHANGE_PASSWORD',
    createdAt: u.UserCreateDate?.toISOString(),
    space,
    sameSpace: !!space && space === mySpace,
  }
}

async function groupsOf(username: string) {
  const res = await cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: POOL_ID, Username: username, Limit: 60 }))
  return (res.Groups ?? []).map((g) => g.GroupName!).filter(Boolean)
}

async function listFamily(mySpace: string | undefined): Promise<Member[]> {
  const users: UserType[] = []
  let token: string | undefined
  do {
    const res = await cognito.send(new ListUsersCommand({ UserPoolId: POOL_ID, PaginationToken: token }))
    users.push(...(res.Users ?? []))
    token = res.PaginationToken
  } while (token)
  const members = await Promise.all(users.map(async (u) => toMember(u, spaceOf(await groupsOf(u.Username!)), mySpace)))
  return members.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
}

const addToGroup = (username: string, group: string) =>
  cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: POOL_ID, Username: username, GroupName: group }))

/**
 * Creates the account and puts it in a space before its first sign-in: the inviter's own space,
 * or (separate) a new space of its own, where it sees only what other spaces share.
 */
async function invite(rawEmail: string, resend: boolean, separate: boolean, mySpace: string | undefined): Promise<Member> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL.test(email)) throw new Error('Adresa de email nu pare corectă.')
  if (!separate && !mySpace && !resend) throw new Error('Contul tău nu are încă un spațiu. Deschide aplicația din nou și reîncearcă.')
  try {
    const res = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: POOL_ID,
      Username: email,
      UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }],
      DesiredDeliveryMediums: ['EMAIL'],
      ...(resend ? { MessageAction: 'RESEND' as const } : {}),
    }))
    const username = res.User!.Username!
    if (resend) return toMember(res.User!, spaceOf(await groupsOf(username)), mySpace)
    let space = mySpace!
    if (separate) {
      space = `${SPACE_PREFIX}${randomUUID()}`
      await cognito.send(new CreateGroupCommand({ UserPoolId: POOL_ID, GroupName: space, Description: email }))
    }
    await addToGroup(username, EVERYONE)
    await addToGroup(username, space)
    return toMember(res.User!, space, mySpace)
  } catch (err) {
    const name = (err as Error).name
    if (name === 'UsernameExistsException') throw new Error('Persoana asta are deja cont.')
    if (name === 'UnsupportedUserStateException') throw new Error('Persoana s-a conectat deja, nu mai are nevoie de invitație.')
    if (name === 'UserNotFoundException') throw new Error('Nu am găsit invitația. Trimite una nouă.')
    throw err
  }
}

type Event = {
  fieldName: string
  arguments: { email?: string; resend?: boolean | null; separate?: boolean | null }
  identity?: { groups?: string[] | null }
}

export const handler = async (event: Event) => {
  // The schema lets only admins call these; the caller's own space comes from their token.
  const mySpace = spaceOf(event.identity?.groups)
  if (event.fieldName === 'listFamily') return listFamily(mySpace)
  if (event.fieldName === 'inviteFamilyMember') return invite(event.arguments.email ?? '', !!event.arguments.resend, !!event.arguments.separate, mySpace)
  throw new Error(`Unknown field ${event.fieldName}`)
}
