import { describe, expect, it } from 'vitest'
import { addLast, KID_LIMIT, kidHasRoom, moveTo, placeOf, playNext, queueMessage, removeFrom, untilStop, type QueuedStory } from '../src/lib/upNext'

const ids = (q: QueuedStory[]) => q.map((x) => x.id)

// The same rules as ios/KitchenTalesTests/UpNextTests.swift.
describe('Urmează (the story queue)', () => {
  it('adds at the end, once', () => {
    let q = addLast(addLast([], 'a'), 'b')
    expect(addLast(q, 'a')).toBe(q)
    q = addLast(q, 'c')
    expect(ids(q)).toEqual(['a', 'b', 'c'])
    expect(placeOf(q, 'b')).toBe(2)
    expect(placeOf(q, 'x')).toBeUndefined()
  })

  it('"Redă următoarea" moves a story to the front and keeps who chose it', () => {
    let q: QueuedStory[] = [{ id: 'a', byKid: true }, { id: 'b' }, { id: 'c' }]
    q = playNext(q, 'c')
    expect(ids(q)).toEqual(['c', 'a', 'b'])
    q = playNext(q, 'a')
    expect(q[0]).toEqual({ id: 'a', byKid: true })
    expect(ids(playNext(q, 'd'))).toEqual(['d', 'a', 'c', 'b'])
  })

  it('gives the child a limit, not the parent', () => {
    let q: QueuedStory[] = []
    for (let i = 0; i < KID_LIMIT; i++) q = addLast(q, `k${i}`, true)
    expect(kidHasRoom(q)).toBe(false)
    expect(addLast(q, 'more', true)).toBe(q)
    expect(ids(addLast(q, 'parent'))).toContain('parent')
  })

  it('moves and removes', () => {
    const q = ['a', 'b', 'c', 'd'].reduce<QueuedStory[]>((acc, id) => addLast(acc, id), [])
    expect(ids(moveTo(q, 0, 2))).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(moveTo(q, 3, 0))).toEqual(['d', 'a', 'b', 'c'])
    expect(ids(moveTo(q, 9, 0))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(removeFrom(q, 'b'))).toEqual(['a', 'c', 'd'])
  })

  it('puts the moon where "După N povești" stops', () => {
    expect(untilStop(1, 0)).toBe(0)
    expect(untilStop(3, 0)).toBe(2)
    expect(untilStop(3, 1)).toBe(1)
    expect(untilStop(2, 5)).toBe(0)
  })

  it('says what happened', () => {
    expect(queueMessage('first', true)).toBe('Urmează după povestea asta')
    expect(queueMessage('added', false)).toBe('Adăugată la coadă. O găsești pe Acasă.')
    expect(queueMessage('kidFull', true)).toBe('Ai ales deja 3 povești')
  })
})
