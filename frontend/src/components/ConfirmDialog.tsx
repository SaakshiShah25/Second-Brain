import Button from './Button'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  // While true: both buttons disable, the confirm button's label swaps to
  // busyLabel, and the backdrop no longer dismisses on click. Without
  // this, every caller closed the dialog the instant Confirm was clicked
  // and fired its mutation into the void - for anything slower than
  // instant (deleting a person cascades across their interactions and
  // tasks server-side) that left no visible sign the click did anything
  // at all until it finished, which read as "did this actually work?".
  // Callers now keep the dialog mounted and pass the mutation's own
  // isPending straight through instead of closing immediately.
  busy?: boolean
  busyLabel?: string
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  busy = false,
  busyLabel = 'Working…',
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border-strong bg-bg-elevated p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-base font-semibold">{title}</h3>
        <p className="mb-4 text-sm text-text-muted">{message}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
