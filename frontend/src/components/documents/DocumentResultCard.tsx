import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Download, FileQuestion, Plus, Share2 } from 'lucide-react'
import type { DocumentItem, DocumentSearchResult } from '../../api/types'
import { prefetch } from '../../lib/documentShare'
import DocThumb from './DocThumb'
import DocumentSheet from './DocumentSheet'
import { runDownload, runShare } from '../../lib/documentActions'
import UploadSheet from './UploadSheet'

function Row({
  doc,
  checked,
  onToggle,
  onPreview,
}: {
  doc: DocumentItem
  checked: boolean
  onToggle: () => void
  onPreview: () => void
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl p-2 transition-colors ${checked ? 'bg-accent-soft' : ''}`}>
      <button type="button" onClick={onPreview} aria-label={`Preview ${doc.title}`} className="pressable flex-shrink-0">
        <DocThumb doc={doc} className="h-14 w-14 rounded-lg" iconSize={22} />
      </button>
      <button type="button" onClick={onToggle} className="pressable flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium">{doc.title}</span>
          <span className="block truncate text-[0.8125rem] text-text-muted">
            {doc.category}
            {doc.owner ? ` · ${doc.owner}` : ''}
          </span>
        </span>
        <span
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${
            checked ? 'border-accent bg-accent text-accent-contrast' : 'border-border-strong'
          }`}
        >
          {checked && <Check size={14} strokeWidth={3} />}
        </span>
      </button>
    </div>
  )
}

// The answer to "pull my aadhaar and photo": one section per thing asked
// for, with the best match pre-ticked and other candidates one tap away
// (so a wrong guess is a single tap to fix), then Share / Download for
// whatever is ticked.
export default function DocumentResultCard({ result }: { result: DocumentSearchResult }) {
  const initial = useMemo(() => new Set(result.groups.map((g) => g.best).filter((id): id is number => id !== null)), [result])
  const [selected, setSelected] = useState<Set<number>>(initial)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<DocumentItem | null>(null)
  const [uploading, setUploading] = useState(false)

  const byId = useMemo(() => {
    const m = new Map<number, DocumentItem>()
    result.groups.forEach((g) => g.matches.forEach((d) => m.set(d.id, d)))
    return m
  }, [result])
  const selectedDocs = [...selected].map((id) => byId.get(id)).filter(Boolean) as DocumentItem[]
  const found = result.groups.filter((g) => g.best !== null || g.matches.some((m) => selected.has(m.id))).length

  // Fetch the pre-ticked files now so the Share tap opens the sheet instantly.
  useEffect(() => {
    prefetch([...initial].map((id) => byId.get(id)!).filter(Boolean))
  }, [initial, byId])

  function toggle(doc: DocumentItem) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(doc.id)) next.delete(doc.id)
      else next.add(doc.id)
      return next
    })
    prefetch([doc])
  }

  if (result.total_documents === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-card p-4">
        <p className="mb-1 text-[0.9375rem] font-semibold">No documents yet</p>
        <p className="mb-3 text-sm text-text-muted">Add your files once, then pull them up here any time just by asking.</p>
        <button
          type="button"
          onClick={() => setUploading(true)}
          className="pressable inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-contrast"
        >
          <Plus size={17} strokeWidth={2.2} /> Add documents
        </button>
        {uploading && <UploadSheet onClose={() => setUploading(false)} />}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-card" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <p className="px-4 pt-3.5 pb-1 text-[0.9375rem]">
        {result.groups.length === 1 && result.groups[0].label === 'Your documents'
          ? 'Here are your latest documents.'
          : found === result.groups.length
            ? `Found ${found === 1 ? 'it' : `all ${found}`}. Untick anything you don’t need.`
            : `Found ${found} of ${result.groups.length}. Check the picks below.`}
      </p>

      <div className="flex flex-col gap-1 p-2">
        {result.groups.map((g, gi) => {
          const best = g.best !== null ? byId.get(g.best) : undefined
          const others = g.matches.filter((m) => m.id !== g.best)
          const showOthers = expanded.has(gi) || (!best && others.length > 0)
          return (
            <section key={gi} className="rounded-xl px-1 pt-2">
              <p className="mb-1 px-1 text-[0.75rem] font-semibold uppercase tracking-wide text-text-faint">{g.label}</p>
              {best && <Row doc={best} checked={selected.has(best.id)} onToggle={() => toggle(best)} onPreview={() => setPreview(best)} />}
              {!best && others.length > 0 && (
                <p className="px-1 pb-1 text-[0.8125rem] text-text-muted">Not sure which — is it one of these?</p>
              )}
              {showOthers &&
                others.map((d) => (
                  <Row key={d.id} doc={d} checked={selected.has(d.id)} onToggle={() => toggle(d)} onPreview={() => setPreview(d)} />
                ))}
              {best && others.length > 0 && !expanded.has(gi) && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => new Set(prev).add(gi))}
                  className="pressable flex items-center gap-1 px-1 py-1.5 text-[0.8125rem] font-medium text-link"
                >
                  Not this? {others.length} other match{others.length === 1 ? '' : 'es'}
                  <ChevronDown size={14} strokeWidth={2} />
                </button>
              )}
              {g.matches.length === 0 && (
                <div className="flex items-center gap-3 rounded-xl p-2">
                  <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-faint">
                    <FileQuestion size={22} strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1 text-[0.875rem] text-text-muted">Not in your documents yet.</span>
                  <button
                    type="button"
                    onClick={() => setUploading(true)}
                    className="pressable flex h-9 items-center gap-1 rounded-full border border-border-strong px-3 text-sm font-medium"
                  >
                    <Plus size={15} strokeWidth={2.2} /> Add
                  </button>
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2.5">
        <span className="flex-1 pl-1.5 text-sm text-text-muted">{selected.size} selected</span>
        <button
          type="button"
          disabled={!selected.size}
          onClick={() => runDownload(selectedDocs)}
          className="pressable flex h-10 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-sm font-medium disabled:opacity-35"
        >
          <Download size={16} strokeWidth={2} /> {selected.size > 1 ? 'ZIP' : 'Save'}
        </button>
        <button
          type="button"
          disabled={!selected.size}
          onClick={() => runShare(selectedDocs)}
          className="pressable flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-contrast disabled:opacity-35"
        >
          <Share2 size={16} strokeWidth={2} /> Share{selected.size > 1 ? ` ${selected.size}` : ''}
        </button>
      </div>

      {preview && <DocumentSheet doc={preview} onClose={() => setPreview(null)} />}
      {uploading && <UploadSheet onClose={() => setUploading(false)} />}
    </div>
  )
}
