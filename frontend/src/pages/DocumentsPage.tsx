import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronRight, Download, Lock, Plus, Search, Share2, Sparkles, Trash2, User, X } from 'lucide-react'
import { useDeleteDocuments, useDocuments } from '../api/documents'
import type { DocumentItem } from '../api/types'
import Chip, { ChipRow } from '../components/Chip'
import ConfirmDialog from '../components/ConfirmDialog'
import PageHeader from '../components/PageHeader'
import { toast } from '../components/Toast'
import DocThumb from '../components/documents/DocThumb'
import DocumentSheet, { ExpiryBadge } from '../components/documents/DocumentSheet'
import { runDownload, runShare } from '../lib/documentActions'
import UploadSheet from '../components/documents/UploadSheet'
import DriveFoldersBar from '../components/google/DriveFoldersBar'
import GoogleIcon from '../components/google/GoogleIcon'
import { daysUntil, EXPIRING_SOON_DAYS, orderedCategories } from '../lib/documentCategories'
import { prefetch } from '../lib/documentShare'
import { useUsageMode } from '../lib/usageMode'

type Filter = { kind: 'all' } | { kind: 'expiring' } | { kind: 'drive' } | { kind: 'category'; value: string } | { kind: 'owner'; value: string }

function needsAttention(d: DocumentItem) {
  const days = daysUntil(d.expiry_date)
  return days !== null && days <= EXPIRING_SOON_DAYS && days >= -30
}

export default function DocumentsPage() {
  const { data: docs, isLoading, error } = useDocuments()
  const del = useDeleteDocuments()
  const { mode } = useUsageMode()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [open, setOpen] = useState<DocumentItem | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  const all = useMemo(() => docs ?? [], [docs])
  const attention = all.filter(needsAttention).sort((a, b) => (a.expiry_date! < b.expiry_date! ? -1 : 1))
  const categories = orderedCategories(mode)
    .map((c) => ({ ...c, count: all.filter((d) => d.category === c.name).length }))
    .filter((c) => c.count > 0)
  const owners = [...new Set(all.map((d) => d.owner).filter(Boolean) as string[])].sort((a, b) =>
    a === 'Me' ? -1 : b === 'Me' ? 1 : a.localeCompare(b),
  )

  const visible = all.filter((d) => {
    if (filter.kind === 'expiring' && !needsAttention(d)) return false
    if (filter.kind === 'drive' && d.source !== 'gdrive') return false
    if (filter.kind === 'category' && d.category !== filter.value) return false
    if (filter.kind === 'owner' && d.owner !== filter.value) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    const hay = [d.title, d.description, d.category, d.owner, d.file_name, ...(d.tags ?? [])].join(' ').toLowerCase()
    return q.split(/\s+/).every((t) => hay.includes(t))
  })
  const selectedDocs = all.filter((d) => selected.has(d.id))
  const driveCount = all.filter((d) => d.source === 'gdrive').length

  function toggle(doc: DocumentItem) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(doc.id)) next.delete(doc.id)
      else next.add(doc.id)
      return next
    })
    prefetch([doc]) // ready for an instant Share tap
  }

  function exitSelect() {
    setSelecting(false)
    setSelected(new Set())
  }

  // Long-press a card to start selecting, like a phone's Photos app.
  function pressStart(doc: DocumentItem) {
    longPressed.current = false
    pressTimer.current = setTimeout(() => {
      longPressed.current = true
      setSelecting(true)
      toggle(doc)
      navigator.vibrate?.(10)
    }, 450)
  }
  function pressEnd() {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  return (
    <div className={selecting ? 'pb-20' : ''}>
      <PageHeader
        title="Documents"
        subtitle={
          all.length ? (
            <span className="inline-flex items-center gap-1">
              <Lock size={13} strokeWidth={2} /> {all.length} file{all.length === 1 ? '' : 's'} · encrypted
            </span>
          ) : undefined
        }
        showProfile
        actions={
          all.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => (selecting ? exitSelect() : setSelecting(true))}
                className="pressable h-9 px-2 text-[0.9375rem] font-medium text-link"
              >
                {selecting ? 'Cancel' : 'Select'}
              </button>
              <button
                type="button"
                onClick={() => setUploading(true)}
                aria-label="Add documents"
                className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-contrast"
              >
                <Plus size={20} strokeWidth={2.2} />
              </button>
            </>
          )
        }
      />

      {error && <p className="text-sm text-danger">Couldn't load documents: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}

      {!isLoading && all.length === 0 && !error && (
        <div className="flex flex-col items-center px-4 pt-8 text-center">
          <div className="mb-5 grid grid-cols-3 gap-2 opacity-80">
            {orderedCategories(mode).slice(0, 6).map((c) => (
              <span key={c.name} className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: `${c.color}1a`, color: c.color }}>
                <c.icon size={24} strokeWidth={1.7} />
              </span>
            ))}
          </div>
          <p className="font-display text-xl font-semibold tracking-[-0.025em]">All your documents, one tap away</p>
          <p className="mt-1.5 mb-5 max-w-xs text-[0.9375rem] leading-relaxed text-text-muted">
            {mode === 'work'
              ? 'Drop in contracts, decks and invoices. They’re named and sorted for you — then just ask for them.'
              : 'Drop in your Aadhaar, PAN, passport, statements — they’re named and sorted for you. Then just ask: “pull my passport and photo”.'}
          </p>
          <button
            type="button"
            onClick={() => setUploading(true)}
            className="pressable inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-medium text-accent-contrast"
          >
            <Plus size={20} strokeWidth={2.2} /> Add documents
          </button>
          <div className="mt-8 w-full text-left">
            <DriveFoldersBar />
          </div>
        </div>
      )}

      {all.length > 0 && (
        <>
          <div className="sticky top-0 z-10 -mx-4 mb-3 bg-bg/95 px-4 py-2 backdrop-blur-xl">
            <div className="relative">
              <Search size={18} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — aadhaar, contract, Mum…"
                className="h-11 w-full rounded-xl bg-bg-elevated pr-10 pl-10 text-base text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/25 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-faint">
                  <X size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>

          {attention.length > 0 && filter.kind !== 'expiring' && !query && (
            <button
              type="button"
              onClick={() => setFilter({ kind: 'expiring' })}
              className="pressable mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand/40 bg-brand-soft p-3.5 text-left"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-[#1b1a17]">
                <AlertTriangle size={20} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold">
                  {attention.length} document{attention.length === 1 ? '' : 's'} need{attention.length === 1 ? 's' : ''} attention
                </span>
                <span className="block truncate text-sm text-text-muted">
                  {attention.slice(0, 2).map((d) => d.title).join(', ')}
                  {attention.length > 2 ? ` +${attention.length - 2}` : ''}
                </span>
              </span>
              <ChevronRight size={18} strokeWidth={2} className="text-text-faint" />
            </button>
          )}

          <DriveFoldersBar />

          <ChipRow className="mb-2">
            <Chip active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>
              All <span className="opacity-60">{all.length}</span>
            </Chip>
            {attention.length > 0 && (
              <Chip active={filter.kind === 'expiring'} onClick={() => setFilter({ kind: 'expiring' })}>
                <AlertTriangle size={14} strokeWidth={2} /> Expiring
              </Chip>
            )}
            {driveCount > 0 && (
              <Chip active={filter.kind === 'drive'} onClick={() => setFilter({ kind: 'drive' })}>
                <GoogleIcon size={14} /> Drive <span className="opacity-60">{driveCount}</span>
              </Chip>
            )}
            {categories.map((c) => (
              <Chip
                key={c.name}
                active={filter.kind === 'category' && filter.value === c.name}
                color={c.color}
                onClick={() => setFilter({ kind: 'category', value: c.name })}
              >
                <c.icon size={14} strokeWidth={2} /> {c.name} <span className="opacity-60">{c.count}</span>
              </Chip>
            ))}
          </ChipRow>
          {owners.length > 1 && (
            <ChipRow className="mb-4">
              {owners.map((o) => (
                <Chip
                  key={o}
                  active={filter.kind === 'owner' && filter.value === o}
                  onClick={() => setFilter(filter.kind === 'owner' && filter.value === o ? { kind: 'all' } : { kind: 'owner', value: o })}
                  className="!h-8 !text-[0.8125rem]"
                >
                  <User size={13} strokeWidth={2} /> {o}
                </Chip>
              ))}
            </ChipRow>
          )}

          {visible.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[0.9375rem] text-text-muted">{query ? `Nothing matches “${query}”.` : 'Nothing here yet.'}</p>
              {query && (
                <Link to="/" className="mt-3 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-link">
                  <Sparkles size={16} strokeWidth={2} /> Ask MyConfía to find it
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {visible.map((doc) => {
                const isSelected = selected.has(doc.id)
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onPointerDown={() => !selecting && pressStart(doc)}
                    onPointerUp={pressEnd}
                    onPointerLeave={pressEnd}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={() => {
                      if (longPressed.current) return
                      if (selecting) toggle(doc)
                      else setOpen(doc)
                    }}
                    className={`pressable relative overflow-hidden rounded-2xl border bg-bg-card text-left select-none ${
                      isSelected ? 'border-accent ring-2 ring-accent' : 'border-border'
                    }`}
                  >
                    <DocThumb doc={doc} className="aspect-[4/3] w-full" />
                    {selecting && (
                      <span
                        className={`absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          isSelected ? 'border-accent bg-accent text-accent-contrast' : 'border-white bg-black/25'
                        }`}
                      >
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </span>
                    )}
                    <div className="p-3">
                      <p className="line-clamp-2 text-[0.9375rem] leading-snug font-medium">{doc.title}</p>
                      <p className="mt-0.5 truncate text-[0.8125rem] text-text-muted">
                        {doc.category}
                        {doc.owner && doc.owner !== 'Me' ? ` · ${doc.owner}` : ''}
                      </p>
                      {needsAttention(doc) && (
                        <div className="mt-1.5 [&>span]:!px-2 [&>span]:!py-0.5 [&>span]:!text-xs">
                          <ExpiryBadge date={doc.expiry_date} />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Bulk actions - pinned above the tab bar while selecting. */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-[480px] px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-bg-card p-2 shadow-card">
            <span className="flex-1 pl-2 text-[0.9375rem] font-medium">
              {selected.size ? `${selected.size} selected` : 'Tap to select'}
            </span>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete selected"
              className="pressable flex h-11 w-11 items-center justify-center rounded-xl text-danger disabled:opacity-30"
            >
              <Trash2 size={19} strokeWidth={2} />
            </button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => runDownload(selectedDocs)}
              aria-label="Download selected"
              className="pressable flex h-11 w-11 items-center justify-center rounded-xl text-text disabled:opacity-30"
            >
              <Download size={19} strokeWidth={2} />
            </button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => runShare(selectedDocs)}
              className="pressable flex h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-[0.9375rem] font-medium text-accent-contrast disabled:opacity-30"
            >
              <Share2 size={17} strokeWidth={2} /> Share
            </button>
          </div>
        </div>
      )}

      {open && <DocumentSheet doc={all.find((d) => d.id === open.id) ?? open} onClose={() => setOpen(null)} />}
      {uploading && <UploadSheet onClose={() => setUploading(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${selected.size} document${selected.size === 1 ? '' : 's'}?`}
          message="The selected files will be permanently deleted."
          confirmLabel="Delete"
          busy={del.isPending}
          busyLabel="Deleting…"
          onConfirm={() =>
            del.mutate([...selected], {
              onSuccess: (ids) => {
                setConfirmDelete(false)
                exitSelect()
                toast(`Deleted ${ids.length}`)
              },
            })
          }
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
