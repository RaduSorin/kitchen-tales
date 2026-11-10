import { describe, expect, it } from 'vitest'
import { parseCommand } from '../src/lib/handsFree'

describe('parseCommand (hands-free cook mode)', () => {
  it.each([
    ['următorul pas', { kind: 'next' }],
    ['gata', { kind: 'next' }],
    ['înapoi', { kind: 'prev' }],
    ['pasul trei', { kind: 'step', n: 3 }],
    ['pasul 4', { kind: 'step', n: 4 }],
    ['pornește timerul', { kind: 'timer' }],
    ['oprește timerul', { kind: 'pause' }],
    ['ce ingrediente', { kind: 'ingredients' }],
    ['repetă', { kind: 'repeat' }],
    ['nu mai asculta', { kind: 'stop' }],
  ])('"%s"', (said, command) => {
    expect(parseCommand(said)).toEqual(command)
  })

  it('takes the last command said', () => {
    expect(parseCommand('mai departe, nu, înapoi')).toEqual({ kind: 'prev' })
  })

  it('ignores ordinary talk', () => {
    expect(parseCommand('bună ziua')).toBeUndefined()
  })
})
