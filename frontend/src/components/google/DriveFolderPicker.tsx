import { useEffect, useState } from 'react'
import { ChevronRight, Folder, Loader2, Search, X } from 'lucide-react'
import { browseDrive, useAddDriveFolder, type DriveBrowse } from '../../api/google'
import Button from '../Button'
import Sheet from '../Sheet'
import { toast } from '../Toast'

// In-app Drive folder browser: drill into folders (with a breadcrumb back
// out), or search by name, then add the current folder. Everything inside
// it - and its subfolders - gets filed into Documents in the background.
export default function DriveFolderPicker({ onClose, onAdded }: { onClose: () => void; onAdded?: () => void }) {
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'My Drive' }])
  const [data, setData] = useState<DriveBrowse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const add = useAddDriveFolder()
  const current = trail[trail.length - 1]
  const searching = query.trim().length > 1

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const t = setTimeout(
      () =>
        browseDrive(current.id, searching ? query.trim() : undefined)
          .then((d) => !cancelled && setData(d))
          .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load your Drive"))
          .finally(() => !cancelled && setLoading(false)),
      searching ? 300 : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [current.id, query, searching])

  function open(folder: { id: string; name: string }) {
    setQuery('')
    setTrail((t) => [...t, folder])
  }

  function addCurrent() {
    add.mutate(current.id, {
      onSuccess: (f) => {
        toast(`Adding “${f.name}” — files will appear as they’re filed`)
        onAdded?.()
        onClose()
      },
      onError: (e) => toast(e instanceof Error ? e.message : "Couldn't add that folder"),
    })
  }

  return (
    <Sheet onClose={add.isPending ? undefined : onClose} title="Add a Google Drive folder" tall>
      <p className="mb-3 text-sm leading-relaxed text-text-muted">
        Everything in the folder (and its subfolders) is sorted into your documents and kept in sync. Files stay in
        your Drive — nothing is moved or changed.
      </p>

      <div className="relative mb-3">
        <Search size={18} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search folders"
          className="h-11 w-full rounded-xl bg-bg-elevated pr-10 pl-10 text-base text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/25 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear" className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-faint">
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {!searching && (
        <div className="no-scrollbar mb-2 flex items-center gap-1 overflow-x-auto text-sm">
          {trail.map((t, i) => (
            <span key={t.id} className="flex flex-shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-text-faint" />}
              <button
                type="button"
                disabled={i === trail.length - 1}
                onClick={() => setTrail((tr) => tr.slice(0, i + 1))}
                className={`pressable rounded-md px-1.5 py-1 ${i === trail.length - 1 ? 'font-semibold text-text' : 'text-link'}`}
              >
                {t.name}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mb-4 min-h-40 overflow-hidden rounded-2xl border border-border">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-text-muted">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-danger">{error}</p>
        ) : data && data.folders.length === 0 ? (
          <p className="p-4 text-[0.9375rem] text-text-muted">
            {searching ? 'No folders match.' : 'No folders in here — you can add this one.'}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {data?.folders.map((f) => (
              <button key={f.id} type="button" onClick={() => open(f)} className="pressable flex w-full items-center gap-3 px-4 py-3 text-left">
                <Folder size={20} strokeWidth={1.8} className="flex-shrink-0 text-[#d97706]" />
                <span className="min-w-0 flex-1 truncate text-[0.9375rem]">{f.name}</span>
                <ChevronRight size={18} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Button variant="primary" size="lg" block disabled={current.id === 'root' || add.isPending} onClick={addCurrent}>
        {add.isPending ? 'Adding…' : current.id === 'root' ? 'Open a folder to add it' : `Add “${current.name}”`}
      </Button>
    </Sheet>
  )
}
