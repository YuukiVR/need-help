import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { fetchReports } from '../lib/api'
import { supabase } from '../lib/supabase'
import { errorMessage, timeAgo } from '../lib/format'
import type { Priority, ReportRow, ReportStatus, ReportType } from '../lib/types'
import { PageHeader, ErrorBanner } from '../components/PageHeader'
import { PriorityBadge, StatusBadge, TypeBadge } from '../components/Badge'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { ReportDrawer } from '../components/ReportDrawer'

const PAGE_SIZE = 15

const selectClass =
  'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

const STATUS_OPTIONS: Array<ReportStatus | 'all'> = [
  'all',
  'new',
  'triaged',
  'assigned',
  'in_progress',
  'resolved',
  'cancelled',
  'duplicate',
]

const TYPE_OPTIONS: Array<ReportType | 'all'> = ['all', 'water', 'electricity', 'fire']
const PRIORITY_OPTIONS: Array<Priority | 'all'> = ['all', 'low', 'medium', 'high', 'critical']

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [status, setStatus] = useState<ReportStatus | 'all'>('all')
  const [type, setType] = useState<ReportType | 'all'>('all')
  const [priority, setPriority] = useState<Priority | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<ReportRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setError(null)
      const result = await fetchReports({
        status,
        type,
        priority,
        search,
        page,
        pageSize: PAGE_SIZE,
      })
      setRows(result.rows)
      setTotal(result.total)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [status, type, priority, search, page])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('admin-reports-list')
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

  const selectedId = searchParams.get('report')

  function openReport(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('report', id)
    setSearchParams(next, { replace: true })
  }

  function closeReport() {
    const next = new URLSearchParams(searchParams)
    next.delete('report')
    setSearchParams(next, { replace: true })
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every water, electricity and fire report. Click a row to triage or assign it."
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

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search ticket, address, description or reporter…"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ReportStatus | 'all')
              setPage(1)
            }}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All statuses' : value.replace('_', ' ')}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as ReportType | 'all')
              setPage(1)
            }}
            className={selectClass}
          >
            {TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All types' : value}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by priority"
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value as Priority | 'all')
              setPage(1)
            }}
            className={selectClass}
          >
            {PRIORITY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All priorities' : value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="h-0.5 animate-pulse bg-blue-500" /> : null}

        {rows.length === 0 && !loading ? (
          <EmptyState
            title="No reports match these filters"
            description="Try clearing the search or choosing a different status."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Ticket</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((report) => (
                  <tr
                    key={report.id}
                    tabIndex={0}
                    onClick={() => openReport(report.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openReport(report.id)
                      }
                    }}
                    className="cursor-pointer transition hover:bg-slate-50 focus:bg-blue-50/50 focus:outline-none"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-mono text-xs text-slate-500">
                        #{report.ticket_no}
                      </span>
                      {report.is_emergency ? (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={report.type} />
                    </td>
                    <td className="max-w-[18rem] px-4 py-3">
                      <p className="truncate text-slate-700">
                        {report.description || 'No description'}
                      </p>
                    </td>
                    <td className="max-w-[14rem] px-4 py-3">
                      <p className="truncate text-slate-600">{report.address_text || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={report.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="max-w-[12rem] px-4 py-3">
                      <p className="truncate text-slate-600">
                        {report.responder_name || '—'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                      {timeAgo(report.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {total === 0 ? 'No results' : `Showing ${start}–${end} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="text-xs text-slate-500">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {loading ? <Spinner className="h-3.5 w-3.5 text-slate-400" /> : null}
          </div>
        </div>
      </div>

      {selectedId ? (
        <ReportDrawer reportId={selectedId} onClose={closeReport} onChanged={load} />
      ) : null}
    </>
  )
}
