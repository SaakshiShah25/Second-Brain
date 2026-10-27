import { toast } from '../components/Toast'
import type { DocumentItem } from '../api/types'
import { downloadDocuments, shareDocuments } from './documentShare'

// Share/Download with user-facing feedback (toasts) - shared by the
// document sheet, the Docs grid's bulk bar and the chat result card.

export async function runShare(docs: DocumentItem[]) {
  try {
    const outcome = await shareDocuments(docs)
    if (outcome === 'downloaded') toast(docs.length === 1 ? 'Downloaded' : `Downloaded ${docs.length} files as a ZIP`)
    if (outcome === 'retry') toast('Ready — tap Share again')
  } catch {
    toast("Couldn't share — try Download instead")
  }
}

export async function runDownload(docs: DocumentItem[]) {
  try {
    await downloadDocuments(docs)
    toast(docs.length === 1 ? 'Downloaded' : `Downloaded ${docs.length} files as a ZIP`)
  } catch {
    toast("Couldn't download — please try again")
  }
}
