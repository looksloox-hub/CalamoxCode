import { useState, useEffect, useRef } from 'react'
import { Camera, MicOff, Zap, Loader, RefreshCcw, Palette, AlertCircle } from 'lucide-react'

/**
 * VisionPreview — Live Screen & Camera Overlay.
 *
 * Captures the active desktop screenshot or webcam feed.
 * Analyzes screen content using multimodal models (Gemini/Qwen/VL/Ollama)
 * and displays live insights.
 * Listens for `calamox-screen-analysis` events with analysis results.
 * Dispatches `calamox-screen-capture` events when capture is triggered.
 */
export default function VisionPreview({ apiBase = '', className = '' }) {
  const [stream, setStream] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [model, setModel] = useState('nvidia/nemotron-3.5-lightning:free')
  const [modelSearch, setModelSearch] = useState('')
  const [showModels, setShowModels] = useState(false)
  const [loading, setLoading] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const socketRef = useRef<WebSocket | null>(null)

  // Initialize WebSocket connection
  useEffect(() => {
    const proto = window.location.protocol === 'https?' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    socketRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'screen-analysis') {
          setAnalysis(msg.analysis || null)
        } else if (msg.type === 'tasks_updated') {
          window.dispatchEvent(new CustomEvent('calamox-task-updated'))
        } else if (msg.type === 'agent_activity') {
          window.dispatchEvent(new CustomEvent('calamox-agent-activity', { detail: { count: msg.count || 1 } }))
        }
      } catch { /* ignore malformed frames */ }
    }

    ws.onopen = () => {
      // Request initial screen analysis
      ws.send(JSON.stringify({ type: 'request-screen-analysis' }))
    }

    ws.onclose = () => {
      setTimeout(() => {
        if (socketRef.current) socketRef.current.close()
      }, 5000)
    }

    return () => {
      ws.onmessage = null
      ws.onclose = null
      ws.close()
    }
  }, [apiBase])

  useEffect(() => {
    if (!videoRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')

    const captureFrame = () => {
      if (!video || !canvas || !ctx) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      const imageData = canvas.toDataURL('image/jpeg', 0.8)
      return imageData
    }

    const analyzeFrame = async () => {
      const imageData = captureFrame()
      if (!imageData) return

      setCapturing(true)
      try {
        const res = await fetch(`${apiBase}/api/vision/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageData, model: model }),
        })
        const data = await res.json()
        setAnalysis(data.analysis || null)
      } catch (err) {
        console.error('Vision analysis error:', err)
        setAnalysis({ error: err.message || 'Analysis failed' })
      } finally {
        setCapturing(false)
      }
    }

    // Start interval-based analysis
    const interval = setInterval(analyzeFrame, 3000)
    analyzeFrame() // Initial capture

    return () => {
      clearInterval(interval)
    }
  }, [model, apiBase])

  const toggleCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      setStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error('Camera access error:', err)
      setAnalysis({ error: 'Camera permission denied' })
    }
  }

  const captureScreenshot = async () => {
    setCapturing(true)
    try {
      const canvas = canvasRef.current
      if (!canvas) return

      const video = videoRef.current
      if (!video) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(video, 0, 0)

      const imageData = canvas.toDataURL('image/jpeg', 0.8)

      // Send to backend for analysis
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'screen-capture',
          image: imageData
        }))
      }

      // Also dispatch custom event
      window.dispatchEvent(new CustomEvent('calamox-screen-capture', { detail: { image: imageData } }))
    } catch (err) {
      console.error('Screenshot error:', err)
    } finally {
      setCapturing(false)
    }
  }

  const filteredModels = [
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra', provider: 'NVIDIA', providerKey: 'openrouter', desc: '550B MoE — frontier reasoning', free: true },
    { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning', provider: 'NVIDIA', providerKey: 'openrouter', desc: '30B MoE — fast and efficient', free: true },
    { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', provider: 'Google', providerKey: 'google_gemini', desc: 'Instruction-tuned, general purpose', free: true },
    { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B', provider: 'OpenAI', providerKey: 'openrouter', desc: 'Open-source GPT variant', free: true },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google Gemini', providerKey: 'google_gemini', desc: 'Fast, free tier available', free: true },
  ]

  const currentModel = filteredModels.find(m => m.id === model)
  const modelDisplayName = currentModel?.name || model

  const sendMessage = async () => {
    // Placeholder - could integrate with chat
  }

  const copyMessage = () => {}

  const handleKeyDown = () => {}

  return (
    <div className={`flex flex-col h-full max-w-[600px] mx-auto bg-[--surface] min-h-screen ${className}`}>
      {/* Model selector */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="relative">
          <button
            onClick={() => setShowModels(!showModels)}
            className="flex items-center gap-2 px-3 py-2 glass-sm hover:bg-white/[0.06] transition cursor-pointer"
          >
            <Zap size={14} className="text-primary-glow" />
            <span className="text-sm font-semibold text-primary">{modelDisplayName}</span>
            <ChevronDown size={14} className={`text-slate-500 transition-transform ${showModels ? 'rotate-180' : ''}`} />
          </button>

          {showModels && (
            <div className="absolute top-full left-0 w-80 glass shadow-glass-lg z-50 p-2 fade-in">
              <input
                type="text"
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
                placeholder="Search free models..."
                className="w-full px-3 py-2.5 glass-input text-sm mb-2"
                autoFocus
              />
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {filteredModels.map(m => (
                  <div key={m.id} className="mb-1">
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {m.provider}
                    </div>
                    {m.free && (
                      <button
                        key={m.id}
                        onClick={() => { setModel(m.id); setShowModels(false); setModelSearch('') }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition cursor-pointer ${
                          model === m.id ? 'bg-primary/15 text-primary' : 'text-slate-300 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold">{m.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{m.desc || m.id}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{m.provider}</span>
                          {m.free && <span className="text-[9px] text-primary font-bold">FREE</span>}
                        </div>
                      </button>
                    )}
                    {!m.free && (
                      <button
                        key={m.id}
                        onClick={() => { setModel(m.id); setShowModels(false); setModelSearch('') }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition cursor-pointer text-slate-400`}
                      >
                        <div>
                          <div className="text-sm font-semibold">{m.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{m.desc || m.id}</div>
                        </div>
                      </button>
                    )}
                  </div>
                ))}
                {filteredModels.length === 0 && modelSearch && (
                  <button
                    onClick={() => { setModel(modelSearch); setShowModels(false); setModelSearch('') }}
                    className="w-full px-3 py-2 rounded-lg text-left text-brand hover:bg-brand/10 transition cursor-pointer"
                  >
                    Use custom model: {modelSearch}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <button onClick={captureScreenshot} className="p-2.5 rounded-xl bg-primary/20 hover:bg-primary/30 transition cursor-pointer" title="Capture & Analyze">
          <Camera className="mr-1 text-primary" /> Analyze
        </button>
      </div>

      {/* Video / Canvas preview */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {stream === null && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <Camera className="w-16 h-16 mx-auto mb-3" /> Camera access required
          </div>
        )}
      </div>

      {/* Analysis results */}
      {analysis && (
        <div className="p-4 glass margin-t">
          <h3 className="font-bold text-[12px] mb-3">Screen Analysis</h3>
          {analysis.error ? (
            <div className="bg-red-500/10 text-red-400 rounded p-3 text-sm mb-3">
              <AlertCircle className="mr-1" /> {analysis.error}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              {analysis.objects && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Objects detected: {analysis.objects.length}
                  </div>
                  <ul className="list-disc pl-3 space-y-1">
                    {analysis.objects.map((obj, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded bg-primary" />
                        <span>{obj.label || obj.name || 'Unknown'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.text && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Text extracted:
                  </div>
                  <p className="whitespace-pre-wrap text-slate-100">{analysis.text.substring(0, 300)}...</p>
                </div>
              )}
              {analysis.activities && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Activities:
                  </div>
                  <ul className="list-disc pl-3 space-y-1">
                    {analysis.activities.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Model selector at bottom */}
      <div className="px-4 pb-4">
        <div className="glass flex items-end gap-2 p-2 bg-[--surface-2]">
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none resize-none px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          >
            {filteredModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Click outside to close model dropdown */}
      {showModels && <div className="fixed inset-0 z-40" onClick={() => setShowModels(false)} />}
    </div>
  )
}