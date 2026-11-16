import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { MapPin, Camera, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { updateMyProfile, uploadIdentityPhoto } from '../../lib/api'
import { friendlyAuthError, errorMessage } from '../../lib/format'
import { useAuth } from '../../auth/AuthProvider'
import { Spinner } from '../../components/Spinner'
import { LocationPicker, reverseGeocode } from '../../components/app/LocationPicker'

const TERMS_VERSION = 'v1-2026-11-16'

export function RegisterPage() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [addressText, setAddressText] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [idPhoto, setIdPhoto] = useState<File | null>(null)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session && profile?.role === 'admin') return <Navigate to="/" replace />
  if (session && profile && profile.terms_accepted_at) return <Navigate to="/app" replace />

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setBusy(true)
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: fullName.trim(), phone: phone.trim() || null } },
      })
      if (err) throw err
      if (!data.session) {
        setError('Account created. Please check your email to confirm, then sign in to complete your profile.')
        return
      }
      setStep(2)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  async function useMyLocation() {
    if (!navigator.geolocation) { setError('Geolocation is not supported on this device.'); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const la = pos.coords.latitude
        const ln = pos.coords.longitude
        setLat(la); setLng(ln)
        const addr = await reverseGeocode(la, ln)
        if (addr) setAddressText(addr)
      },
      () => setError('Could not get your location. You can tap the map to set it.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function handleComplete(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!terms) { setError('You must accept the terms and conditions to continue.'); return }
    if (!selfie || !idPhoto) { setError('Selfie and ID photo are required for verification.'); return }
    if (!fullName.trim()) { setError('Full name is required.'); return }
    setBusy(true)
    try {
      const selfiePath = await uploadIdentityPhoto('selfie', selfie)
      const idPath = await uploadIdentityPhoto('id', idPhoto)
      await updateMyProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        address_text: addressText.trim() || null,
        address_lat: lat,
        address_lng: lng,
        selfie_path: selfiePath,
        id_photo_path: idPath,
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
        verification_status: 'pending',
      })
      await supabase.auth.refreshSession()
      navigate('/app', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Create account</h1>
          <p className="text-sm text-slate-500">Register to report outages and emergencies</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {step === 1 ? (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Full name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Phone (optional)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Password</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {busy ? <><Spinner /> Creating…</> : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleComplete} className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Current address</label>
                  <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"><MapPin className="h-3.5 w-3.5" /> Use my location</button>
                </div>
                <div className="mt-2"><LocationPicker lat={lat} lng={lng} onChange={async (la, ln) => { setLat(la); setLng(ln); const addr = await reverseGeocode(la, ln); if (addr) setAddressText(addr) }} /></div>
                <input value={addressText} onChange={(e) => setAddressText(e.target.value)} placeholder="Address (auto-filled from map, editable)"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700 inline-flex items-center gap-1"><Camera className="h-4 w-4" /> Selfie</label>
                  <input type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] || null)} required
                    className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 inline-flex items-center gap-1"><Camera className="h-4 w-4" /> Photo of ID</label>
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => setIdPhoto(e.target.files?.[0] || null)} required
                    className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <p className="font-medium text-slate-900">Terms and conditions (ID use)</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">I consent to provide my selfie and a photo of my government-issued ID solely for identity verification and to prevent fraudulent or false reports. My ID will be handled securely, accessed only by authorized administrators for verification purposes, and will not be used for any other purpose.</p>
                  </div>
                </div>
                <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
                  <span>I have read and agree to these terms.</span>
                </label>
              </div>
              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {busy ? <><Spinner /> Submitting…</> : 'Complete registration'}
              </button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account? <Link to="/app/login" className="font-medium text-blue-600 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
