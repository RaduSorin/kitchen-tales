import { describe, expect, it } from 'vitest'
import { folderNameProblem, folderTime, groupFolders } from '../src/lib/stories'
import type { Story } from '../src/lib/types'

const story = (id: string, p: Partial<Story> = {}): Story => ({ id, title: id, emoji: '🌙', source: 'recording', audioKey: id, ...p })

describe('groupFolders', () => {
  it('puts our own folders first, then the built-in ones, then what other families shared', () => {
    const folders = groupFolders([
      story('a'),
      story('b', { collection: 'Ursuleți' }),
      story('c', { mine: false, spaceName: 'Bunici' }),
      story('d', { source: 'generated' }),
    ])
    expect(folders.map((f) => f.name)).toEqual(['Ursuleți', 'Povești create de noi', 'Vocea noastră', 'Primite de la Bunici'])
    expect(folders.find((f) => f.name === 'Vocea noastră')?.builtin).toBe(true)
    expect(folders.at(-1)?.mine).toBe(false)
  })

  it('counts shared stories and keeps empty folders the family made', () => {
    const folders = groupFolders([story('a', { collection: 'Seara', shared: true }), story('b', { collection: 'Seara' })],
      [{ id: 'f1', name: 'Gol' } as never])
    const seara = folders.find((f) => f.name === 'Seara')!
    expect(seara.sharedCount).toBe(1)
    expect(seara.shared).toBe(false)
    expect(folders.find((f) => f.name === 'Gol')?.items).toEqual([])
  })
})

describe('folderNameProblem', () => {
  it('refuses empty, too long and taken names, ignoring diacritics', () => {
    expect(folderNameProblem('  ', [])).not.toBe('')
    expect(folderNameProblem('x'.repeat(41), [])).not.toBe('')
    expect(folderNameProblem('Povesti de seara', ['Povești de seară'])).not.toBe('')
    expect(folderNameProblem('vocea noastra', [])).not.toBe('')
    expect(folderNameProblem('Povești de seară', ['Povești de seară'], 'Povești de seară')).toBe('')
    expect(folderNameProblem('Animale', ['Ursuleți'])).toBe('')
  })
})

describe('folderTime', () => {
  it('adds up the listening time', () => {
    expect(folderTime([story('a', { durationSec: 600 }), story('b', { durationSec: 2100 })])).toBe('45 min')
    expect(folderTime([story('a')])).toBe('')
  })
})
