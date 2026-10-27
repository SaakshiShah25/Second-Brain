import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Camera, Check, FileUp, Loader2, RotateCw } from 'lucide-react'
import { uploadDocument, useDocuments } from '../../api/documents'
import { startGoogleConnect, useGoogleStatus } from '../../api/google'
import DriveFolderPicker from '../google/DriveFolderPicker'
import GoogleIcon from '../google/GoogleIcon'
import { toast } from '../Toast'
import type { DocumentItem } from '../../api/types'
import { categoryStyle } from '../../lib/documentCategories'
import Button from '../Button'
import { ListGroup, ListRow } from '../ListGroup'
import Sheet from '../Sheet'
import DocThumb from './DocThumb'
import DocumentSheet from './DocumentSheet'

const ACCEPT = 'image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv'
const MAX_BYTES = 15 * 1024 * 1024
const PARALLEL = 3

type Item = { key: string; file: File; status: 'queued' | 'uploading' | 'done' | 'error'; doc?: DocumentItem; error?: string }

// Drop files in, they file themselves: each upload is read by the AI on
// the server (title, category, whose, expiry) and appears here as it
// lands, so a wrong guess can be fixed with one tap right away - or just
// hit Done and fix it later from the Docs tab.
export default function UploadSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [editing, setEditing] = useState<DocumentItem | null>(null)
  const [pickingDrive, setPickingDrive] = useState(false)
  const { data: google } = useGoogleStatus()
  const running = useRef(0)

  function add(files: FileList | null) {
    if (!files?.length) return
    const next: Item[] = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      file,
      status: file.size > MAX_BYTES ? 'error' : 'queued',
      error: file.size > MAX_BYTES ? 'Too large — 15 MB max' : undefined,
    }))
    setItems((prev) => [...prev, ...next])
  }

  // Simple worker pool: keep up to PARALLEL uploads in flight.
  useEffect(() => {
    const queued = items.filter((i) => i.status === 'queued')
    if (!queued.length || running.current >= PARALLEL) return
    for (const item of queued.slice(0, PARALLEL - running.current)) {
      running.current += 1
      setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'uploading' } : i)))
      uploadDocument(item.file)
        .then((doc) => {
          setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'done', doc } : i)))
          queryClient.setQueryData<DocumentItem[]>(['documents'], (prev) => (prev ? [doc, ...prev] : [doc]))
        })
        .catch((e) =>
          setItems((prev) =>
            prev.map((i) => (i.key === item.key ? { ...i, status: 'error', error: e instanceof Error ? e.message : 'Upload failed' } : i)),
          ),
        )
        .finally(() => {
          running.current -= 1
          setItems((prev) => [...prev]) // nudge the pool
        })
    }
  }, [items, queryClient])

  // Keep each row's shown details in step with edits made in DocumentSheet.
  const { data: docs } = useDocuments()
  const latest = (doc: DocumentItem) => docs?.find((d) => d.id === doc.id) ?? doc

  const busy = items.some((i) => i.status === 'queued' || i.status === 'uploading')
  const doneCount = items.filter((i) => i.status === 'done').length

  return (
    <>
      <Sheet onClose={busy ? undefined : onClose} title={items.length ? 'Adding documents' : 'Add documents'} tall>
        {items.length === 0 ? (
          <>
            <p className="mb-4 text-[0.9375rem] leading-relaxed text-text-muted">
              Add IDs, statements, contracts, decks — anything. They’re encrypted, then named and sorted for you
              automatically.
            </p>
            <ListGroup>
              <ListRow
                icon={Camera}
                label="Take a photo"
                detail="Snap a card or a paper document"
                chevron
                onClick={() => cameraInput.current?.click()}
              />
              <ListRow
                icon={FileUp}
                iconColor="#2563eb"
                label="Choose files"
                detail="PDFs, photos, Word, PowerPoint, Excel · up to 15 MB each"
                chevron
                onClick={() => fileInput.current?.click()}
              />
              {google?.configured && (
                <ListRow
                  leading={<GoogleIcon size={18} />}
                  label="Add a Google Drive folder"
                  detail={google.features.includes('drive') ? 'Files are sorted here and kept in sync' : 'Connect Google Drive first — one tap'}
                  chevron
                  onClick={() =>
                    google.features.includes('drive')
                      ? setPickingDrive(true)
                      : startGoogleConnect(['drive'], 'documents').catch((e) =>
                          toast(e instanceof Error ? e.message : "Couldn't start the connection"),
                        )
                  }
                />
              )}
            </ListGroup>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-text-muted">
              {busy
                ? `Reading and filing ${items.length - doneCount} of ${items.length}…`
                : `${doneCount} added. Tap any to fix its name or category.`}
            </p>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
              {items.map((item) => {
                const doc = item.doc ? latest(item.doc) : null
                const cat = doc ? categoryStyle(doc.category) : null
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={!doc}
                    onClick={() => doc && setEditing(doc)}
                    className="pressable flex w-full items-center gap-3 px-3.5 py-3 text-left disabled:opacity-100"
                  >
                    {doc ? (
                      <DocThumb doc={doc} className="h-12 w-12 flex-shrink-0 rounded-xl" iconSize={20} />
                    ) : (
                      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated text-text-muted">
                        {item.status === 'error' ? (
                          <AlertCircle size={20} className="text-danger" />
                        ) : (
                          <Loader2 size={20} className="animate-spin" />
                        )}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">{doc ? doc.title : item.file.name}</span>
                      <span className="block truncate text-[0.8125rem] text-text-muted">
                        {doc && cat ? (
                          <>
                            <span style={{ color: cat.color }}>{doc.category}</span>
                            {doc.owner ? ` · ${doc.owner}` : ''}
                          </>
                        ) : item.status === 'error' ? (
                          <span className="text-danger">{item.error}</span>
                        ) : item.status === 'uploading' ? (
                          'Reading and filing…'
                        ) : (
                          'Waiting…'
                        )}
                      </span>
                    </span>
                    {doc && <Check size={18} strokeWidth={2.4} className="flex-shrink-0 text-success" />}
                    {item.status === 'error' && item.file.size <= MAX_BYTES && (
                      <span
                        role="button"
                        aria-label="Retry"
                        onClick={(e) => {
                          e.stopPropagation()
                          setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'queued', error: undefined } : i)))
                        }}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-link"
                      >
                        <RotateCw size={17} strokeWidth={2} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={() => fileInput.current?.click()}>
                Add more
              </Button>
              <Button variant="primary" className="flex-1" disabled={busy} onClick={onClose}>
                {busy ? 'Working…' : 'Done'}
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => {
        add(e.target.files)
        e.target.value = ''
      }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
        add(e.target.files)
        e.target.value = ''
      }} />

      {editing && <DocumentSheet doc={latest(editing)} onClose={() => setEditing(null)} />}
      {pickingDrive && <DriveFolderPicker onClose={() => setPickingDrive(false)} onAdded={onClose} />}
    </>
  )
}
