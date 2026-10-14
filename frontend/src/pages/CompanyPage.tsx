import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCompanyBriefing, useCompanyOverview } from '../api/people'
import AiNotice from '../components/AiNotice'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Card from '../components/Card'

// One company on its own page: who you know there, how much you've talked
// to each of them, recent conversations, and the on-demand AI briefing.
// Reached from the Companies picker on the People page - kept separate from
// that list so the company's details aren't buried among everything else.
export default function CompanyPage() {
  const { company = '' } = useParams<{ company: string }>()
  const navigate = useNavigate()
  const overview = useCompanyOverview(company)
  const briefing = useCompanyBriefing()
  const data = overview.data

  return (
    <div>
      <Button onClick={() => navigate('/people')} className="mb-4">
        <span className="flex items-center gap-1.5">
          <ArrowLeft size={14} strokeWidth={1.6} /> Back to Contacts
        </span>
      </Button>

      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Building2 size={20} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{company}</h1>
          {data && (
            <p className="text-sm text-text-muted">
              {data.people.length} {data.people.length === 1 ? 'person' : 'people'}
              {' · '}
              {data.interaction_count} {data.interaction_count === 1 ? 'interaction' : 'interactions'}
              {data.last_interaction_date ? ` · last talked ${data.last_interaction_date}` : ''}
            </p>
          )}
        </div>
      </div>

      {overview.isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {overview.isError && (
        <p className="text-sm text-danger">Couldn't load this company. Please go back and try again.</p>
      )}

      {data && (
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold tracking-tight text-text-muted">Contacts</h2>
            <ul className="flex flex-col gap-1">
              {data.people.map((p) => (
                <li key={p.id}>
                  <Link to={`/people/${p.id}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-bg-hover">
                    <Avatar id={p.id} name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      {p.role && <span className="block truncate text-xs text-text-muted">{p.role}</span>}
                    </span>
                    <span className="flex-shrink-0 text-right text-xs text-text-faint">
                      {p.interaction_count} {p.interaction_count === 1 ? 'interaction' : 'interactions'}
                      {p.last_interaction_date && <span className="block">last {p.last_interaction_date}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {data.recent_interactions.length > 0 && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold tracking-tight text-text-muted">Recent conversations</h2>
              <ul className="flex flex-col gap-1.5">
                {data.recent_interactions.map((i) => (
                  <li key={i.id} className="rounded-lg bg-bg-elevated px-3 py-2 text-xs text-text-muted">
                    <span className="font-medium text-text">{i.date ?? 'No date'}</span>
                    {' · '}
                    <Link to={`/people/${i.person.id}`} className="text-accent hover:underline">
                      {i.person.name}
                    </Link>
                    {i.summary && <p className="mt-0.5 leading-snug">{i.summary}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="mb-2 text-sm font-semibold tracking-tight text-text-muted">Company briefing</h2>
            <Button variant="primary" disabled={briefing.isPending} onClick={() => briefing.mutate(company)}>
              {briefing.isPending ? 'Preparing…' : briefing.data ? 'Refresh company briefing' : 'Get company briefing'}
            </Button>
            {briefing.isError && (
              <p className="mt-2 text-xs text-danger">Couldn't prepare the briefing. Please try again in a moment.</p>
            )}
            {briefing.data && (
              <div className="mt-3 rounded-lg bg-accent-soft p-3">
                <div className="prose-chat min-w-0 text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.data.briefing}</ReactMarkdown>
                </div>
                <div className="mt-2 border-t border-border pt-2">
                  <AiNotice kind="briefing" />
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
