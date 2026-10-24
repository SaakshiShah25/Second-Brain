import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Folder, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  startGoogleConnect,
  useDriveFolders,
  useGoogleStatus,
  useRemoveDriveFolder,
  useSyncDriveFolder,
  type DriveFolder,
} from '../../api/google'
import { friendlyDate } from '../../lib/dates'
import Button from '../Button'
import ConfirmDialog from '../ConfirmDialog'
import Sheet from '../Sheet'
import { toast } from '../Toast'
import DriveFolderPicker from './DriveFolderPicker'
import GoogleIcon from './GoogleIcon'

function FolderSheet({ folder, onClose }: { folder: DriveFolder; onClose: () => void }) {
  const sync = useSyncDriveFolder()
  const remove = useRemoveDriveFolder()
  const [confirming, setConfirming] = useState(false)
  return (
    <Sheet onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#d97706]/15 text-[#d97706]">
          <Folder size={22} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{folder.name}</p>
          <p className="text-sm text-text-muted">
            {folder.syncing
              ? `Syncing ${folder.synced_files} of ${folder.total_files || '…'}`
              : folder.status === 'error'
                ? folder.error
                : `${folder.total_files} file${folder.total_files === 1 ? '' : 's'} · synced ${
                    folder.last_synced_at ? friendlyDate(folder.last_synced_at.slice(0, 10)).toLowerCase() : 'never'
                  }`}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          block
          disabled={folder.syncing || sync.isPending}
          onClick={() => sync.mutate(folder.id, { onSuccess: () => toast('Syncing…') })}
        >
          <RefreshCw size={17} strokeWidth={2} /> Sync now
        </Button>
        <Button size="lg" block variant="ghost" className="!text-danger" onClick={() => setConfirming(true)}>
          <Trash2 size={17} strokeWidth={2} /> Remove folder
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Remove “${folder.name}”?`}
          message="Its files leave MyConfía. Nothing is deleted from your Google Drive."
          confirmLabel="Remove"
          busy={remove.isPending}
          busyLabel="Removing…"
          onConfirm={() =>
            remove.mutate(folder.id, {
              onSuccess: () => {
                toast('Folder removed')
                onClose()
              },
            })
          }
          onCancel={() => setConfirming(false)}
        />
      )}
    </Sheet>
  )
}

// Google Drive on the Docs tab: a one-tap "Connect Drive" card until
// Drive is granted, then the linked folders with live sync progress and
// an "Add folder" pill. Hidden entirely on a server with no Google setup.
export default function DriveFoldersBar() {
  const { data: status } = useGoogleStatus()
  const hasDrive = !!status?.features.includes('drive')
  const { data: folders } = useDriveFolders(hasDrive)
  const queryClient = useQueryClient()
  const [picking, setPicking] = useState(false)
  const [open, setOpen] = useState<DriveFolder | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Refresh the document grid as a sync files more documents.
  const synced = folders?.reduce((n, f) => n + f.synced_files, 0) ?? 0
  const last = useRef(synced)
  useEffect(() => {
    if (synced !== last.current) queryClient.invalidateQueries({ queryKey: ['documents'] })
    last.current = synced
  }, [synced, queryClient])

  if (!status?.configured) return null

  if (!hasDrive) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-bg-card p-3.5">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated">
          <GoogleIcon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">Bring in Google Drive</span>
          <span className="block text-sm text-text-muted">Add folders — their files get sorted here too.</span>
        </span>
        <Button
          size="sm"
          disabled={connecting}
          onClick={() => {
            setConnecting(true)
            startGoogleConnect(['drive'], 'documents').catch((e) => {
              setConnecting(false)
              toast(e instanceof Error ? e.message : "Couldn't start the connection")
            })
          }}
        >
          {connecting ? 'Opening…' : 'Connect'}
        </Button>
      </div>
    )
  }

  return (
    <div className="mb-4">
      <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">
        <GoogleIcon size={13} /> Google Drive
      </p>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {folders?.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setOpen(f)}
            className="pressable flex h-11 flex-shrink-0 items-center gap-2 rounded-xl border border-border bg-bg-card px-3 text-sm font-medium"
          >
            {f.syncing ? (
              <Loader2 size={16} className="animate-spin text-text-muted" />
            ) : f.status === 'error' ? (
              <AlertCircle size={16} className="text-danger" />
            ) : (
              <Folder size={16} strokeWidth={1.8} className="text-[#d97706]" />
            )}
            <span className="max-w-36 truncate">{f.name}</span>
            <span className="text-xs text-text-faint">
              {f.syncing ? `${f.synced_files}/${f.total_files || '…'}` : f.total_files}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="pressable flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border-strong px-3 text-sm font-medium text-text-muted"
        >
          <Plus size={16} strokeWidth={2.2} /> Add folder
        </button>
      </div>
      {picking && <DriveFolderPicker onClose={() => setPicking(false)} />}
      {open && <FolderSheet folder={folders?.find((f) => f.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </div>
  )
}
