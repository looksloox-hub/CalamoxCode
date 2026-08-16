import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, AudioLines, Waves, Headphones, Terminal } from 'lucide-react'

/**
 * ChatVoiceConsole — Hinglish Chat & Audio Wave.
 *
 * Multilingual voice/chat console supporting English, Hindi, and Hinglish.
 * Shows audio input wave visualizer, sends voice commands to backend,
 * and displays chat messages with model routing info.
 * Dispatches `calamox-voice-command` events with { text, lang }.
 */
export default function ChatVoiceConsole({ apiBase = '', className = '' }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('nvidia/nemotron-3.5-lightning:free')
  const [modelSearch, setModelSearch] = useState('')
  const [showModels, setShowModels] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(null)
  const [listening, setListening] = useState(false)
  const messagesEnd = useRef(null)
  const inputRef = useRef(null)
  const socketRef = useRef<WebSocket | null>(null)

  // Initialize WebSocket connection
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    socketRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'tasks_updated') {
          window.dispatchEvent(new CustomEvent('calamox-task-updated'))
        } else if (msg.type === 'agent_activity') {
          window.dispatchEvent(new CustomEvent('calamox-agent-activity', { detail: { count: msg.count || 1 } }))
        }
      } catch { /* ignore malformed frames */ }
    }

    ws.onopen = () => {
      // Send initial health check
      ws.send(JSON.stringify({ type: 'health-check' }))
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
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: model, provider: currentModel?.providerKey || 'openrouter' }),
      })
      const data = await res.json()

      let responseText = data.response || JSON.stringify(data, null, 2)
      let agentName = data.agent?.name || ''
      let agentGroup = data.agent?.group || ''
      let usage = data.usage || null
      let intent = data.routing?.intent || (data.executed ? data.tool : null)
      let intentLabel = data.routing?.intent_label || ''
      let toolExecuted = data.tool || null

      const agentMsg = {
        role: 'assistant', content: responseText, agent: agentName, agentGroup,
        intent, intentLabel, tool: toolExecuted, model, usage, timestamp: Date.now(),
      }
      setMessages(prev => [...prev, agentMsg])
      window.dispatchEvent(new CustomEvent('calamox-agent-activity', { detail: { count: 1 } }))
      window.dispatchEvent(new CustomEvent('calamox-task-updated'))
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now() }])
    }
    setLoading(false)
  }

  const copyMessage = (text, idx) => {
    navigator.clipboard.writeText(text)
    setCopied(idx)
    setTimeout(() => setCopied(null), 1500)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const toggleVoice = async () => {
    setListening(true)
    try {
      // Use the Web Speech API if available
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SR) {
        const recognition = new SR()
        recognition.continuous = false
        recognition.interimResults = true
        recognition.maxAlternatives = 1
        recognition.lang = 'en-IN' // Default to English

        recognition.onresult = (event) => {
          let interim = ''
          let final = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i]
            if (res.isFinal) final += res[0].transcript
            else interim += res[0].transcript
          }
          if (final) {
            const text = final.trim()
            setTranscript(text)

            // Send to backend via WebSocket
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'voice-command',
                text,
                lang: 'en-IN'
              }))
            }

            // Also dispatch custom event for other components
            window.dispatchEvent(new CustomEvent('calamox-voice-command', { detail: { text, lang: 'en-IN' } }))
          }
          if (interim) {
            setTranscript(interim)
          }
        }

        recognition.onerror = (e) => {
          setTranscript('Mic permission denied or not supported')
          setListening(false)
        }

        recognition.onend = () => {
          setListening(false)
        }

        recognition.start()
      } else {
        // Fallback: type command manually
        setListening(false)
        setTranscript('Speech recognition not supported in this browser')
      }
    } catch (err) {
      console.error('Voice recognition error:', err)
      setListening(false)
      setTranscript('Voice recognition error')
    }
  }

  const [transcript, setTranscript] = useState('')

  return (
    <div className={`flex flex-col h-full max-w-[600px] mx-auto bg-[--surface] min-h-screen ${className}`}>
      {/* Model selector header */}
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

        <button onClick={() => setMessages([])} className="btn-ghost flex items-center gap-1.5 text-xs cursor-pointer">
          <RotateCcw size={13} /> New chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4" onClick={() => showModels && setShowModels(false)}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20 flex items-center justify-center mb-4">
              <Zap size={28} className="text-primary-glow" />
            </div>
            <h2 className="text-xl font-bold mb-2">What can I help with?</h2>
            <p className="text-sm text-slate-500 max-w-md">
              Choose a model above, then ask anything. I'll route your prompt to the best-suited agent from the 200 available.
            </p>
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {['Write a bash script', 'Design a landing page', 'Analyze this dataset', 'Control devices'].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus() }}
                  className="px-3 py-1.5 glass-sm text-xs text-slate-400 hover:text-slate-200 hover:bg-primary/5 transition cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 fade-in ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary-glow/20 border border-primary/20 flex items-center justify-center shrink-0 mt-1">
                <Bot size={16} className="text-primary-glow" />
              </div>
            )}
            <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-agent'}>
              {(msg.agent || msg.intent || msg.tool) && (
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  {msg.agent && <span className="text-[11px] text-primary font-semibold">via {msg.agent}{msg.agentGroup ? ` · ${msg.agentGroup}` : ''}</span>}
                  {msg.intent && msg.intentLabel && msg.intent !== msg.tool && (
                    <span className="border text-[9px] bg-primary/10 text-primary border-primary/20">
                      <Route size={9} className="inline mr-0.5" /> {msg.intentLabel}
                    </span>
                  )}
                  {msg.tool && (
                    <span className="border text-[9px] bg-primary/10 text-primary-glow border-primary/20">
                      <Zap size={9} className="inline mr-0.5" /> {msg.tool}
                    </span>
                  )}
                </div>
              )}
              {msg.role === 'assistant'
                ? <div className="whitespace-pre-wrap">{msg.content}</div>
                : <div className="whitespace-pre-wrap">{msg.content}</div>}
              <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/[0.06]">
                <span className="text-[10px] text-slate-500">
                  {msg.model && `${msg.model.split('/').pop()} · `}{msg.usage ? `${msg.usage.prompt_tokens + msg.usage.completion_tokens} tokens · ` : ''}{new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                <button
                  onClick={() => copyMessage(msg.content, i)}
                  className="text-slate-500 hover:text-slate-300 transition cursor-pointer"
                >
                  {copied === i ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20 flex items-center justify-center shrink-0 mt-1">
                <User size={16} className="text-primary-glow" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 fade-in">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-primary-glow" />
            </div>
            <div className="chat-bubble-agent flex items-center gap-1.5 py-3">
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="glass flex items-end gap-2 p-2 bg-[--surface-2]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 max-h-32 font-sans"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl bg-primary hover:bg-primary-dark transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={16} className="text-[--surface-0]" />
          </button>
        </div>
        <div className="text-center mt-2 text-[11px] text-slate-500">
          Model: {modelDisplayName} · Press Enter to send, Shift+Enter for newline · <button onClick={toggleVoice} className="ml-2 text-primary hover:text-primary/80 cursor-pointer" title="Voice input">
            <Mic size={12} />
          </button>
        </div>
      </div>

      {/* Click outside to close model dropdown */}
      {showModels && <div className="fixed inset-0 z-40" onClick={() => setShowModels(false)} />}
    </div>
  )
}