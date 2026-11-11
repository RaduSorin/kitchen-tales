// "Exportă pentru Fallow": gathers the open vault and hands the .fallow file to the phone's share
// sheet (or downloads it). The format and the mapping are in fallow.ts.
import { getItem, getLocal, getVault } from './vault'
import { listExercises, listMonths, listNotes } from './store'
import type { HerbBook } from './herbarium'
import { sealFallow, toFallow } from './fallow'

export async function exportForFallow(passphrase: string) {
  const vault = getVault()
  if (vault.status !== 'open') throw new Error('Deschide Răgaz mai întâi.')
  const [exercises, months, notes, herb, local] = await Promise.all([
    listExercises(), listMonths(), listNotes(), getItem<HerbBook>('herb', 'book'), getLocal(),
  ])
  const contents = toFallow({ createdAt: vault.header.createdAt, exercises, months, notes, herb, rhythms: local.reminders })
  const bytes = await sealFallow(contents, passphrase)
  const name = `Fallow ${new Date().toISOString().slice(0, 10)}.fallow`
  const file = new File([bytes as BlobPart], name, { type: 'application/octet-stream' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Răgaz pentru Fallow' })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      // Sharing refused: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
