// AI work that takes longer than AppSync's fixed 30 s limit (writing and reading a story, planning
// the week, reading a recipe): the app starts it with an async mutation (the function runs in the
// background, invoked as an event), and the function writes the outcome as a small JSON file in
// the caller's space folder. The app waits for that file through a signed link, then deletes it.
// The bucket also drops leftovers after a day (backend.ts).

export const JOB_PREFIX = 'ai-jobs'

/** Job ids are made by the app (a UUID), so it knows where to look before the function starts. */
export const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Where a job's outcome is written: `ai-jobs/space-<id>/<job>.json`. */
export const jobPath = (space: string, jobId: string) => `${JOB_PREFIX}/${space}/${jobId}.json`

/** What the file holds: the result, or why the work failed (in Romanian, shown to the user). */
export type JobOutcome<T = unknown> = { ok: true; data: T } | { ok: false; error: string }
