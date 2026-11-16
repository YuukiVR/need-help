import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Camera, Send } from 'lucide-react'
import { createReport } from '../../lib/api'
import { errorMessage } from '../../lib/format'
import { Spinner } from '../../components/Spinner'
import { LocationPicker, reverseGeocode } from '../../components/app/LocationPicker'
import type { ReportType } from '../../lib/types'

const TYPES: { value: ReportType; label: string }[] = [
  { value: 'water', label: 'Water outage' },
  { value: 'electricity', label: 'Electricity outage' },
  { value: 'fire', label: 'Fire' },
]

export function NewReportPage() {
  const navigate = useNavigate()
  const [type, setType] = useState<ReportType>('water')
  const [description, setDescription] = useState('')
  const [addressText, setAddressText] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function useMyLocation() {
    if (!navigator.geolocation) { setError('Geolocation not supported.'); return }
    navigator.geolocation.getCurrentPosition(async (p) => {
      setLat(p.coords.latitude); setLng(p.coords.longitude)
      const addr = await reverseGeocode(p.coords.latitude, p.coords.longitude)
      if (addr) setAddressText(addr)
    }, () => setError('Could not get location. Tap the map to set it.'), { enableHighAccuracy: true, timeout: 10000 })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      const row = await createReport({ type, description, address_text: addressText || null, lat, lng, photo })
      setDone(`Report submitted. Ticket #${row.ticket_no}.`)
      setTimeout(() => navigate('/app/me'), 1200)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">File a report</h1>
      <p className="mb-4 text-sm text-slate-500">Provide details so responders can act quickly.</p>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="text-sm font-medium text-slate-700">Category</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => setType(t.value)}
                className={`rounded-xl border px-2 py-2 text-xs font-medium ${type===t.value?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="What happened?" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Location</label>
            <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"><MapPin className="h-3.5 w-3.5" /> Use my location</button>
          </div>
          <div className="mt-2"><LocationPicker lat={lat} lng={lng} onChange={async (la, ln) => { setLat(la); setLng(ln); const a = await reverseGeocode(la, ln); if (a) setAddressText(a) }} /></div>
          <input value={addressText} onChange={(e) => setAddressText(e.target.value)} placeholder="Address / landmark"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 inline-flex items-center gap-1"><Camera className="h-4 w-4" /> Photo (optional)</label>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
          {photo ? <p className="mt-1 text-xs text-slate-500">Selected: {photo.name}</p> : null}
        </div>
        {type === 'fire' ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">Fire reports are treated as emergencies and prioritized automatically.</p> : null}
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {done ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</div> : null}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center justify-center gap-2">
          {busy ? <><Spinner /> Submitting…</> : <><Send className="h-4 w-4" /> Submit report</>}
        </button>
      </form>
    </div>
  )
}
