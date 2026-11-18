import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Droplets, FilePlus2, Flame, ShieldAlert, Siren, Zap } from 'lucide-react'
import { createReport } from '../../lib/api'
import { errorMessage } from '../../lib/format'
import { useAuth } from '../../auth/AuthProvider'
import { Spinner } from '../../components/Spinner'

export function AppHomePage() {
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuth()
  const [sosOpen, setSosOpen] = useState(false)
  const [sosType, setSosType] = useState<'fire' | 'water' | 'electricity'>('fire')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const registered = !!profile?.terms_accepted_at
  const hasIdentity = !!(profile?.selfie_path && profile?.id_photo_path)
  const hasAddress = !!(profile?.address_text || (profile?.address_lat != null && profile?.address_lng != null))
  const status = profile?.verification_status || 'unverified'
  const needsMore = !registered || !hasIdentity || !hasAddress

  async function sendSOS() {
    setErr(null); setMsg(null)
    if (needsMore) {
      setErr('Please complete verification (address, selfie, ID, and terms) before sending reports.')
      return
    }
    setBusy(true)
    try {
      let coords: { lat: number; lng: number } | null = null
      if (navigator.geolocation) {
        coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000 },
          )
        })
      }
      const row = await createReport({
        type: sosType,
        description: `SOS emergency reported from mobile app (${sosType}).`,
        address_text: coords ? `GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Location unavailable',
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        is_sos: true,
      })
      setMsg(`SOS sent. Ticket #${row.ticket_no}. Help is being notified.`)
      setSosOpen(false)
      void refreshProfile()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {needsMore || status !== 'verified' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">Account verification</p>
              <p className="mt-0.5 text-xs text-amber-800">
                {needsMore
                  ? 'Complete your registration details to help prevent fraudulent reports.'
                  : status === 'pending'
                    ? 'Your ID and selfie were submitted and are pending admin review.'
                    : status === 'rejected'
                      ? 'Your verification was not approved. Please update your details and resubmit.'
                      : 'Verification status: ' + status}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                <li className="flex items-center gap-1.5">{registered && hasAddress ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock className="h-3.5 w-3.5" />} Address & terms {registered && hasAddress ? 'completed' : 'required'}</li>
                <li className="flex items-center gap-1.5">{hasIdentity ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock className="h-3.5 w-3.5" />} Selfie & ID photo {hasIdentity ? 'uploaded' : 'required'}</li>
                <li className="flex items-center gap-1.5">{status === 'verified' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock className="h-3.5 w-3.5" />} Admin review {status === 'verified' ? 'verified' : status === 'pending' ? 'pending' : 'not verified'}</li>
              </ul>
              {needsMore || status === 'rejected' || status === 'unverified' ? (
                <Link to="/app/register" className="mt-3 inline-flex items-center justify-center rounded-xl bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800">
                  Continue verification
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 p-5 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Emergency</p>
            <h2 className="mt-1 text-xl font-semibold">SOS</h2>
            <p className="mt-1 text-sm text-white/90">Send an urgent alert with your location.</p>
          </div>
          <Siren className="h-8 w-8 text-white/90" />
        </div>
        {!sosOpen ? (
          <button onClick={() => setSosOpen(true)} disabled={busy} className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-red-700 shadow-sm active:scale-[0.99] disabled:opacity-60">
            TAP FOR SOS
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-xl bg-white/10 p-3">
            <p className="text-xs font-medium text-white/90">What is the emergency?</p>
            <div className="grid grid-cols-3 gap-2">
              {([{k:'fire',label:'Fire',I:Flame},{k:'electricity',label:'Power',I:Zap},{k:'water',label:'Water',I:Droplets}] as const).map(x => (
                <button key={x.k} onClick={() => setSosType(x.k)} className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium ${sosType===x.k?'bg-white text-red-700':'bg-white/20 text-white'}`}>
                  <x.I className="h-4 w-4" />{x.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSosOpen(false)} className="flex-1 rounded-lg bg-white/20 px-3 py-2 text-sm font-medium text-white">Cancel</button>
              <button onClick={sendSOS} disabled={busy} className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {busy ? <Spinner /> : <AlertTriangle className="h-4 w-4" />} Send SOS
              </button>
            </div>
            <p className="text-[11px] text-white/80">Your current GPS location will be attached if available.</p>
          </div>
        )}
      </div>

      {msg ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div> : null}
      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={() => needsMore ? setErr('Please complete verification (address, selfie, ID, and terms) before filing a report.') : navigate('/app/report')}
          className={`flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm ${needsMore ? 'border-slate-200 bg-slate-50 opacity-80' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><FilePlus2 className="h-5 w-5" /></div>
          <div>
            <p className="font-medium text-slate-900">File a report</p>
            <p className="text-xs text-slate-500">{needsMore ? 'Complete verification to continue' : 'Water outage, electricity outage, or fire'}</p>
          </div>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Report categories</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
          <div className="rounded-xl bg-sky-50 p-3"><Droplets className="mx-auto h-5 w-5 text-sky-600" /><p className="mt-1 font-medium">Water</p></div>
          <div className="rounded-xl bg-amber-50 p-3"><Zap className="mx-auto h-5 w-5 text-amber-600" /><p className="mt-1 font-medium">Electricity</p></div>
          <div className="rounded-xl bg-red-50 p-3"><Flame className="mx-auto h-5 w-5 text-red-600" /><p className="mt-1 font-medium">Fire</p></div>
        </div>
      </div>
    </div>
  )
}
