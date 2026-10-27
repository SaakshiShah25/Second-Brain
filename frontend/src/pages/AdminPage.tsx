import { useState, type ReactNode } from 'react'
import { AlertTriangle, Bug, Gauge, RefreshCw, Users } from 'lucide-react'
import { useAdminOverview, type AdminOverview } from '../api/admin'
import PageHeader from '../components/PageHeader'
import Segmented from '../components/Segmented'

// The owner's view (api/routers/admin.py): how much of today's free AI
// budget is left and what that still buys, who used what, where limits
// are being hit, and every recent error with the reference code the user
// was shown. Admins only - set by ADMIN_EMAILS / ALERT_EMAIL on the server.

const shortModel = (m: string) => m.replace('openai/gpt-oss-', '').replace('cohere', 'Cohere')
const num = (n: number) => n.toLocaleString()

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
          <Totals o={data} />
          <Limits o={data} />
          <UsersCard o={data} />
          <Errors o={data} />
          <Features o={data} />
          <Daily o={data} />
        </>
      )}
    </div>
  )
}
