import { LogOut, ShieldAlert } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { emailToUsername } from '../lib/auth'

export function AccessDenied({ title, description }: { title: string; description: string }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-red-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>

        {profile ? (
          <p className="mt-4 text-xs text-slate-500">
            Signed in as <span className="text-slate-300">{profile.full_name || 'Unknown'}</span>
            {profile.email ? ` · ${emailToUsername(profile.email)}` : ''}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
