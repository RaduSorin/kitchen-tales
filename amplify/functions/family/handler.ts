import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import type { Schema } from '../../data/resource'

const cognito = new CognitoIdentityProviderClient({})
// Set by Amplify because auth grants this function access (auth/resource.ts).
const POOL_ID = process.env.AMPLIFY_AUTH_USERPOOL_ID!

type Member = Schema['FamilyMember']['type']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toMember(u: UserType): Member {
  const attr = (n: string) => u.Attributes?.find((a) => a.Name === n)?.Value
  return {
    email: attr('email') ?? u.Username ?? '',
    // FORCE_CHANGE_PASSWORD means the person was invited but never signed in.
    pending: u.UserStatus === 'FORCE_CHANGE_PASSWORD',
    createdAt: u.UserCreateDate?.toISOString(),
  }
}

async function listFamily(): Promise<Member[]> {
  const members: Member[] = []
  let token: string | undefined
  do {
    const res = await cognito.send(new ListUsersCommand({ UserPoolId: POOL_ID, PaginationToken: token }))
    members.push(...(res.Users ?? []).map(toMember))
    token = res.PaginationToken
  } while (token)
  return members.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
}

async function invite(rawEmail: string, resend: boolean): Promise<Member> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL.test(email)) throw new Error('Adresa de email nu pare corectă.')
  try {
    const res = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: POOL_ID,
      Username: email,
      UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }],
      DesiredDeliveryMediums: ['EMAIL'],
      ...(resend ? { MessageAction: 'RESEND' as const } : {}),
    }))
    return toMember(res.User!)
  } catch (err) {
    const name = (err as Error).name
    if (name === 'UsernameExistsException') throw new Error('Persoana asta are deja cont.')
    if (name === 'UnsupportedUserStateException') throw new Error('Persoana s-a conectat deja, nu mai are nevoie de invitație.')
    if (name === 'UserNotFoundException') throw new Error('Nu am găsit invitația. Trimite una nouă.')
    throw err
  }
}

export const handler = async (event: { fieldName: string; arguments: { email?: string; resend?: boolean | null } }) => {
  if (event.fieldName === 'listFamily') return listFamily()
  if (event.fieldName === 'inviteFamilyMember') return invite(event.arguments.email ?? '', !!event.arguments.resend)
  throw new Error(`Unknown field ${event.fieldName}`)
}
