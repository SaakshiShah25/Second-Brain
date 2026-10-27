import Button from './Button'
import Sheet from './Sheet'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  // While true: both buttons disable, the confirm button's label swaps to
  // busyLabel, and the scrim no longer dismisses on tap - callers keep
  // the sheet mounted and pass the mutation's own isPending through, so
  // a slow cascading delete visibly shows it's working.
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
    <Sheet onClose={busy ? undefined : onCancel}>
      <h3 className="mb-1.5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mb-6 text-[0.9375rem] leading-relaxed text-text-muted">{message}</p>
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          block
          onClick={onConfirm}
          disabled={busy}
          className="!border-transparent !bg-danger !text-white"
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
        <Button size="lg" block variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Sheet>
  )
}
