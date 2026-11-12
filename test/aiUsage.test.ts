import { describe, expect, it } from 'vitest'
import type { S3Client } from '@aws-sdk/client-s3'
import { countAi, isNoRecipe, MONTHLY_AI_LIMITS, readUsage, refundAi, thisMonth } from '../amplify/shared/aiUsage'

/** An in-memory bucket that answers GetObject / PutObject like S3. */
function fakeS3() {
  const files = new Map<string, string>()
  const s3 = {
    send: async (cmd: { constructor: { name: string }; input: { Key: string; Body?: string } }) => {
      const key = cmd.input.Key
      if (cmd.constructor.name === 'GetObjectCommand') {
        if (!files.has(key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
        return { Body: { transformToString: async () => files.get(key) } }
      }
      files.set(key, cmd.input.Body!)
      return {}
    },
  } as unknown as S3Client
  return { s3, files }
}

describe('monthly AI limit', () => {
  it('counts per space and kind, and refuses past the limit', async () => {
    const { s3 } = fakeS3()
    for (let i = 0; i < MONTHLY_AI_LIMITS.photo; i++) await countAi(s3, 'b', 'space-A', 'photo')
    await expect(countAi(s3, 'b', 'space-A', 'photo')).rejects.toThrow(/limita lunii/)
    // Another kind and another space are not affected.
    await countAi(s3, 'b', 'space-A', 'recipe')
    await countAi(s3, 'b', 'space-B', 'photo')
    expect(await readUsage(s3, 'b', 'space-A')).toEqual({ month: thisMonth(), photo: MONTHLY_AI_LIMITS.photo, recipe: 1 })
  })

  it('starts each month from zero', async () => {
    const { s3, files } = fakeS3()
    files.set('ai-usage/space-A/2000-01.json', JSON.stringify({ month: '2000-01', story: MONTHLY_AI_LIMITS.story }))
    await expect(countAi(s3, 'b', 'space-A', 'story')).resolves.toBeUndefined()
  })

  it('does not count a caller without a space', async () => {
    const { s3, files } = fakeS3()
    await countAi(s3, 'b', undefined, 'story')
    expect(files.size).toBe(0)
  })

  it('gives a use back when nothing was found, never below zero', async () => {
    const { s3 } = fakeS3()
    await countAi(s3, 'b', 'space-A', 'recipe')
    await countAi(s3, 'b', 'space-A', 'recipe')
    await refundAi(s3, 'b', 'space-A', 'recipe')
    expect((await readUsage(s3, 'b', 'space-A')).recipe).toBe(1)
    await refundAi(s3, 'b', 'space-A', 'recipe')
    await refundAi(s3, 'b', 'space-A', 'recipe')
    expect((await readUsage(s3, 'b', 'space-A')).recipe).toBe(0)
  })

  it('knows the importer\'s "no recipe" answers', () => {
    expect(isNoRecipe(new Error('Nu am găsit o rețetă aici.'))).toBe(true)
    expect(isNoRecipe(new Error('Nu am găsit rețeta în textul videoclipului.'))).toBe(true)
    expect(isNoRecipe(new Error('Ați ajuns la limita lunii'))).toBe(false)
    expect(isNoRecipe(undefined)).toBe(false)
  })
})
