import { useState } from 'react'
import { Check } from 'lucide-react'
import { useReportAnswer, type ReportReason } from '../../api/reports'
import Button from '../Button'
import { Textarea } from '../fields'

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'incorrect', label: 'Incorrect or made up' },
  { value: 'offensive', label: 'Offensive or unsafe' },
  { value: 'irrelevant', label: "Doesn't answer what I asked" },
  { value: 'other', label: 'Something else' },
]

interface ReportDialogProps {
  kind: 'answer' | 'capture'
  question: string
  answer: string
  sourceIds: number[]
  onClose: () => void
  // Fired once the report has actually been saved, so the bubble can swap
  // its Report button for a "Reported" label.
  onSent: () => void
}

// Flag an AI-generated reply. The report carries the question and the
// reply itself (not just "this was bad") so whoever reviews it can see
// what actually went wrong - which is also why sending it states plainly
// what gets shared.
export default function ReportDialog({ kind, question, answer, sourceIds, onClose, onSent }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason>('incorrect')
  const [details, setDetails] = useState('')
  const report = useReportAnswer()

  function send() {
    report.mutate(
      { kind, reason, question, answer, details: details.trim(), source_interaction_ids: sourceIds },
      { onSuccess: onSent },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={report.isPending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="w-full max-w-sm rounded-xl border border-border-strong bg-bg-elevated p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {report.isSuccess ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-success">
              <Check size={18} strokeWidth={2} />
              <h3 id="report-dialog-title" className="text-base font-semibold text-text">
                Thanks - report sent
              </h3>
            </div>
            <p className="mb-4 text-sm text-text-muted">
              It helps improve the answers. We review reports and fix what we find.
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 id="report-dialog-title" className="mb-1 text-base font-semibold">
              Report this response
            </h3>
            <p className="mb-3 text-sm text-text-muted">What's wrong with it?</p>
            <div role="radiogroup" aria-label="Reason" className="mb-3 flex flex-col gap-1.5">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    reason === r.value
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-border-strong text-text-muted hover:text-text'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-accent"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <Textarea
              id="report-details"
              rows={2}
              maxLength={1000}
              placeholder="Anything else we should know? (optional)"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <p className="mt-2 text-[11px] leading-snug text-text-faint">
              Sends your question and this response to us for review. It's stored encrypted and only used to
              improve answers.
            </p>
            {report.isError && (
              <p className="mt-2 text-xs text-danger">
                {report.error instanceof Error ? report.error.message : "Couldn't send the report."}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={onClose} disabled={report.isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={send} disabled={report.isPending}>
                {report.isPending ? 'Sending…' : 'Send report'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
