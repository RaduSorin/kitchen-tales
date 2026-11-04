// Spaces: every account belongs to one space (a household), a Cognito group named `space-<id>`.
// Rows carry their space group in `spaceGroups` (full access for its members); a shared recipe,
// story or folder also carries EVERYONE in `readerGroups`, so every other account can read it.
// ADMINS (Sorin) can see the accounts and invite. Used by the app and by the family function.
export const EVERYONE = 'everyone'
export const ADMINS = 'admins'
export const SPACE_PREFIX = 'space-'

export const spaceOf = (groups: readonly string[] | null | undefined) => groups?.find((g) => g.startsWith(SPACE_PREFIX))
