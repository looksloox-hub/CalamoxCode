import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, AudioLines } from 'lucide-react'

const LANGUAGES = [
  { id: 'auto', label: 'EN/HI', desc: 'Auto (English or Hindi)' },
  { id: 'en-US', label: 'EN', desc: 'English' },
  { id: 'hi-IN', label: 'हिंदी', desc: 'Hindi' },
]

/**
 * VoiceController — multilingual Speech-to-Text (English, Hindi, Hinglish).
 *
 * Uses the Web Speech API (SpeechRecognition). On a final result it dispatches:
 *   - `calamox-voice-command`  { text, lang }  → consumed by ChatPanel
 * While listening it dispatches:
 *   - `calamox-voice-activity` { intensity }  → pulses the 3D globe
 */
export default function VoiceController() {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [supported, setSupported] = useState(false)
  const [lang, setLang] = useState('auto')
  const recognitionRef = useRef(null)
  const transcriptRef = useRef('')

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    setSupported(true)

    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) final += res[0].transcript
        else interim += res[0].transcript
      }
      if (final) {
        transcriptRef.current = final
        setTranscript(final)
      } else {
        setTranscript(interim)
      }
    }

    recognition.onend = () => {
      setListening(false)
      window.dispatchEvent(new CustomEvent('calamox-voice-activity', { detail: { intensity: 0 } }))
      const text = transcriptRef.current.trim()
      if (text) {
        window.dispatchEvent(new CustomEvent('calamox-voice-command', { detail: { text, lang } }))
      }
      transcriptRef.current = ''
    }

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setTranscript('Mic permission denied')
      }
      setListening(false)
      window.dispatchEvent(new CustomEvent('calamox-voice-activity', { detail: { intensity: 0 } }))
    }

    recognitionRef.current = recognition
    return () => {
      try { recognition.abort() } catch { /* noop */ }
    }
  }, [lang])

  const toggle = () => {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
      window.dispatchEvent(new CustomEvent('calamox-voice-activity', { detail: { intensity: 0 } }))
      return
    }
    try {
      rec.lang = lang === 'auto' ? (navigator.language.startsWith('hi') ? 'hi-IN' : 'en-IN') : lang
      transcriptRef.current = ''
      setTranscript('')
      rec.start()
      setListening(true)
      window.dispatchEvent(new CustomEvent('calamox-voice-activity', { detail: { intensity: 0.8 } }))
    } catch {
      setTranscript('Mic busy')
    }
  }

  if (!supported) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-slate-600" title="Speech recognition not supported in this browser">
        <AudioLines size={14} /> Voice unsupported
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={lang}
        onChange={e => setLang(e.target.value)}
        className="glass-input px-1.5 py-1.5 text-[10px] cursor-pointer"
        title="Recognition language"
      >
        {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
      <button
        onClick={toggle}
        className={`p-2 rounded-lg transition cursor-pointer ${
          listening
            ? 'bg-danger/20 text-danger animate-pulse shadow-glow-blue'
            : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-brand-glow'
        }`}
        title={listening ? 'Stop listening' : 'Speak a command (EN / हिंदी)'}
      >
        {listening ? <MicOff size={14} /> : <Mic size={14} />}
      </button>
      {transcript && (
        <span className="text-[10px] text-slate-500 max-w-[110px] truncate" title={transcript}>
          "{transcript}"
        </span>
      )}
    </div>
  )
}
