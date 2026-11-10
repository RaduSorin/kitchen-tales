import { describe, expect, it } from 'vitest'
import { keyFromCode, newDataKey, open, randomBytes, seal, unwrap, wrap } from '../src/lib/mind/crypto'

// Răgaz: what Loredana writes is sealed with a data key, which is wrapped by a key from her
// backup code (or Face ID). Few iterations here only to keep the test fast.
const ITER = 1000

describe('Răgaz encryption', () => {
  it('opens what it sealed, and the sealed text does not contain it', async () => {
    const dek = await newDataKey()
    const sealed = await seal(dek, { note: 'gând de vineri' })
    expect(JSON.stringify(sealed)).not.toContain('vineri')
    expect(await open(dek, sealed)).toEqual({ note: 'gând de vineri' })
  })

  it('unwraps the data key with the right code only', async () => {
    const salt = randomBytes(16)
    const dek = await newDataKey()
    const wrapped = await wrap(dek, await keyFromCode('123456', salt, ITER))
    const sealed = await seal(dek, 'jurnal')

    const back = await unwrap(wrapped, await keyFromCode('123456', salt, ITER))
    expect(await open(back, sealed)).toBe('jurnal')

    await expect(unwrap(wrapped, await keyFromCode('654321', salt, ITER))).rejects.toThrow()
  })
})
