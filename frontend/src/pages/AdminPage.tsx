import { useState, type ReactNode } from 'react'
import { AlertTriangle, Bug, Database, Download, Gauge, LifeBuoy, MessageSquareHeart, RefreshCw, TrendingUp, UserX, Users } from 'lucide-react'
import { fetchBlob } from '../api/client'
import { showError } from '../lib/errorDialog'
import { useAdminFeedback, useAdminOverview, useSetFeedbackStatus, type AdminOverview, type UserStorage } from '../api/admin'
import PageHeader from '../components/PageHeader'
import Segmented from '../components/Segmented'

// The owner's view (api/routers/admin.py): how much of today's free AI
// budget is left and what that still buys, who used what, where limits
// are being hit, and every recent error with the reference code the user
// was shown. Admins only - the list is hardcoded in api/routers/admin.py.

const shortModel = (m: string) => m.replace('openai/gpt-oss-', '').replace('cohere', 'Cohere')
const num = (n: number) => n.toLocaleString()

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

const stored = (s: UserStorage) => s.note_bytes + s.task_bytes + s.document_bytes + s.index_bytes

function when(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function Card({ icon: Icon, title, children, aside }: { icon?: typeof Gauge; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl border border-border bg-bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold">
        {Icon && <Icon size={17} strokeWidth={2} className="text-text-muted" />}
        {title}
        {aside && <span className="ml-auto text-[0.8125rem] font-normal text-text-muted">{aside}</span>}
      </h2>
      {children}
    </section>
  )
}

function Bar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100))
  const tone = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-[#d9731f]' : 'bg-success'
  return (
    <div className="h-2 overflow-hidden rounded-full bg-bg-elevated">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[0.9375rem] text-text-muted">{children}</p>
}

function Budget({ o }: { o: AdminOverview }) {
  return (
    <Card icon={Gauge} title="AI budget today" aside="resets daily">
      <div className="flex flex-col gap-3.5">
        {o.budget.map((b) => (
          <div key={b.model}>
            <div className="mb-1.5 flex items-baseline justify-between text-[0.875rem]">
              <span className="font-medium">
                {shortModel(b.model)}
                {b.blocked && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-[0.75rem] text-danger">limited now</span>}
              </span>
              <span className="text-text-muted">
                {num(b.used)} / {num(b.limit)}
              </span>
            </div>
            <Bar used={b.used} limit={b.limit} />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {o.capacity.map((c) => (
          <div key={c.action} className="rounded-xl bg-bg-elevated p-3">
            <p className="text-[1.375rem] leading-tight font-semibold">{c.left_today === null ? '-' : `≈ ${num(c.left_today)}`}</p>
            <p className="text-[0.8125rem] text-text-muted">
              more {c.action}s today
              {c.samples > 0
                ? ` · ~${num(Object.values(c.avg_tokens).reduce((a, b) => a + b, 0))} tokens each`
                : ' · no samples yet'}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.75rem] leading-snug text-text-faint">
        A forecast, not a count of what was logged: the day's remaining AI budget divided by what a capture or question has cost on average. The
        day's budget starts over at midnight UTC (5:30 AM India time), so an unused day shows the whole day's room.
      </p>
    </Card>
  )
}

// Did Groq run out, and did the NVIDIA backup take the notes instead? (nvidia_client.py, extraction.py)
function Backup({ o }: { o: AdminOverview }) {
  const f = o.fallback
  const share = f.logged > 0 ? Math.round((f.notes / f.logged) * 100) : 0
  const short = (m: string) => m.replace('nvidia/', '')
  return (
    <Card icon={LifeBuoy} title="Backup AI (NVIDIA)" aside={f.enabled ? 'on' : 'off'}>
      {!f.enabled ? (
        <Empty>Not set up: add NVIDIA_API_KEY on Render. Until then, a note Groq can't take fails with the "usage limit" message.</Empty>
      ) : (
        <>
          <p className="text-[0.9375rem]">
            <span className="text-2xl font-semibold tabular-nums">{num(f.notes)}</span>
            <span className="text-text-muted">
              {' '}
              {f.notes === 1 ? 'note' : 'notes'} went through NVIDIA{f.logged > 0 ? ` of ${num(f.logged)} logged (${share}%)` : ''}
            </span>
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[0.875rem] text-text-muted">
            <li>Groq turned a note away {num(f.groq_refused)} {f.groq_refused === 1 ? 'time' : 'times'} (out of tokens for the minute or the day).</li>
            <li className={f.failed ? 'text-danger' : ''}>
              NVIDIA also failed {num(f.failed)} {f.failed === 1 ? 'time' : 'times'}
              {f.failed && f.last_failure ? ` - last: ${f.last_failure}` : ''}.
            </li>
            {f.last_used && <li>Last used {when(f.last_used)}{f.tokens ? ` · ${num(f.tokens)} tokens in this period` : ''}.</li>}
            {f.models.map((m) => (
              <li key={m.model}>
                {short(m.model)}: {num(m.notes)} {m.notes === 1 ? 'note' : 'notes'}
              </li>
            ))}
          </ul>
          {f.notes === 0 && f.failed === 0 && <p className="mt-3 text-[0.8125rem] text-text-faint">Not needed in this period: Groq took every note.</p>}
        </>
      )}
    </Card>
  )
}

function Totals({ o }: { o: AdminOverview }) {
  const t = o.totals
  const items = [
    { label: 'active users', value: num(t.active_users) },
    { label: 'requests', value: num(t.requests) },
    { label: 'failed', value: num(t.failed_requests), bad: t.failed_requests > 0 },
    { label: 'p95 response', value: t.p95_ms ? `${(t.p95_ms / 1000).toFixed(1)}s` : '-' },
  ]
  return (
    <div className="mb-4 grid grid-cols-4 gap-2">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-border bg-bg-card px-2 py-2.5 text-center">
          <p className={`text-[1.0625rem] font-semibold ${i.bad ? 'text-danger' : ''}`}>{i.value}</p>
          <p className="text-[0.6875rem] leading-tight text-text-muted">{i.label}</p>
        </div>
      ))}
    </div>
  )
}

const PROBLEM_KIND = { error: 'failed on our side', limit: 'limit hit', refused: 'refused' } as const

// What goes wrong most often, whatever the cause: crashes, limits and requests the app turned down - so the most
// common ones get fixed first. Everything a person is shown an error for lands here.
function Problems({ o }: { o: AdminOverview }) {
  return (
    <Card icon={AlertTriangle} title="Most common problems">
      {o.problems.length === 0 ? (
        <Empty>Nothing went wrong in this period.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {o.problems.map((p) => (
            <li key={`${p.kind}-${p.what}-${p.status}`} className="py-2.5 first:pt-0 last:pb-0">
              <p className="flex items-baseline justify-between gap-2 text-[0.9375rem]">
                <span className="min-w-0 font-medium">{p.what.replaceAll('_', ' ')}</span>
                <span className="flex-shrink-0 text-[0.875rem] font-semibold">×{p.count}</span>
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-text-muted">
                {PROBLEM_KIND[p.kind]}
                {p.status ? ` · ${p.status}` : ''} · {p.users} {p.users === 1 ? 'person' : 'people'} · {when(p.last)}
              </p>
              {(p.example || p.info) && <p className="mt-0.5 text-[0.8125rem] leading-snug text-text-faint">{p.example || p.info}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Limits({ o }: { o: AdminOverview }) {
  return (
    <Card icon={AlertTriangle} title="Where limits are hit">
      {o.limits.length === 0 ? (
        <Empty>No limits hit in this period.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {o.limits.map((l) => (
            <li key={l.name}>
              <p className="flex items-baseline justify-between gap-2 text-[0.9375rem]">
                <span className="font-medium">{l.name.replaceAll('_', ' ')}</span>
                <span className="flex-shrink-0 text-[0.8125rem] text-text-muted">
                  ×{l.count} · {when(l.last)}
                </span>
              </p>
              {l.info && <p className="mt-0.5 text-[0.8125rem] leading-snug text-text-muted">{l.info}</p>}
              {l.top_users.length > 0 && <p className="mt-0.5 text-[0.8125rem] text-text-faint">{l.top_users.join(', ')}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function UsersCard({ o }: { o: AdminOverview }) {
  return (
    <Card icon={Users} title="Usage by user">
      {o.users.length === 0 ? (
        <Empty>No signed-in activity in this period.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {o.users.map((u) => (
            <li key={u.user_id} className="py-3 first:pt-0 last:pb-0">
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[0.9375rem] font-medium">{u.email}</span>
                <span className="flex-shrink-0 text-[0.8125rem] text-text-faint">{when(u.last_seen)}</span>
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-text-muted">
                {u.captures} captures · {u.questions} questions · {num(u.tokens)} tokens
                {u.errors > 0 && <span className="text-danger"> · {u.errors} errors</span>}
                {u.limits > 0 && <span className="text-[#d9731f]"> · {u.limits} limit hits</span>}
              </p>
              {Object.keys(u.by_feature).length > 0 && (
                <p className="mt-0.5 text-[0.75rem] text-text-faint">
                  {Object.entries(u.by_feature).map(([f, t]) => `${f} ${num(t)}`).join(' · ')}
                </p>
              )}
              {u.storage && (
                <p className="mt-0.5 text-[0.75rem] text-text-faint">
                  {bytes(stored(u.storage))} stored · {u.storage.notes} notes · {u.storage.documents} docs
                </p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(['capture', 'question'] as const).map((a) => {
                  const m = u.monthly[a]
                  if (!m || !m.cap) return null
                  return (
                    <div key={a}>
                      <p className="mb-1 text-[0.75rem] text-text-faint">
                        {a}s this month {m.used}/{m.cap}
                      </p>
                      <Bar used={m.used} limit={m.cap} />
                    </div>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Scale({ o }: { o: AdminOverview }) {
  if (o.scale.length === 0) return null
  return (
    <Card icon={TrendingUp} title="How far this stretches" aside={`${num(o.accounts)} accounts`}>
      <ul className="flex flex-col gap-2.5">
        {o.scale.map((s) => (
          <li key={s.model} className="flex items-baseline justify-between gap-2 text-[0.9375rem]">
            <span className="font-medium">{shortModel(s.model)}</span>
            <span className="text-right text-[0.8125rem] text-text-muted">
              ~{num(s.tokens_per_user_day)} tokens per active user a day
              {s.users_supported !== null && <> · daily limit fits ≈ {num(s.users_supported)} active users</>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.75rem] leading-snug text-text-faint">
        Based on the period selected above; the free tier's daily limit is per model.
      </p>
    </Card>
  )
}

function Storage({ o }: { o: AdminOverview }) {
  const s = o.storage
  const rows = [
    { label: 'notes', n: s.notes, b: s.note_bytes },
    { label: 'tasks', n: s.tasks, b: s.task_bytes },
    { label: 'documents', n: s.documents, b: s.document_bytes },
    { label: 'search index', n: s.index_chunks, b: s.index_bytes },
  ]
  return (
    <Card icon={Database} title="Storage" aside={s.available ? bytes(stored(s)) : undefined}>
      {!s.available ? (
        <Empty>Run scripts/migration_43_admin_storage.sql to see storage per user.</Empty>
      ) : (
        <table className="w-full text-left text-[0.8125rem]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border first:border-t-0">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-right text-text-muted">{num(r.n)}</td>
                <td className="py-1.5 text-right">{bytes(r.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function Inactive({ o }: { o: AdminOverview }) {
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      const blob = await fetchBlob('/api/admin/users.xlsx')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `myconfia-users-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }
  const days = (n: number | null) => (n === null ? '-' : n === 0 ? 'today' : `${n} ${n === 1 ? 'day' : 'days'} ago`)
  return (
    <Card icon={UserX} title="Not using it" aside={o.inactive.length ? `${o.inactive.length}` : undefined}>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="pressable mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-bg-elevated text-[0.875rem] font-medium disabled:opacity-50"
      >
        <Download size={16} strokeWidth={2} /> {busy ? 'Preparing…' : 'Download all users (Excel)'}
      </button>
      {o.inactive.length === 0 ? (
        <Empty>Every account was active in this period.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {o.inactive.map((u) => (
            <li key={u.user_id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="truncate text-[0.9375rem] font-medium">{u.email}</p>
              <p className="text-[0.8125rem] text-text-muted">
                joined {u.joined ?? '-'} ({days(u.days_since_joined)}) · {u.last_sign_in ? `last sign-in ${days(u.days_since_sign_in)}` : 'never signed in'}
                {u.storage ? ` · ${bytes(stored(u.storage))} stored` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {o.hidden_accounts > 0 && (
        <p className="mt-3 text-[0.75rem] text-text-faint">
          {o.hidden_accounts} test {o.hidden_accounts === 1 ? 'account is' : 'accounts are'} left out (…@myconfia.local, example.com). The Excel file leaves them out too.
        </p>
      )}
    </Card>
  )
}

function Features({ o }: { o: AdminOverview }) {
  if (o.features.length === 0) return null
  return (
    <Card title="Cost by feature">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full text-left text-[0.8125rem]">
          <thead className="text-text-faint">
            <tr>
              <th className="px-1 pb-1.5 font-medium">Feature</th>
              <th className="px-1 pb-1.5 font-medium">Model</th>
              <th className="px-1 pb-1.5 text-right font-medium">Calls</th>
              <th className="px-1 pb-1.5 text-right font-medium">Avg tok</th>
              <th className="px-1 pb-1.5 text-right font-medium">Median</th>
            </tr>
          </thead>
          <tbody>
            {o.features.map((f) => (
              <tr key={`${f.kind}${f.feature}${f.model}`} className="border-t border-border">
                <td className="px-1 py-1.5">{f.feature}</td>
                <td className="px-1 py-1.5 text-text-muted">{shortModel(f.model)}</td>
                <td className="px-1 py-1.5 text-right">{num(f.calls)}</td>
                <td className="px-1 py-1.5 text-right">{f.kind === 'llm' ? num(f.avg_tokens) : '-'}</td>
                <td className="px-1 py-1.5 text-right text-text-muted">{f.median_ms ? `${(f.median_ms / 1000).toFixed(1)}s` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Errors({ o }: { o: AdminOverview }) {
  return (
    <Card icon={Bug} title="Recent errors" aside={o.errors.length ? `${o.errors.length}` : undefined}>
      {o.errors.length === 0 ? (
        <Empty>No errors in this period.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {o.errors.map((e) => (
            <li key={e.error_id + e.at}>
              <p className="flex items-baseline justify-between gap-2 text-[0.875rem]">
                <span className="font-mono text-[0.8125rem] font-semibold text-danger">{e.error_id}</span>
                <span className="text-[0.8125rem] text-text-faint">{when(e.at)}</span>
              </p>
              <p className="text-[0.9375rem] leading-snug">{e.where}</p>
              <p className="text-[0.8125rem] leading-snug break-words text-text-muted">
                {e.type}: {e.message}
                {e.user && <> · {e.user}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Daily({ o }: { o: AdminOverview }) {
  if (o.daily.length < 2) return null
  return (
    <Card title="By day">
      <table className="w-full text-left text-[0.8125rem]">
        <thead className="text-text-faint">
          <tr>
            <th className="pb-1.5 font-medium">Day</th>
            <th className="pb-1.5 text-right font-medium">Captures</th>
            <th className="pb-1.5 text-right font-medium">Questions</th>
            <th className="pb-1.5 text-right font-medium">Tokens</th>
            <th className="pb-1.5 text-right font-medium">Errors</th>
          </tr>
        </thead>
        <tbody>
          {[...o.daily].reverse().map((d) => (
            <tr key={d.day} className="border-t border-border">
              <td className="py-1.5">{d.day.slice(5)}</td>
              <td className="py-1.5 text-right">{d.captures}</td>
              <td className="py-1.5 text-right">{d.questions}</td>
              <td className="py-1.5 text-right">{num(d.tokens)}</td>
              <td className={`py-1.5 text-right ${d.errors ? 'text-danger' : ''}`}>{d.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}


const FACE = { 4: '😍', 3: '🙂', 2: '😐', 1: '🙁' } as const
const FACE_LABEL = { 4: 'Loving it', 3: 'Good', 2: 'Okay', 1: 'Poor' } as const
const TAG_LABEL: Record<string, string> = {
  wrong_answers: 'Wrong answers', slow: 'Slow', confusing: 'Confusing', missing_feature: 'Missing something', other: 'Something else',
  wrong_answer: 'Wrong or odd answer', wrong_space: 'Filed in the wrong place', broke: 'Something broke', idea: 'Idea or request',
}

// What people say about the app (api/routers/feedback.py): the rating they gave, why, and the problems they reported.
function Feedback() {
  const { data } = useAdminFeedback(30)
  const setStatus = useSetFeedbackStatus()
  if (!data) return null
  if (!data.available)
    return (
      <Card icon={MessageSquareHeart} title="Feedback">
        <Empty>Run the database migration (schema.sql section 47) to start collecting ratings and reports.</Empty>
      </Card>
    )
  const r = data.ratings!
  const items = data.items ?? []
  const issues = items.filter((i) => i.kind === 'issue')
  const lowRatings = items.filter((i) => i.kind === 'rating' && (i.message || (i.rating ?? 4) <= 2))
  const max = Math.max(1, ...Object.values(r.counts))
  const list = [...issues, ...lowRatings].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <Card
      icon={MessageSquareHeart}
      title="Feedback"
      aside={data.open_issues ? `${data.open_issues} new ${data.open_issues === 1 ? 'report' : 'reports'}` : 'last 30 days'}
    >
      {r.count === 0 ? (
        <Empty>No ratings yet. The card appears after someone has saved a few notes.</Empty>
      ) : (
        <>
          <p className="mb-3 text-[0.9375rem]">
            <span className="text-2xl font-semibold tabular-nums">{r.average?.toFixed(1)}</span>
            <span className="text-text-muted"> / 4 from {r.count} {r.count === 1 ? 'rating' : 'ratings'}</span>
          </p>
          <div className="flex flex-col gap-2">
            {([4, 3, 2, 1] as const).map((n) => (
              <div key={n} className="flex items-center gap-2.5 text-[0.8125rem]">
                <span className="w-6 text-center text-base" aria-hidden="true">{FACE[n]}</span>
                <span className="w-16 text-text-muted">{FACE_LABEL[n]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated">
                  <div className={`h-full rounded-full ${n <= 2 ? 'bg-danger' : 'bg-success'}`} style={{ width: `${(r.counts[String(n) as '1'] / max) * 100}%` }} />
                </div>
                <span className="w-6 text-right tabular-nums text-text-muted">{r.counts[String(n) as '1']}</span>
              </div>
            ))}
          </div>
          {r.weekly.length > 1 && (
            <p className="mt-3 text-[0.8125rem] text-text-muted">
              By week: {r.weekly.map((w) => `${w.average.toFixed(1)} (${w.count})`).join(' → ')}
            </p>
          )}
        </>
      )}

      {(data.reasons?.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {data.reasons!.map((t) => (
            <span key={t.tag} className="rounded-full bg-bg-elevated px-2.5 py-1 text-[0.75rem] text-text-muted">
              {TAG_LABEL[t.tag] ?? t.tag} · {t.count}
            </span>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          {list.map((i) => (
            <div key={i.id} className="rounded-xl border border-border p-3 text-[0.875rem]">
              <div className="flex items-center gap-2 text-[0.75rem] text-text-muted">
                <span>{i.kind === 'issue' ? 'Problem' : `${FACE[(i.rating ?? 1) as 1]} ${FACE_LABEL[(i.rating ?? 1) as 1]}`}</span>
                {i.tags.length > 0 && <span>· {i.tags.map((t) => TAG_LABEL[t] ?? t).join(', ')}</span>}
                <span className="ml-auto">{when(i.at)}</span>
              </div>
              {i.message && <p className="mt-1.5 whitespace-pre-wrap leading-snug">{i.message}</p>}
              {i.context.included && (
                <p className="mt-1.5 rounded-lg bg-bg-elevated px-2.5 py-1.5 text-[0.8125rem] leading-snug text-text-muted">
                  Reply they included: {i.context.included}
                </p>
              )}
              <p className="mt-1.5 text-[0.75rem] text-text-faint">
                {i.user}
                {i.screen ? ` · ${i.screen}` : ''}
                {i.context.about ? ` · about ${i.context.about}` : ''}
                {i.context.app_version ? ` · ${i.context.app_version}` : ''}
                {i.context.error_id ? ` · ref ${i.context.error_id}` : ''}
              </p>
              {i.kind === 'issue' && (
                <div className="mt-2 flex gap-1.5">
                  {(['new', 'seen', 'fixed'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus.mutate({ id: i.id, status: st })}
                      aria-pressed={i.status === st}
                      className={`pressable h-8 rounded-full border px-3 text-[0.8125rem] capitalize ${i.status === st ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong text-text-muted'}`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function AdminPage() {
  const [days, setDays] = useState<'1' | '7' | '30'>('1')
  const { data, isLoading, error, refetch, isFetching } = useAdminOverview(Number(days))

  return (
    <div>
      <PageHeader backTo="/settings" title="Admin" />
      <div className="mb-4 flex items-center gap-2">
        <Segmented
          className="flex-1"
          value={days}
          onChange={setDays}
          options={[
            { value: '1', label: 'Today' },
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
          ]}
        />
        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Refresh"
          className="pressable flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated text-text-muted"
        >
          <RefreshCw size={17} strokeWidth={2} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-danger">{String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {data && (
        <>
          {!data.persisted && (
            <p className="mb-4 rounded-xl bg-[#d9731f]/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-[#b45309]">
              Showing only what this server has seen since it last restarted - run the database migration (section 35)
              to keep history.
            </p>
          )}
          <Budget o={data} />
          <Backup o={data} />
          <Feedback />
          <Totals o={data} />
          <Problems o={data} />
          <Limits o={data} />
          <UsersCard o={data} />
          <Inactive o={data} />
          <Scale o={data} />
          <Storage o={data} />
          <Errors o={data} />
          <Features o={data} />
          <Daily o={data} />
        </>
      )}
    </div>
  )
}
