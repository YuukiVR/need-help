import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react'
import { fetchUsers, updateProfile } from '../lib/api'
import { errorMessage, formatDate, initials } from '../lib/format'
import type { Profile, Role } from '../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader, ErrorBanner } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'

const PAGE_SIZE = 15

const ROLE_OPTIONS: Array<Role | 'all'> = ['all', 'admin', 'responder', 'consumer']

const ROLE_STYLE: Record<Role, string> = {
  admin: 'bg-blue-50 text-blue-700 ring-blue-200',
  responder: 'bg-violet-50 text-violet-700 ring-violet-200',
  consumer: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export function UsersPage() {
  const { profile: me } = useAuth()

  const [role, setRole] = useState<Role | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

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
      const result = await fetchUsers({ search, role, page, pageSize: PAGE_SIZE })
      setRows(result.rows)
      setTotal(result.total)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [search, role, page])

  useEffect(() => {
    void load()
  }, [load])

  async function changeRole(user: Profile, nextRole: Role) {
    if (user.id === me?.id) return
    const previous = rows
    setRows((current) =>
      current.map((item) => (item.id === user.id ? { ...item, role: nextRole } : item)),
    )
    setSavingId(user.id)
    setError(null)
    try {
      await updateProfile(user.id, { role: nextRole })
    } catch (err) {
      setRows(previous)
      setError(errorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  async function toggleActive(user: Profile) {
    if (user.id === me?.id) return
    const previous = rows
    setRows((current) =>
      current.map((item) =>
        item.id === user.id ? { ...item, is_active: !item.is_active } : item,
      ),
    )
    setSavingId(user.id)
    setError(null)
    try {
      await updateProfile(user.id, { is_active: !user.is_active })
    } catch (err) {
      setRows(previous)
      setError(errorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  return (
    <>
      <PageHeader
        title="Users"
        description="Promote responders, manage admins, and deactivate accounts. New accounts are created in Supabase Auth."
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

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, email or phone…"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        <select
          aria-label="Filter by role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value as Role | 'all')
            setPage(1)
          }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        >
          {ROLE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? 'All roles' : value}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="h-0.5 animate-pulse bg-blue-500" /> : null}

        {rows.length === 0 && !loading ? (
          <EmptyState
            title="No users found"
            description="Try a different search, or create accounts in Supabase Auth."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Zone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((user) => {
                  const isMe = user.id === me?.id
                  const saving = savingId === user.id

                  return (
                    <tr key={user.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                            {initials(user.full_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-medium text-slate-900">
                                {user.full_name || 'Unnamed'}
                              </p>
                              {isMe ? (
                                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                                  You
                                </span>
                              ) : null}
                              {user.role === 'admin' ? (
                                <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-slate-400">
                              {user.email || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {user.phone || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          disabled={isMe || saving}
                          onChange={(event) => void changeRole(user, event.target.value as Role)}
                          className={`rounded-lg border-0 px-2 py-1 text-xs font-medium ring-1 ring-inset outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${ROLE_STYLE[user.role]}`}
                          title={isMe ? 'You cannot change your own role' : 'Change role'}
                        >
                          <option value="admin">admin</option>
                          <option value="responder">responder</option>
                          <option value="consumer">consumer</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {user.zone || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void toggleActive(user)}
                          disabled={isMe || saving}
                          title={isMe ? 'You cannot deactivate yourself' : 'Toggle account'}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            user.is_active
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {saving ? (
                            <Spinner className="h-3 w-3" />
                          ) : user.is_active ? (
                            <UserCheck className="h-3 w-3" />
                          ) : (
                            <UserX className="h-3 w-3" />
                          )}
                          {user.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {total === 0 ? 'No users' : `Showing ${start}–${end} of ${total}`}
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
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Roles are enforced by the database. A user who is not an admin cannot open this
        console even if they know the URL.
      </p>
    </>
  )
}
