import { useState, useEffect, useCallback } from 'react'
import { Upload, PlayCircle, Film, RefreshCw, ExternalLink, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'

const JOB_COLORS = {
  queued: 'bg-white/[0.04] text-slate-400 border-white/10',
  preparing: 'bg-warning/15 text-warning border-warning/20',
  uploading: 'bg-brand/15 text-brand border-brand/20',
  processing: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  published: 'bg-success/15 text-success border-success/20',
  failed: 'bg-danger/15 text-danger border-danger/20',
}

export default function YouTubeUploader({ apiBase }) {
  const [status, setStatus] = useState(null)
  const [jobs, setJobs] = useState([])
  const [form, setForm] = useState({ video_path: '', title: '', description: '', tags: '', visibility: 'private' })
  const [metadata, setMetadata] = useState(null)
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState(null)

  const loadStatus = useCallback(() => {
    fetch(`${apiBase}/api/youtube/check`).then(r => r.json()).then(setStatus).catch(() => {})
  }, [apiBase])

  const loadJobs = useCallback(() => {
    fetch(`${apiBase}/api/youtube/jobs`).then(r => r.json()).then(d => setJobs(d.jobs || [])).catch(() => {})
  }, [apiBase])

  useEffect(() => {
    loadStatus()
    loadJobs()
    const id = setInterval(loadJobs, 8000)
    return () => clearInterval(id)
  }, [loadStatus, loadJobs])

  const parseMetadata = async () => {
    if (!form.video_path.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/api/youtube/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: form.video_path.trim() }),
      })
      setMetadata(await res.json())
    } catch { setMetadata({ error: 'Failed to parse metadata' }) }
    setLoading(false)
  }

  const upload = async () => {
    if (!form.video_path.trim() || !form.title.trim()) return
    setLoading(true)
    setJob(null)
    try {
      const res = await fetch(`${apiBase}/api/youtube/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_path: form.video_path.trim(),
          title: form.title.trim(),
          description: form.description,
          tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
          visibility: form.visibility,
        }),
      })
      setJob(await res.json())
      setTimeout(loadJobs, 1500)
    } catch (e) { setJob({ error: e.message }) }
    setLoading(false)
  }

  const eng = (name, ok) => (
    <span className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-success' : 'text-slate-500'}`}>
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {name}
    </span>
  )

  return (
    <div className="space-y-5 p-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><PlayCircle size={22} /> YouTube Upload</h1>
        <p className="text-sm text-slate-500">Queue local videos for autonomous upload via headless Chromium</p>
      </div>

      {/* Engine status */}
      <div className="glass p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Film size={15} className="text-danger" /> Upload engines</div>
        {status ? (
          <>
            {eng('Playwright', status.playwright)}
            {eng('Node bridge', status.bridge)}
            {eng('ffprobe', status.ffprobe)}
            {eng('Credentials', status.credentials_configured)}
          </>
        ) : <span className="text-xs text-slate-500">Checking…</span>}
      </div>

      {/* Upload form */}
      <div className="glass p-5 space-y-3">
        <h2 className="text-sm font-bold flex items-center gap-2"><Upload size={15} className="text-brand" /> Queue an upload</h2>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1 font-medium uppercase tracking-wider">Video file path (local)</label>
          <div className="flex gap-2">
            <input
              value={form.video_path}
              onChange={e => setForm({ ...form, video_path: e.target.value })}
              placeholder="/home/you/videos/my-video.mp4"
              className="flex-1 glass-input px-4 py-2.5 text-sm font-mono"
            />
            <button onClick={parseMetadata} disabled={loading || !form.video_path.trim()}
              className="btn-ghost flex items-center gap-1.5 text-xs cursor-pointer disabled:opacity-40">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Parse
            </button>
          </div>
          {metadata && (
            <div className="mt-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs space-y-1 font-mono">
              {metadata.error
                ? <span className="text-danger">{metadata.error}</span>
                : <>
                    <div className="text-slate-300">{metadata.filename} · {metadata.duration} · {metadata.width}×{metadata.height}</div>
                    <div className="text-slate-500">{metadata.size_bytes ? `${(metadata.size_bytes / 1048576).toFixed(1)} MB` : ''} · {metadata.video_codec} / {metadata.audio_codec}</div>
                  </>}
            </div>
          )}
        </div>
        <input
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          placeholder="Video title *"
          className="w-full glass-input px-4 py-2.5 text-sm"
        />
        <textarea
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="Description"
          rows={2}
          className="w-full glass-input px-4 py-2.5 text-sm resize-none"
        />
        <div className="flex gap-2">
          <input
            value={form.tags}
            onChange={e => setForm({ ...form, tags: e.target.value })}
            placeholder="Tags (comma separated)"
            className="flex-1 glass-input px-4 py-2.5 text-sm"
          />
          <select
            value={form.visibility}
            onChange={e => setForm({ ...form, visibility: e.target.value })}
            className="glass-input px-3 py-2.5 text-sm cursor-pointer"
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
        </div>
        <button onClick={upload} disabled={loading || !form.video_path.trim() || !form.title.trim()}
          className="btn-primary flex items-center gap-2 cursor-pointer disabled:opacity-40 w-full justify-center">
          <Upload size={15} /> {loading ? 'Working…' : 'Queue upload'}
        </button>
        {job && (
          <div className={`p-3 rounded-lg border text-xs ${job.error ? 'bg-danger/10 border-danger/20 text-danger' : 'bg-success/10 border-success/20 text-success'}`}>
            {job.error || `✅ Upload job queued — ${job.id}`}
          </div>
        )}
      </div>

      {/* Jobs */}
      <div>
        <h2 className="text-sm font-bold mb-2 flex items-center gap-2"><Clock size={15} className="text-brand-glow" /> Upload jobs</h2>
        {jobs.length === 0 && <div className="glass p-6 text-center text-xs text-slate-600">No upload jobs yet.</div>}
        <div className="space-y-2">
          {jobs.map(j => (
            <div key={j.id} className="glass p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{j.title}</div>
                  <div className="text-[11px] text-slate-500 truncate font-mono">{j.video_path}</div>
                </div>
                <span className={`badge border shrink-0 ${JOB_COLORS[j.status] || JOB_COLORS.queued}`}>
                  {j.status === 'uploading' || j.status === 'preparing' || j.status === 'processing'
                    ? <Loader2 size={11} className="inline mr-1 animate-spin" /> : null}
                  {j.status}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-glow transition-all" style={{ width: `${j.progress || 0}%` }} />
                </div>
                <span className="text-[10px] text-slate-500">{j.progress || 0}%</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">{j.stage || j.status}</span>
                {j.status === 'failed' && j.error && <span className="text-[10px] text-danger truncate ml-3">{j.error}</span>}
                {j.video_url && (
                  <a href={j.video_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-brand hover:text-brand-glow">
                    Open <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
