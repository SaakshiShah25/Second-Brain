import { documentFile, documentZip } from '../api/documents'
import type { DocumentItem } from '../api/types'

// Share / download helpers for documents.
//
// iOS Safari only lets navigator.share() open the share sheet while the
// tap that triggered it is still "fresh" - awaiting a network fetch first
// can lose that and throw NotAllowedError. So files are fetched AHEAD of
// the tap (prefetch() when a document is opened or selected) and cached
// here, which makes the Share tap itself instant.

const cache = new Map<number, Promise<File>>()

export function downloadName(doc: Pick<DocumentItem, 'title' | 'file_name'>) {
  const ext = doc.file_name.includes('.') ? doc.file_name.split('.').pop() : ''
  const base = doc.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document'
  return ext ? `${base}.${ext}` : base
}

export function prefetch(docs: DocumentItem[]) {
  for (const doc of docs) {
    if (!cache.has(doc.id)) {
      const p = documentFile(doc.id).then((blob) => new File([blob], downloadName(doc), { type: doc.mime_type }))
      p.catch(() => cache.delete(doc.id))
      cache.set(doc.id, p)
    }
  }
}

export function getFiles(docs: DocumentItem[]) {
  prefetch(docs)
  return Promise.all(docs.map((d) => cache.get(d.id)!))
}

export function canShareFiles() {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** One file downloads as itself; several come as one ZIP. */
export async function downloadDocuments(docs: DocumentItem[]) {
  if (docs.length === 1) {
    const [file] = await getFiles(docs)
    save(file, file.name)
  } else {
    save(await documentZip(docs.map((d) => d.id)), `MyConfia documents.zip`)
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'retry'

/** Opens the phone's share sheet (WhatsApp, Mail, Drive, AirDrop...) with
 * the actual files; falls back to downloading where file sharing isn't
 * supported (most desktop browsers). */
export async function shareDocuments(docs: DocumentItem[]): Promise<ShareOutcome> {
  const files = await getFiles(docs)
  if (canShareFiles() && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: docs.length === 1 ? docs[0].title : `${docs.length} documents` })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // The tap went stale while files were still downloading - they're
      // cached now, so a second tap will open the sheet immediately.
      if (e instanceof DOMException && e.name === 'NotAllowedError') return 'retry'
      throw e
    }
  }
  await downloadDocuments(docs)
  return 'downloaded'
}

/** Opens the file in a new tab (PDF viewer / image), where supported. */
export async function openDocument(doc: DocumentItem) {
  const [file] = await getFiles([doc])
  const url = URL.createObjectURL(file)
  const win = window.open(url, '_blank')
  if (!win) save(file, file.name)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
