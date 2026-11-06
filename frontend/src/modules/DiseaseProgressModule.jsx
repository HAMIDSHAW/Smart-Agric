import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import ImageCapture, { UploadProgress } from '../components/ImageCapture'
import useAuthedImage from '../hooks/useAuthedImage'
import { diseaseProgressAPI, mediaAPI } from '../services/api'

const STATUS_BADGE = {
  improving: 'badge-healthy', healthy: 'badge-healthy', stable: 'badge-info', worsening: 'badge-diseased',
}

function Thumb({ url, alt }) {
  const src = useAuthedImage(url)
  if (!url) return <div className="w-20 h-20 rounded-lg bg-black/5 flex items-center justify-center text-xs opacity-60">No photo</div>
  if (!src) return <div className="w-20 h-20 rounded-lg bg-black/5 animate-pulse" aria-label="Loading photo" />
  return <img src={src} alt={alt} className="w-20 h-20 rounded-lg object-cover" />
}

function TrackCard({ track, onChanged }) {
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(null)

  const submit = async () => {
    if (!images[0]) { toast.error('Take or choose a photo first'); return }
    setBusy(true); setPct(0)
    try {
      const fd = new FormData()
      fd.append('image', images[0].file)
      await diseaseProgressAPI.addPhoto(track.id, fd, {
        onUploadProgress: (e) => { if (e.total) setPct(Math.round((e.loaded * 100) / e.total)) },
      })
      setImages([])
      toast.success('Photo added')
      onChanged()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add the photo. Please try again.')
    } finally { setBusy(false); setPct(null) }
  }

  const removePhoto = async (idx) => {
    if (!window.confirm('Delete this photo? The entry will be kept.')) return
    try { await mediaAPI.deleteProgress(track.id, idx); toast.success('Photo deleted'); onChanged() }
    catch { toast.error('Could not delete the photo') }
  }

  const entries = track.entries || []
  return (
    <section className="card p-5 space-y-4" aria-label={track.plant_label}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-bark">{track.plant_label}</h2>
        {track.trend && <span className="badge badge-primary">Trend: {track.trend}</span>}
      </div>

      {entries.length === 0
        ? <p className="text-sm text-agri-muted">No photos yet. Add the first photo to start tracking this plant.</p>
        : (
          <ol className="space-y-3">
            {entries.map((e, i) => (
              <li key={i} className="flex gap-3">
                <Thumb url={e.image_url} alt={`Progress photo ${i + 1} of ${track.plant_label}`} />
                <div className="flex-1 text-sm">
                  <p className="text-xs text-agri-muted">{e.date}</p>
                  {e.analysis_failed
                    ? <p className="text-amber-800">⚠ This photo was saved but not analysed, so it is not a diagnosis.</p>
                    : (
                      <>
                        <p className="font-medium">{e.disease_name} <span className="text-agri-muted">({e.confidence}%)</span></p>
                        {e.status && <span className={`badge ${STATUS_BADGE[e.status] || 'badge-info'}`}>{e.status}</span>}
                        {e.observation && <p className="text-agri-muted mt-1">{e.observation}</p>}
                      </>
                    )}
                  {e.has_image && (
                    <button type="button" className="text-xs underline mt-1 text-red-700" onClick={() => removePhoto(i)}>
                      Delete photo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

      <div className="border-t pt-4 space-y-3">
        <p className="font-medium text-sm">Add a new photo</p>
        <ImageCapture images={images} purpose="leaf" disabled={busy} onChange={setImages} />
        <button type="button" className="btn-primary w-full justify-center" disabled={busy || images.length === 0} onClick={submit}>
          {busy ? 'Analysing…' : 'Add progress photo'}
        </button>
        {busy && <UploadProgress percent={pct != null && pct < 100 ? pct : null}
          label={pct != null && pct < 100 ? `Uploading photo ${pct}%` : 'Analysing the photo…'} />}
      </div>
    </section>
  )
}

export default function DiseaseProgressModule() {
  const [tracks, setTracks] = useState(null)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    try { setTracks((await diseaseProgressAPI.list()).data.tracks || []) }
    catch { setTracks([]); toast.error('Could not load your tracked plants') }
  }
  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    setCreating(true)
    try { await diseaseProgressAPI.create({ plant_label: label.trim() }); setLabel(''); await load() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not create the track') }
    finally { setCreating(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Monitor</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Disease Progress Tracker</h1>
        <p className="text-agri-muted text-sm mt-1">
          Photograph the same plant over time to see whether it is improving or getting worse.
        </p>
      </div>

      <form onSubmit={create} className="card p-5 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="label" htmlFor="track-label">Plant name or field (for example, "Cassava plot 2")</label>
          <input id="track-label" className="input" value={label} maxLength={80}
            onChange={(e) => setLabel(e.target.value)} placeholder="Cassava plot 2" />
        </div>
        <button className="btn-primary sm:self-end justify-center" disabled={creating || !label.trim()}>Start tracking</button>
      </form>

      {tracks === null && <div className="card p-5 animate-pulse h-24" aria-label="Loading" />}
      {tracks && tracks.length === 0 && (
        <div className="card p-6 text-center text-agri-muted">
          <p className="text-3xl" aria-hidden="true">🌱</p>
          <p>You are not tracking any plants yet. Add a name above to begin.</p>
        </div>
      )}
      {tracks && tracks.map((tr) => <TrackCard key={tr.id} track={tr} onChanged={load} />)}
    </div>
  )
}
