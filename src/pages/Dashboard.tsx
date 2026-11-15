import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Droplets,
  Flame,
  Inbox,
  RefreshCw,
  Users,
  Wrench,
  Zap,
} from 'lucide-react'
import { fetchDashboard, type DashboardData } from '../lib/api'
import { supabase } from '../lib/supabase'
import { errorMessage, timeAgo } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader, ErrorBanner } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { StatusBadge, TypeBadge } from '../components/Badge'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'

export function DashboardPage() {
  const { profile } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setData(await fetchDashboard())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-reports')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reports' },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.replace(/^super\s+/i, '').trim() || 'Admin'

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    )
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorBanner message={error ?? 'Could not load the dashboard.'} />
      </>
    )
  }

  const typeRows = [
    { key: 'water', label: 'Water', value: data.byType.water, bar: 'bg-sky-500', Icon: Droplets },
    {
      key: 'electricity',
      label: 'Electricity',
      value: data.byType.electricity,
      bar: 'bg-amber-500',
      Icon: Zap,
    },
    { key: 'fire', label: 'Fire', value: data.byType.fire, bar: 'bg-red-500', Icon: Flame },
  ]
  const maxType = Math.max(1, ...typeRows.map((row) => row.value))

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${greeting}, ${firstName}. Here is what needs attention right now.`}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open reports"
          value={data.open}
          hint={`${data.total} reports all time`}
          icon={Inbox}
          tone="blue"
        />
        <StatCard
          label="In progress"
          value={data.inProgress}
          hint="Crews on site"
          icon={Wrench}
          tone="violet"
        />
        <StatCard
          label="Emergencies"
          value={data.emergency}
          hint="Unresolved, flagged urgent"
          icon={Flame}
          tone="red"
        />
        <StatCard
          label="Resolved today"
          value={data.resolvedToday}
          hint="Since midnight"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Needs attention</h2>
              <p className="text-xs text-slate-500">New and triaged reports, most urgent first.</p>
            </div>
            <Link
              to="/reports"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {data.attention.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              description="Every report has been triaged or assigned."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.attention.map((report) => (
                <li key={report.id}>
                  <Link
                    to={`/reports?report=${report.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">
                          #{report.ticket_no}
                        </span>
                        <TypeBadge type={report.type} />
                        <StatusBadge status={report.status} />
                        {report.is_emergency ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                            <Flame className="h-3 w-3" /> Emergency
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-700">
                        {report.description || 'No description'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {report.address_text || 'No address'} · {report.reporter_name || 'Unknown'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {timeAgo(report.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Reports by type</h2>
            <div className="mt-4 space-y-3">
              {typeRows.map((row) => (
                <div key={row.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                      <row.Icon className="h-3.5 w-3.5" />
                      {row.label}
                    </span>
                    <span className="tabular-nums text-slate-500">{row.value}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${row.bar}`}
                      style={{ width: `${Math.round((row.value / maxType) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Team</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-2xl font-semibold text-slate-900">{data.responders}</p>
                <p className="text-xs text-slate-500">Responders</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-2xl font-semibold text-slate-900">{data.consumers}</p>
                <p className="text-xs text-slate-500">Consumers</p>
              </div>
            </div>
            <Link
              to="/users"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Users className="h-3.5 w-3.5" /> Manage users
            </Link>
          </section>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recent reports</h2>
            <p className="text-xs text-slate-500">The latest submissions across all types.</p>
          </div>
          <Link
            to="/reports"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            All reports <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {data.recent.length === 0 ? (
          <EmptyState
            title="No reports yet"
            description="Reports filed by consumers will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Ticket</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Reporter</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent.map((report) => (
                  <tr key={report.id} className="transition hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3">
                      <Link
                        to={`/reports?report=${report.id}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        #{report.ticket_no}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <TypeBadge type={report.type} />
                    </td>
                    <td className="max-w-[16rem] truncate px-5 py-3 text-slate-600">
                      {report.address_text || '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{report.reporter_name || '—'}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-400">
                      {timeAgo(report.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Spinner /> Refreshing…
        </div>
      ) : null}
    </>
  )
}
