import { useEffect, useState } from 'react'
import { CalendarClock, Download, ExternalLink, Pencil, Share2, Trash2, User } from 'lucide-react'
import GoogleIcon from '../google/GoogleIcon'
import { useDeleteDocuments, useUpdateDocument } from '../../api/documents'
import type { DocumentItem } from '../../api/types'
import { friendlyDate } from '../../lib/dates'
import { categoryStyle, daysUntil, DOCUMENT_CATEGORIES, EXPIRING_SOON_DAYS, formatSize } from '../../lib/documentCategories'
import { runDownload, runShare } from '../../lib/documentActions'
import { openDocument, prefetch } from '../../lib/documentShare'
import Button from '../Button'
import ConfirmDialog from '../ConfirmDialog'
import Sheet from '../Sheet'
import { toast } from '../Toast'
import { Input, Label, Select, Textarea } from '../fields'
import DocThumb from './DocThumb'

export function ExpiryBadge({ date }: { date: string | null }) {
  const days = daysUntil(date)
  if (days === null) return null
  const expired = days < 0
  const soon = !expired && days <= EXPIRING_SOON_DAYS
  const label = expired ? `Expired ${friendlyDate(date)}` : soon ? `Expires in ${days} day${days === 1 ? '' : 's'}` : `Valid till ${friendlyDate(date)}`
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.8125rem] font-medium ${
        expired ? 'bg-danger/12 text-danger' : soon ? 'bg-brand-soft text-brand-ink' : 'bg-bg-elevated text-text-muted'
      }`}
    >
      <CalendarClock size={13} strokeWidth={2} /> {label}
    </span>
  )
}

// One document: big preview, the one-tap actions people actually need
// (Share to WhatsApp/Mail via the system sheet, Download, Open), and its
// details - with Edit for when the AI filed it wrong.
export default function DocumentSheet({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const update = useUpdateDocument()
  const del = useDeleteDocuments()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState({
    title: doc.title,
    category: doc.category,
    owner: doc.owner ?? '',
    expiry_date: doc.expiry_date ?? '',
    description: doc.description ?? '',
  })
  const cat = categoryStyle(doc.category)

  useEffect(() => prefetch([doc]), [doc])

  function save() {
    update.mutate(
      {
        id: doc.id,
        fields: {
          title: form.title.trim() || doc.title,
          category: form.category,
          owner: form.owner.trim() || null,
          expiry_date: form.expiry_date || '',
          description: form.description,
        },
      },
      {
        onSuccess: () => {
          setEditing(false)
          toast('Saved')
        },
      },
    )
  }

  return (
    <Sheet onClose={update.isPending || del.isPending ? undefined : onClose} tall>
      {!editing ? (
        <>
          <button
            type="button"
            onClick={() => openDocument(doc).catch(() => toast("Couldn't open this file"))}
            className="pressable mb-4 block w-full overflow-hidden rounded-2xl border border-border"
            aria-label="Open file"
          >
            <DocThumb doc={doc} className="h-52 w-full" iconSize={48} />
          </button>

          <div className="mb-2 flex items-start gap-2">
            <h2 className="min-w-0 flex-1 font-display text-[1.5rem] leading-tight font-semibold tracking-[-0.03em]">{doc.title}</h2>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit details"
              className="pressable -mr-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-link"
            >
              <Pencil size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.8125rem] font-medium"
              style={{ backgroundColor: `${cat.color}1a`, color: cat.color }}
            >
              <cat.icon size={13} strokeWidth={2} /> {doc.category}
            </span>
            {doc.owner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-elevated px-2.5 py-1 text-[0.8125rem] font-medium text-text-muted">
                <User size={13} strokeWidth={2} /> {doc.owner}
              </span>
            )}
            <ExpiryBadge date={doc.expiry_date} />
            {doc.drive_url && (
              <a
                href={doc.drive_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-bg-elevated px-2.5 py-1 text-[0.8125rem] font-medium text-link"
              >
                <GoogleIcon size={12} /> View in Drive
              </a>
            )}
          </div>

          {doc.description && <p className="mb-5 text-[0.9375rem] leading-relaxed text-text-muted">{doc.description}</p>}

          <div className="mb-6 grid grid-cols-3 gap-2">
            <Button variant="primary" className="!h-auto flex-col !gap-1 !rounded-2xl py-3" onClick={() => runShare([doc])}>
              <Share2 size={20} strokeWidth={2} /> <span className="text-sm">Share</span>
            </Button>
            <Button className="!h-auto flex-col !gap-1 !rounded-2xl py-3" onClick={() => runDownload([doc])}>
              <Download size={20} strokeWidth={2} /> <span className="text-sm">Download</span>
            </Button>
            <Button
              className="!h-auto flex-col !gap-1 !rounded-2xl py-3"
              onClick={() => openDocument(doc).catch(() => toast("Couldn't open this file"))}
            >
              <ExternalLink size={20} strokeWidth={2} /> <span className="text-sm">Open</span>
            </Button>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {[
              ['File', doc.file_name],
              ['Size', formatSize(doc.size_bytes)],
              ['Added', friendlyDate(doc.created_at.slice(0, 10))],
              ...(doc.issue_date ? [['Issued', friendlyDate(doc.issue_date)]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-[0.9375rem]">
                <span className="text-text-muted">{k}</span>
                <span className="min-w-0 truncate text-right">{v}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="pressable mt-5 flex w-full items-center justify-center gap-1.5 py-3 text-[0.9375rem] font-medium text-danger"
          >
            <Trash2 size={17} strokeWidth={2} /> {doc.source === 'gdrive' ? 'Remove from MyConfía' : 'Delete document'}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3.5">
          <h3 className="text-lg font-semibold tracking-tight">Edit details</h3>
          <div>
            <Label>Name</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Whose is it?</Label>
            <Input
              value={form.owner}
              placeholder="Me, Mum, Acme Logistics…"
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
          </div>
          <div>
            <Label>Expires on (optional)</Label>
            <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="mt-1 flex gap-2">
            <Button className="flex-1" onClick={() => setEditing(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={doc.source === 'gdrive' ? 'Remove from MyConfía?' : 'Delete this document?'}
          message={
            doc.source === 'gdrive'
              ? `“${doc.title}” stays in your Google Drive — it just won’t show up here any more.`
              : `“${doc.title}” and its file will be permanently deleted.`
          }
          confirmLabel={doc.source === 'gdrive' ? 'Remove' : 'Delete'}
          busy={del.isPending}
          busyLabel="Deleting…"
          onConfirm={() =>
            del.mutate([doc.id], {
              onSuccess: () => {
                setConfirmDelete(false)
                onClose()
                toast('Deleted')
              },
            })
          }
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Sheet>
  )
}
