import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Plus, Trash2, Upload, X } from 'lucide-react'
import { useClients, useConfirmAgreement, useUploadAgreement } from '../api/clients'
import type { AgreementExtracted, ExpiryState, Signatory } from '../api/types'
import Button from '../components/Button'
import Card from '../components/Card'
import { Input, Label, Textarea } from '../components/fields'

const EXPIRY_BADGE: Record<ExpiryState, string> = {
  active: 'border-success/40 bg-success/10 text-success',
  expiring_soon: 'border-amber-400/40 bg-amber-400/10 text-amber-500',
  expired: 'border-danger/40 bg-danger/10 text-danger',
  terminated: 'border-border-strong bg-bg-card text-text-muted',
}

const EXPIRY_LABEL: Record<ExpiryState, string> = {
  active: 'Active',
  expiring_soon: 'Renewal due soon',
  expired: 'Expired',
  terminated: 'Terminated',
}

interface FormState {
  company: string
  client_legal_name: string
  provider_legal_name: string
  effective_date: string
  term_months: string
  end_date: string
  auto_renews: boolean
  renewal_notice_days: string
  fee_amount: string
  fee_currency: string
  fee_frequency: string
  payment_terms: string
  termination_terms: string
  other_terms: string
  signatories: Signatory[]
}

function toFormState(extracted: AgreementExtracted): FormState {
  return {
    company: extracted.client_company,
    client_legal_name: extracted.client_legal_name,
    provider_legal_name: extracted.provider_legal_name,
    effective_date: extracted.effective_date ?? '',
    term_months: extracted.term_months?.toString() ?? '',
    end_date: extracted.end_date ?? '',
    auto_renews: extracted.auto_renews,
    renewal_notice_days: extracted.renewal_notice_days?.toString() ?? '',
    fee_amount: extracted.fee_amount?.toString() ?? '',
    fee_currency: extracted.fee_currency,
    fee_frequency: extracted.fee_frequency,
    payment_terms: extracted.payment_terms,
    termination_terms: extracted.termination_terms,
    other_terms: extracted.other_terms,
    signatories: extracted.signatories,
  }
}

function numOrNull(v: string): number | null {
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isNaN(n) ? null : n
}

export default function ClientsPage() {
  const { data: clients, isLoading, error } = useClients()
  const upload = useUploadAgreement()
  const confirm = useConfirmAgreement()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState | null>(null)
  const [pendingFile, setPendingFile] = useState<{ file_base64: string; filename: string; content_type: string } | null>(
    null,
  )

  async function handleFileSelected(file: File) {
    upload.reset()
    const result = await upload.mutateAsync(file)
    setForm(toFormState(result.extracted))
    setPendingFile({ file_base64: result.file_base64, filename: result.filename, content_type: result.content_type })
  }

  function updateSignatory(index: number, patch: Partial<Signatory>) {
    if (!form) return
    const next = form.signatories.map((s, i) => (i === index ? { ...s, ...patch } : s))
    setForm({ ...form, signatories: next })
  }

  function removeSignatory(index: number) {
    if (!form) return
    setForm({ ...form, signatories: form.signatories.filter((_, i) => i !== index) })
  }

  function addSignatory() {
    if (!form) return
    setForm({ ...form, signatories: [...form.signatories, { name: '', role: '', side: 'client' }] })
  }

  async function handleSave() {
    if (!form) return
    await confirm.mutateAsync({
      company: form.company,
      client_legal_name: form.client_legal_name,
      provider_legal_name: form.provider_legal_name,
      effective_date: form.effective_date || null,
      term_months: numOrNull(form.term_months),
      end_date: form.end_date || null,
      auto_renews: form.auto_renews,
      renewal_notice_days: numOrNull(form.renewal_notice_days),
      fee_amount: numOrNull(form.fee_amount),
      fee_currency: form.fee_currency,
      fee_frequency: form.fee_frequency,
      payment_terms: form.payment_terms,
      termination_terms: form.termination_terms,
      other_terms: form.other_terms,
      signatories: form.signatories.filter((s) => s.name.trim()),
      ...(pendingFile ?? {}),
    })
    setForm(null)
    setPendingFile(null)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Briefcase size={22} strokeWidth={2} className="text-accent" /> Clients
        </h1>
        <Button variant="primary" onClick={() => fileInputRef.current?.click()} disabled={upload.isPending}>
          <span className="flex items-center gap-1.5">
            <Upload size={15} strokeWidth={2} /> {upload.isPending ? 'Reading document…' : 'Upload agreement'}
          </span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
        />
      </div>

      {upload.isError && <p className="mb-4 text-sm text-danger">{String(upload.error)}</p>}
      {confirm.isError && <p className="mb-4 text-sm text-danger">{String(confirm.error)}</p>}

      {form && (
        <Card className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Review extracted details before saving</p>
            <button
              type="button"
              onClick={() => {
                setForm(null)
                setPendingFile(null)
              }}
              className="text-text-muted hover:text-text"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Client company</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <Label>Client legal name</Label>
              <Input
                value={form.client_legal_name}
                onChange={(e) => setForm({ ...form, client_legal_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Provider legal name</Label>
              <Input
                value={form.provider_legal_name}
                onChange={(e) => setForm({ ...form, provider_legal_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Effective date</Label>
              <Input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Term (months)</Label>
              <Input
                type="number"
                value={form.term_months}
                onChange={(e) => setForm({ ...form, term_months: e.target.value })}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                id="auto_renews"
                type="checkbox"
                checked={form.auto_renews}
                onChange={(e) => setForm({ ...form, auto_renews: e.target.checked })}
              />
              <label htmlFor="auto_renews" className="text-sm text-text">
                Auto-renews
              </label>
            </div>
            <div>
              <Label>Renewal notice (days)</Label>
              <Input
                type="number"
                value={form.renewal_notice_days}
                onChange={(e) => setForm({ ...form, renewal_notice_days: e.target.value })}
              />
            </div>
            <div>
              <Label>Fee amount</Label>
              <Input type="number" value={form.fee_amount} onChange={(e) => setForm({ ...form, fee_amount: e.target.value })} />
            </div>
            <div>
              <Label>Fee currency</Label>
              <Input value={form.fee_currency} onChange={(e) => setForm({ ...form, fee_currency: e.target.value })} />
            </div>
            <div>
              <Label>Fee frequency</Label>
              <select
                value={form.fee_frequency}
                onChange={(e) => setForm({ ...form, fee_frequency: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-bg-card px-3 py-2 text-sm"
              >
                <option value="">—</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="one-time">One-time</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <Label>Payment terms</Label>
            <Textarea
              rows={2}
              value={form.payment_terms}
              onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
            />
          </div>
          <div className="mt-3">
            <Label>Termination terms</Label>
            <Textarea
              rows={2}
              value={form.termination_terms}
              onChange={(e) => setForm({ ...form, termination_terms: e.target.value })}
            />
          </div>
          <div className="mt-3">
            <Label>Other notable terms</Label>
            <Textarea rows={2} value={form.other_terms} onChange={(e) => setForm({ ...form, other_terms: e.target.value })} />
          </div>

          <div className="mt-3">
            <Label>Signatories</Label>
            <div className="flex flex-col gap-2">
              {form.signatories.map((sig, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Name"
                    value={sig.name}
                    onChange={(e) => updateSignatory(i, { name: e.target.value })}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Role"
                    value={sig.role}
                    onChange={(e) => updateSignatory(i, { role: e.target.value })}
                    className="flex-1"
                  />
                  <select
                    value={sig.side}
                    onChange={(e) => updateSignatory(i, { side: e.target.value as Signatory['side'] })}
                    className="rounded-lg border border-border-strong bg-bg-card px-2 py-2 text-sm"
                  >
                    <option value="client">Client</option>
                    <option value="provider">Provider</option>
                  </select>
                  <button type="button" onClick={() => removeSignatory(i)} className="text-text-muted hover:text-danger">
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              ))}
              <Button type="button" onClick={addSignatory} className="self-start">
                <span className="flex items-center gap-1.5">
                  <Plus size={14} strokeWidth={2} /> Add signatory
                </span>
              </Button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={handleSave} disabled={confirm.isPending || !form.company.trim()}>
              {confirm.isPending ? 'Saving…' : 'Save client'}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setForm(null)
                setPendingFile(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-danger">Couldn't load clients: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && clients?.length === 0 && !form && (
        <p className="text-sm text-text-muted">
          No clients yet — upload a finalized agreement to get started.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {clients?.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`}>
            <Card className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.company}</p>
                <p className="truncate text-xs text-text-muted">
                  {[
                    c.effective_date && `Effective ${c.effective_date}`,
                    c.end_date && `ends ${c.end_date}`,
                    c.fee_amount != null && `${c.fee_currency} ${c.fee_amount}${c.fee_frequency ? `/${c.fee_frequency}` : ''}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <span
                className={`flex-shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${EXPIRY_BADGE[c.expiry_state]}`}
              >
                {EXPIRY_LABEL[c.expiry_state]}
              </span>
              <span className="text-text-faint">›</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
