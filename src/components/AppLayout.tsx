import { NavLink, Outlet } from 'react-router-dom'
import { ClipboardList, LayoutDashboard, LogOut, Users, Zap } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { DEMO_MODE } from '../lib/flags'
import { initials } from '../lib/format'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/reports', label: 'Reports', icon: ClipboardList, end: false },
  { to: '/users', label: 'Users', icon: Users, end: false },
]

function navClass(isActive: boolean, mobile = false) {
  if (mobile) {
    return `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
      isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`
  }
  return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-slate-800 text-white shadow-sm'
      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
  }`
}

export function AppLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-6">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/30">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">NeedHelp</p>
            <p className="text-[11px] text-slate-400">
              Admin console
              {DEMO_MODE ? <span className="ml-1 text-amber-400">· demo data</span> : null}
            </p>
          </div>
        </div>

        <nav className="mt-3 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => navClass(isActive)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 p-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-500 text-xs font-semibold text-white">
              {initials(profile?.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {profile?.full_name || 'Admin'}
              </p>
              <p className="truncate text-[11px] text-slate-400">Super admin</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              title="Sign out"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white">
                <Zap className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-slate-900">
                NeedHelp Admin
                {DEMO_MODE ? (
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                    demo
                  </span>
                ) : null}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => navClass(isActive, true)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
