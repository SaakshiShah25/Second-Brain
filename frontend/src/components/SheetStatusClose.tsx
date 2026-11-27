import { Check, X } from 'lucide-react'

// The top-right corner of a panel whose changes save as they are made: how the last change went, then the ✕. There is
// deliberately no "Save" button anywhere on such a panel - with nothing left to save, one only makes people wonder
// whether they must press it.
export default function SheetStatusClose({ saving, saved, failed, onClose }: { saving: boolean; saved: boolean; failed: boolean; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span role="status" className={`flex items-center gap-1 text-[0.8125rem] font-semibold ${failed ? 'text-danger' : saving ? 'text-text-faint' : 'text-success'}`}>
        {failed ? (
          'Not saved'
        ) : saving ? (
          'Saving…'
        ) : saved ? (
          <>
            <Check size={15} strokeWidth={2.8} /> Saved
          </>
        ) : null}
      </span>
      <button type="button" onClick={onClose} aria-label="Close" className="pressable -my-1.5 -mr-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-text-muted lg:hover:bg-bg-hover">
        <X size={19} strokeWidth={2} />
      </button>
    </div>
  )
}
