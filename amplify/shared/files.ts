// Stored files: recipe photos, story audio, story covers and the outcome of AI jobs (shared/jobs.ts). New files go in a folder named after
// the space that made them (`stories/space-<id>/<uuid>.mp3`); files from before spaces sit
// directly under the prefix. Only the files function (functions/files) touches them for the app.
export const FILE_PREFIXES = ['recipe-photos', 'stories', 'story-covers', 'ai-jobs'] as const
export type FilePrefix = (typeof FILE_PREFIXES)[number]

/** The space folder a file is in, or undefined for an older file. */
export const fileSpace = (path: string) => {
  const seg = path.split('/')[1]
  return seg?.startsWith('space-') && path.split('/').length === 3 ? seg : undefined
}

/** Where a function stores a new file for the caller's space. */
export const newFilePath = (prefix: FilePrefix, space: string | undefined, ext: string) =>
  `${prefix}/${space ? `${space}/` : ''}${crypto.randomUUID()}.${ext}`

// Răgaz's encrypted backups (src/lib/mind/backup.ts): one file per account, named after its
// Cognito sub, encrypted on the phone with a key the server never has. Not in FILE_PREFIXES: the
// files function reaches it only through mindBackup, for the caller's own sub.
export const MIND_PREFIX = 'mind'
export const mindBackupPath = (sub: string) => `${MIND_PREFIX}/${sub}/backup.json`
