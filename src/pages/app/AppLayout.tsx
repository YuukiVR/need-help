import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, FilePlus2, User, LogOut } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'

function tabClass(active: boolean) {
  return `flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] font-medium ${active ? 'text-blue-600' : 'text-slate-500'}`
}

export function ConsumerLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white">⚡</div>
            <span className="text-sm font-semibold text-slate-900">NeedHelp</span>
          </div>
          <button onClick={async () => { await signOut(); navigate('/app/login') }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4">
        {!profile?.terms_accepted_at && profile?.role === 'consumer' ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Complete your registration (address, selfie, ID and terms) to file verified reports.{' '}
            <NavLink to="/app/register" className="font-semibold underline">Continue verification</NavLink>
          </div>
        ) : null}
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          <NavLink to="/app" end className={({ isActive }) => tabClass(isActive)}><Home className="h-5 w-5" />Home</NavLink>
          <NavLink to="/app/report" className={({ isActive }) => tabClass(isActive)}><FilePlus2 className="h-5 w-5" />Report</NavLink>
          <NavLink to="/app/me" className={({ isActive }) => tabClass(isActive)}><User className="h-5 w-5" />Me</NavLink>
        </div>
      </nav>
    </div>
  )
}
