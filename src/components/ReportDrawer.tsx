import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  Send,
  User,
  Wrench,
  X,
} from 'lucide-react'
import {
  assignReport,
  cancelAssignment,
  fetchReportDetail,
  triageReport,
} from '../lib/api'
import { errorMessage, formatDateTime, timeAgo } from '../lib/format'
import type { Priority, ReportDetail, ReportStatus } from '../lib/types'
import { PriorityBadge, StatusBadge, TypeBadge } from './Badge'
import { Spinner } from './Spinner'
import { ErrorBanner } from './PageHeader'

const STATUS_OPTIONS: ReportStatus[] = [
  'new',
  'triaged',
  'assigned',
  'in_progress',
  'resolved',
  'cancelled',
  'duplicate',
]

const PRIORITY_OPTIONS: Priority[] = ['low', 'medium', 'high', 'critical']

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-5 py-4 last:border-b-0">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  )
}

const EVENT_STYLE: Record<string, { dot: string; label: string }> = {
  status: { dot: 'bg-blue-500', label: 'Status' },
  assignment: { dot: 'bg-violet-500', label: 'Assignment' },
  comment: { dot: 'bg-slate-400', label: 'Comment' },
  photo: { dot: 'bg-emerald-500', label: 'Photo' },
  system: { dot: 'bg-slate-300', label: 'System' },
}

export function ReportDrawer({
  reportId,
  onClose,
  onChanged,
}: {
  reportId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [responderId, setResponderId] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [status, setStatus] = useState<ReportStatus>('new')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setError(null)
      const next = await fetchReportDetail(reportId)
      setDetail(next)
      setPriority(next.report.priority)
      setStatus(next.report.status)
      if (!next.report.assignment_id) setResponderId('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [onClose])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const report = detail?.report
  const activeAssignment = report?.assignment_id ?? null

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-drawer-in flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Report details"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-400">
                {report ? `#${report.ticket_no}` : 'Report'}
              </span>
              {report ? <TypeBadge type={report.type} /> : null}
              {report ? <StatusBadge status={report.status} /> : null}
              {report?.is_emergency ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                  <AlertTriangle className="h-3 w-3" /> Emergency
                </span>
              ) : null}
              {report?.is_sos ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  SOS
                </span>
              ) : null}
            </div>
            <h2 className="mt-1 truncate text-base font-semibold text-slate-900">
              {report?.address_text || 'Report details'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading && !detail ? (
            <div className="flex items-center gap-2 px-5 py-10 text-sm text-slate-500">
              <Spinner /> Loading report…
            </div>
          ) : null}

          {error ? (
            <div className="px-5 pt-4">
              <ErrorBanner message={error} />
            </div>
          ) : null}

          {report ? (
            <>
              <Section title="Report">
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {report.description || 'No description provided.'}
                </p>

                {detail?.photoUrl ? (
                  <img
                    src={detail.photoUrl}
                    alt="Report attachment"
                    loading="lazy"
                    className="mt-3 max-h-64 w-full rounded-xl border border-slate-200 object-cover"
                  />
                ) : null}

                <dl className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-start gap-2 text-slate-600">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span>
                      {report.address_text || 'No address'}
                      {report.lat != null && report.lng != null ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=18/${report.lat}/${report.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        >
                          Map <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>
                      Filed {formatDateTime(report.created_at)} ({timeAgo(report.created_at)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <User className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>{report.reporter_name || 'Unknown reporter'}</span>
                    {report.reporter_verification_status ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-600 ring-1 ring-slate-200">
                        {report.reporter_verification_status}
                      </span>
                    ) : null}
                    {report.reporter_phone ? (
                      <a
                        href={`tel:${report.reporter_phone}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <Phone className="h-3 w-3" /> {report.reporter_phone}
                      </a>
                    ) : null}
                  </div>
                </dl>
              </Section>

              <Section title="Assignment">
                {activeAssignment ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {report.responder_name || 'Responder'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {report.responder_phone || 'No phone'} ·{' '}
                          {report.assignment_status?.replace('_', ' ') || 'assigned'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() => cancelAssignment(activeAssignment, 'Reassigned by admin'))
                        }
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        Unassign
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={responderId}
                      onChange={(event) => setResponderId(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Choose a responder…</option>
                      {detail?.responders.map((responder) => (
                        <option key={responder.id} value={responder.id}>
                          {responder.full_name}
                          {responder.zone ? ` — ${responder.zone}` : ''}
                        </option>
                      ))}
                    </select>
                    {detail && detail.responders.length === 0 ? (
                      <p className="text-xs text-amber-600">
                        No active responders yet. Promote a responder account first.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || !responderId}
                      onClick={() => void run(() => assignReport(reportId, responderId))}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? <Spinner /> : <Send className="h-4 w-4" />}
                      Assign responder
                    </button>
                  </div>
                )}
              </Section>

              <Section title="Triage">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-500">
                    Priority
                    <select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as Priority)}
                      className={`${inputClass} mt-1`}
                    >
                      {PRIORITY_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Status
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value as ReportStatus)}
                      className={`${inputClass} mt-1`}
                    >
                      {STATUS_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => triageReport(reportId, priority, status))}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy ? <Spinner /> : <Wrench className="h-4 w-4" />}
                  Apply priority and status
                </button>
                <p className="mt-2 text-xs text-slate-400">
                  Assigning a responder sets the status to “assigned” automatically.
                </p>
              </Section>

              <Section title={`Timeline (${detail?.events.length ?? 0})`}>
                {detail?.events.length ? (
                  <ol className="space-y-3">
                    {detail.events.map((event) => {
                      const style = EVENT_STYLE[event.kind] ?? EVENT_STYLE.comment
                      return (
                        <li key={event.id} className="flex gap-3">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700">
                              {event.message || style.label}
                            </p>
                            <p className="text-xs text-slate-400">
                              {event.author_name || 'System'} · {formatDateTime(event.created_at)}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-400">No events yet.</p>
                )}
              </Section>

              <Section title="Meta">
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-400">Priority</dt>
                    <dd className="mt-1">
                      <PriorityBadge priority={report.priority} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Last update</dt>
                    <dd className="mt-1 text-slate-600">{formatDateTime(report.updated_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Resolved</dt>
                    <dd className="mt-1 text-slate-600">
                      {report.resolved_at ? formatDateTime(report.resolved_at) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Report ID</dt>
                    <dd className="mt-1 truncate font-mono text-[11px] text-slate-500">
                      {report.id}
                    </dd>
                  </div>
                </dl>
              </Section>
            </>
          ) : null}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            {report?.status === 'resolved' ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Resolved
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5 text-slate-400" /> Open
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
