import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, ExternalLink, FileText, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useClient, useClientDocumentUrl, useDeleteClient, useExtendClient, useUpdateClient } from '../api/clients'
import type { ExpiryState } from '../api/types'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
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

interface ClientForm {
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
  status: string
}

function numOrNull(v: string): number | null {
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isNaN(n) ? null : n
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-text">{value}</p>
    </div>
  )
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const id = Number(clientId)
  const navigate = useNavigate()

  const { data: client, isLoading, error } = useClient(id)
  const updateClient = useUpdateClient(id)
  const deleteClient = useDeleteClient()
  const extendClient = useExtendClient(id)
  const documentUrl = useClientDocumentUrl(id, Boolean(client?.document_path))

  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<ClientForm | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isExtending, setIsExtending] = useState(false)
  const [extendMonths, setExtendMonths] = useState('1')

  useEffect(() => {
    if (client) {
      setForm({
        company: client.company,
        client_legal_name: client.client_legal_name,
        provider_legal_name: client.provider_legal_name,
        effective_date: client.effective_date ?? '',
        term_months: client.term_months?.toString() ?? '',
        end_date: client.end_date ?? '',
        auto_renews: client.auto_renews,
        renewal_notice_days: client.renewal_notice_days?.toString() ?? '',
        fee_amount: client.fee_amount?.toString() ?? '',
        fee_currency: client.fee_currency,
        fee_frequency: client.fee_frequency,
        payment_terms: client.payment_terms,
        termination_terms: client.termination_terms,
        other_terms: client.other_terms,
        status: client.status,
      })
    }
  }, [client])

  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>
  if (error || !client) return <p className="text-sm text-danger">Couldn't load this client.</p>

  function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    updateClient.mutate(
      {
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
        status: form.status,
      },
      { onSuccess: () => setIsEditing(false) },
    )
  }

  function handleDelete() {
    deleteClient.mutate(id, { onSuccess: () => navigate('/clients') })
  }

  const feeLine = [
    client.fee_amount != null && `${client.fee_currency} ${client.fee_amount}`,
    client.fee_frequency && `(${client.fee_frequency})`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <Button onClick={() => navigate('/clients')} className="mb-4">
        <span className="flex items-center gap-1.5">
          <ArrowLeft size={14} strokeWidth={2} /> Back to Clients
        </span>
      </Button>

      {!isEditing ? (
        <>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{client.company}</h1>
              {client.client_legal_name && <p className="text-sm text-text-muted">{client.client_legal_name}</p>}
            </div>
            <span
              className={`flex-shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium ${EXPIRY_BADGE[client.expiry_state]}`}
            >
              {EXPIRY_LABEL[client.expiry_state]}
            </span>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button onClick={() => setIsEditing(true)}>
              <span className="flex items-center gap-1.5">
                <Pencil size={14} strokeWidth={2} /> Edit
              </span>
            </Button>
            {client.document_path && (
              <a
                href={documentUrl.data?.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!documentUrl.data}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  documentUrl.data
                    ? 'border-border-strong bg-bg-card text-text hover:border-accent hover:text-accent'
                    : 'pointer-events-none cursor-not-allowed border-border-strong bg-bg-card text-text-faint opacity-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <FileText size={14} strokeWidth={2} />
                  {documentUrl.isLoading ? 'Loading…' : 'View original document'}
                  <ExternalLink size={12} strokeWidth={2} />
                </span>
              </a>
            )}
            <Button onClick={() => setIsExtending((v) => !v)}>
              <span className="flex items-center gap-1.5">
                <CalendarPlus size={14} strokeWidth={2} /> Extend contract
              </span>
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <span className="flex items-center gap-1.5">
                <Trash2 size={14} strokeWidth={2} /> Delete
              </span>
            </Button>
          </div>

          {isExtending && (
            <Card className="mb-6 flex flex-wrap items-end gap-2">
              <div>
                <Label>Extend by (months)</Label>
                <Input
                  type="number"
                  min={1}
                  value={extendMonths}
                  onChange={(e) => setExtendMonths(e.target.value)}
                  className="w-32"
                />
              </div>
              <Button
                variant="primary"
                disabled={extendClient.isPending || !Number(extendMonths)}
                onClick={() =>
                  extendClient.mutate(Number(extendMonths), {
                    onSuccess: () => setIsExtending(false),
                  })
                }
              >
                {extendClient.isPending ? 'Extending…' : 'Confirm extension'}
              </Button>
              <Button type="button" onClick={() => setIsExtending(false)}>
                Cancel
              </Button>
              <p className="w-full text-xs text-text-muted">
                New end date will be {client.end_date ?? client.effective_date ?? 'today'} + {extendMonths || 0} month
                {extendMonths === '1' ? '' : 's'}.
              </p>
            </Card>
          )}

          <Card className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Provider legal name" value={client.provider_legal_name} />
            <Field label="Effective date" value={client.effective_date} />
            <Field label="Term" value={client.term_months ? `${client.term_months} months` : null} />
            <Field label="End date" value={client.end_date} />
            <Field label="Auto-renews" value={client.auto_renews ? 'Yes' : null} />
            <Field
              label="Renewal notice"
              value={client.renewal_notice_days ? `${client.renewal_notice_days} days` : null}
            />
            <Field label="Fee" value={feeLine || null} />
            <Field label="Payment terms" value={client.payment_terms} />
            <Field label="Termination terms" value={client.termination_terms} />
            <Field label="Other terms" value={client.other_terms} />
          </Card>

          {client.signatories.length > 0 && (
            <>
              <h2 className="mb-3 text-lg font-semibold">Signatories</h2>
              <div className="mb-6 flex flex-col gap-2">
                {client.signatories.map((sig) => (
                  <Card key={sig.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {sig.person ? <Link to={`/people/${sig.person.id}`} className="hover:text-accent">{sig.name}</Link> : sig.name}
                      </p>
                      {sig.role && <p className="text-xs text-text-muted">{sig.role}</p>}
                    </div>
                    <span className="text-xs text-text-muted">{sig.side === 'client' ? 'Client side' : 'Provider side'}</span>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        form && (
          <Card className="mb-6">
            <form onSubmit={handleSave} className="flex flex-col gap-3">
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
                    id="auto_renews_edit"
                    type="checkbox"
                    checked={form.auto_renews}
                    onChange={(e) => setForm({ ...form, auto_renews: e.target.checked })}
                  />
                  <label htmlFor="auto_renews_edit" className="text-sm text-text">
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
                  <Input
                    type="number"
                    value={form.fee_amount}
                    onChange={(e) => setForm({ ...form, fee_amount: e.target.value })}
                  />
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
                <div>
                  <Label>Status</Label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-lg border border-border-strong bg-bg-card px-3 py-2 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Payment terms</Label>
                <Textarea
                  rows={2}
                  value={form.payment_terms}
                  onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
                />
              </div>
              <div>
                <Label>Termination terms</Label>
                <Textarea
                  rows={2}
                  value={form.termination_terms}
                  onChange={(e) => setForm({ ...form, termination_terms: e.target.value })}
                />
              </div>
              <div>
                <Label>Other notable terms</Label>
                <Textarea
                  rows={2}
                  value={form.other_terms}
                  onChange={(e) => setForm({ ...form, other_terms: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={updateClient.isPending}>
                  {updateClient.isPending ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this client?"
          message={`This will remove ${client.company}'s record and original document. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
