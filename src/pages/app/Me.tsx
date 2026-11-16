import { useEffect, useState } from 'react'
import { fetchMyReports } from '../../lib/api'
import { errorMessage, timeAgo } from '../../lib/format'
import { useAuth } from '../../auth/AuthProvider'
import type { ReportRow } from '../../lib/types'
import { StatusBadge, TypeBadge } from '../../components/Badge'

export function MePage() {
  const { profile } = useAuth()
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMyReports()
      .then(setReports)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">My profile</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
          <div><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{profile?.full_name || '—'}</dd></div>
          <div><dt className="text-slate-500">Email</dt><dd className="text-slate-700">{profile?.email || '—'}</dd></div>
          <div><dt className="text-slate-500">Address</dt><dd className="text-slate-700">{profile?.address_text || 'Not set'}</dd></div>
          <div><dt className="text-slate-500">Verification</dt><dd className="capitalize text-slate-700">{profile?.verification_status || 'unverified'}</dd></div>
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">My reports</h2>
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {!loading && !error && reports.length === 0 ? <p className="mt-3 text-sm text-slate-500">No reports yet.</p> : null}
        <ul className="mt-3 space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-400">#{r.ticket_no}</span>
                <TypeBadge type={r.type} />
                <StatusBadge status={r.status} />
                {r.is_sos ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200">SOS</span> : null}
              </div>
              <p className="mt-1 text-sm text-slate-700 line-clamp-2">{r.description || 'No description'}</p>
              <p className="mt-1 text-xs text-slate-400">{r.address_text || 'No address'} · {timeAgo(r.created_at)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
