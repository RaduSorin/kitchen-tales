import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { JOB_ID, jobPath, type JobOutcome } from './jobs'
import { spaceOf } from './spaces'

type JobEvent = { arguments?: { jobId?: string | null } | null; identity?: { groups?: string[] | null } | null }

/**
 * Runs the work of an async job and writes its outcome for the app. Never throws: an event
 * invocation that fails would be retried by Lambda and charged again, and the app would wait in vain.
 */
export async function runJob(s3: S3Client, bucket: string, event: JobEvent, work: () => Promise<unknown>) {
  const jobId = event.arguments?.jobId ?? ''
  const space = spaceOf(event.identity?.groups)
  if (!JOB_ID.test(jobId) || !space) {
    console.error('job without a valid id or space', { jobId, space })
    return
  }
  let outcome: JobOutcome
  try {
    outcome = { ok: true, data: await work() }
  } catch (err) {
    console.error('job failed', err)
    outcome = { ok: false, error: (err as Error)?.message || 'Ceva nu a mers. Încearcă din nou.' }
  }
  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: jobPath(space, jobId), Body: JSON.stringify(outcome), ContentType: 'application/json', CacheControl: 'no-store',
    }))
  } catch (err) {
    console.error('could not write the job outcome', err)
  }
}
