import { describe, expect, it } from 'vitest'
import { isoSeconds, openFallow, passphraseOk, sealFallow, toFallow } from '../src/lib/mind/fallow'
import type { HerbBook } from '../src/lib/mind/herbarium'

// Răgaz → Fallow: the mapping to Fallow's VaultContents and the .fallow file both apps read.
const data = {
  createdAt: '2026-11-01T08:00:00.123Z',
  exercises: [
    { id: 'e1', title: 'Scrisoare blândă', category: 'Compasiune', minutes: 15, steps: 'Scrie.', packId: 'p28', packTitle: 'Programul de 28 de zile', order: 2 },
    { id: 'e2', title: 'Plimbare', steps: '' },
  ],
  months: [{ id: '2026-11', intention: 'Mai multă odihnă', success: 'Dorm înainte de 23', target: 3, fridays: [{ date: '2026-11-13', exerciseId: 'e1', title: 'Scrisoare blândă' }, { date: '2026-11-20', title: '' }], savedAt: 1_762_000_000_456 }],
  notes: [
    { id: 'fri-1', date: '2026-11-13', month: '2026-11', exerciseId: 'e1', before: 7, after: 4, fit: 'da' as const, text: 'Mi-a prins bine', createdAt: 1_762_900_000_789 },
    { id: 'r1', date: '2026-11-30', month: '2026-11', kind: 'reflection' as const, text: '', answers: { sign: 'da', worked: 'Plimbările', avoid: '' }, createdAt: 1_764_500_000_000 },
    { id: 'w1', date: '2026-11-16', month: '', kind: 'worry' as const, text: '', worry: { stone: ['Ploaia'], clay: ['Somnul'], step: 'La 23 în pat' }, createdAt: 1_763_300_000_000 },
  ],
  herb: { v: 1, since: 1_762_000_000_000, oldMonths: [], oldExercises: [], earned: { vineri: '2026-11-13T19:00:00.500Z', 'luna:2026-11': '2026-11-30T20:00:00.000Z' }, seen: ['vineri'], lastVisit: '2026-11-30' } as HerbBook,
  rhythms: { friday: { on: true, time: '20:00' }, monday: { on: false, time: '08:30' } },
}

describe('Răgaz → Fallow', () => {
  it('maps the vault to Fallow fields, with dates Swift can read', () => {
    const c = toFallow(data)
    expect(c.createdAt).toBe('2026-11-01T08:00:00Z')
    expect(c.settings).toEqual({ iCloudBackup: true, fridayReminder: true, worryReminder: false, reflectionReminder: false })
    expect(c.months[0]).toEqual({ id: '2026-11', intention: 'Mai multă odihnă', success: 'Dorm înainte de 23', target: 3,
      fridays: [{ date: '2026-11-13', exerciseId: 'e1', title: 'Scrisoare blândă' }, { date: '2026-11-20', title: '' }], savedAt: isoSeconds(1_762_000_000_456) })
    const [friday, reflection, worry] = c.notes
    expect(friday.kind).toBe('friday')
    expect(friday).toMatchObject({ before: 7, after: 4, fit: 'da', text: 'Mi-a prins bine' })
    expect(reflection.answers).toEqual({ sign: 'yes', worked: 'Plimbările' })
    expect(worry.month).toBe('2026-11')
    expect(worry.worry).toEqual({ stone: ['Ploaia'], clay: ['Somnul'], step: 'La 23 în pat' })
    expect(c.exercises[0]).toMatchObject({ packId: 'p28', order: 2 })
    expect(c.exercises[1]).toEqual({ id: 'e2', title: 'Plimbare', steps: '' })
    expect(c.herbarium?.earned).toEqual({ vineri: '2026-11-13T19:00:00Z', 'luna:2026-11': '2026-11-30T20:00:00Z' })
    expect(c.herbarium?.seen).toEqual(['vineri'])
    expect(JSON.stringify(c)).not.toMatch(/\.\d{3}Z/)
  })

  it('seals a file that opens only with the passphrase', async () => {
    const c = toFallow(data)
    const bytes = await sealFallow(c, '  Pădure liniștită ', 1000)
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe('FALLOWX1')
    expect(new DataView(bytes.buffer).getUint32(24)).toBe(1000)
    expect(new TextDecoder().decode(bytes)).not.toContain('odihnă')
    const back = await openFallow(bytes, 'Pădure liniștită')
    expect(back.format).toBe('fallow-vault')
    expect(back.contents).toEqual(c)
    await expect(openFallow(bytes, 'altă parolă')).rejects.toThrow()
  })

  it('wants a passphrase of at least 8 characters', async () => {
    expect(passphraseOk('  scurt  ')).toBe(false)
    expect(passphraseOk('destul de lungă')).toBe(true)
    await expect(sealFallow({}, 'scurt')).rejects.toThrow()
  })
})
