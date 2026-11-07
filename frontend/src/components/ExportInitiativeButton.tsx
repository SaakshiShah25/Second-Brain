import { useState } from 'react'
import { FileDown, LoaderCircle } from 'lucide-react'
import type { Interaction } from '../api/types'
import { buildInitiativePdf, shareOrDownload } from '../lib/notePdf'

// Exports every note in one initiative as a PDF (share sheet on a phone, a download elsewhere).
export default function ExportInitiativeButton({ name, notes, className = '' }: { name: string; notes: Interaction[]; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (notes.length === 0) return null

  async function run() {
    setBusy(true)
    setFailed(false)
    try {
      await shareOrDownload(await buildInitiativePdf(name, notes))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      aria-label={`Export ${name} as PDF`}
      title={failed ? "Couldn't make the PDF - tap to try again" : 'Export as PDF'}
      className={`pressable flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full disabled:opacity-60 ${
        failed ? 'text-danger' : 'text-text-muted'
      } ${className}`}
    >
      {busy ? <LoaderCircle size={18} strokeWidth={2} className="animate-spin" /> : <FileDown size={18} strokeWidth={2} />}
    </button>
  )
}
