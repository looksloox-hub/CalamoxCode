import { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Sparkles, Volume2, VolumeX, Route, Zap, Copy, Check, Terminal, FileDiff } from 'lucide-react'
import Markdown from './Markdown.jsx'
import VoiceController from './VoiceController.jsx'
import CommandSuggestions, { SLASH_COMMANDS } from './CommandSuggestions.jsx'

const intentColor = {
  task_management: 'bg-brand/15 text-brand border-brand/20',
  code_execution: 'bg-success/15 text-success border-success/20',
  web_search: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  os_automation: 'bg-warning/15 text-warning border-warning/20',
  news: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  finance: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  design: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  general: 'bg-white/[0.05] text-slate-400 border-white/10',
}

/**
 * TerminalBlock — renders a structured code-execution payload as a live
 * terminal-style output with stdout/stderr, exit code, source, and diff
 * highlighting (lines starting with +/-).
 */
function TerminalBlock({ exec }) {
  const [copied, setCopied] = useState(false)
  if (!exec) return null

  const stdout = exec.stdout || ''
  const stderr = exec.stderr || ''
  const exitOk = exec.exit_code === 0
  const copy = () => {
    navigator.clipboard.writeText(`$ ${exec.command}\n${stdout}${stderr ? `\n${stderr}` : ''}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const renderLines = (text, kind) => {
    const lines = String(text).split('\n').filter(l => l.trim() !== '')
    return lines.map((line, i) => {
      const isDiff = line.startsWith('+') || line.startsWith('-') || line.startsWith('@@') || line.startsWith('diff ')
      const cls = isDiff
        ? line.startsWith('+') ? 'text-success' : line.startsWith('-') ? 'text-danger' : 'text-brand-glow'
        : kind === 'stderr' ? 'text-warning' : 'text-slate-300'
      return (
        <div key={i} className={`whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed ${cls}`}>
          {line}
        </div>
      )
    })
  }

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-white/10 bg-[#0a0f1e]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.05] border-b border-white/10">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
          <Terminal size={11} className={exitOk ? 'text-success' : 'text-danger'} />
          {exec.command}
        </span>
        <div className="flex items-center gap-2">
          <span className={`badge border text-[9px] font-mono ${exitOk ? 'bg-success/10 text-success border-success/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
            exit {exec.exit_code}
          </span>
          {exec.duration_ms != null && (
            <span className="text-[9px] text-slate-500 font-mono">{Math.round(exec.duration_ms)}ms</span>
          )}
          <span className="text-[9px] text-slate-600 font-mono uppercase">{exec.source}</span>
          <button
            onClick={copy}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-0.5">
        <div className="text-[11px] text-brand-glow font-mono select-none">$ {exec.command}</div>
        {stdout && renderLines(stdout, 'stdout')}
        {stderr && (
          <>
            <div className="text-[10px] text-slate-500 font-mono uppercase mt-1">stderr</div>
            {renderLines(stderr, 'stderr')}
          </>
        )}
        {!stdout && !stderr && <div className="text-[11px] text-slate-600 font-mono">(no output)</div>}
      </div>
    </div>
  )
}

/**
 * ChatPanel — right side panel (Chat & Voice Console).
 *
 * - Real-time text chat with the Calamox backend (/api/chat).
 * - "/" opens the slash-command autocomplete popup (CommandSuggestions).
 * - Mic button (multilingual en/hi) via VoiceController; voice commands are
 *   auto-submitted as chat messages.
 * - TTS replies via the backend Edge-TTS endpoint, falling back to the Web
 *   Speech API when edge-tts is unavailable.
 * - Code-execution responses render as live terminal blocks (stdout/stderr,
 *   exit code, diffs) instead of plain text.
 * - Articles imported from the News page ("Import to Chat") are injected as
 *   user messages and auto-summarized.
 */
export default function ChatPanel({ apiBase, importArticle }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [voiceLang, setVoiceLang] = useState('en-IN')
  const [showCommands, setShowCommands] = useState(false)
  const [cmdIndex, setCmdIndex] = useState(0)
  const [providers, setProviders] = useState([])
  const [models, setModels] = useState([])
  const [selectedProvider, setSelectedProvider] = useState('openrouter')
  const [selectedModel, setSelectedModel] = useState('nvidia/nemotron-3.5-lightning:free')
  const messagesEnd = useRef(null)
  const inputRef = useRef(null)
  const processedImport = useRef(null)

  // Load the provider/model catalogs from the backend (single source of truth:
  // OpenRouter, OpenCode Zen, Google Gemini). Falls back to the OpenRouter
  // default if the endpoint is unavailable.
  useEffect(() => {
    fetch(`${apiBase}/api/chat/models`)
      .then(r => r.json())
      .then(d => {
        const provs = d.providers || []
        setProviders(provs)
        const all = provs.flatMap(p =>
          (p.models || []).map(m => ({ ...m, providerKey: p.id }))
        )
        setModels(all)
        if (provs.length) {
          const first = provs[0]
          setSelectedProvider(first.id)
          if (first.default_model) setSelectedModel(first.default_model)
        }
      })
      .catch(() => {})
  }, [apiBase])

  const switchProvider = (providerId) => {
    setSelectedProvider(providerId)
    const prov = providers.find(p => p.id === providerId)
    if (prov?.default_model) setSelectedModel(prov.default_model)
  }

  const currentModelName = models.find(m => m.id === selectedModel)?.name || selectedModel

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Consume an article imported from the News page ("Import to Chat")
  useEffect(() => {
    if (!importArticle || processedImport.current === importArticle) return
    processedImport.current = importArticle
    const title = importArticle.title || 'Untitled article'
    const url = importArticle.url || ''
    const body = (importArticle.summary || importArticle.content || '').replace(/<[^>]+>/g, '').slice(0, 1500)
    const text = `📰 Imported article: ${title}\n${url}\n\n${body}`
    send(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importArticle])

  useEffect(() => {
    const onVoiceCommand = (e) => {
      const text = e.detail?.text
      if (text && text.trim()) {
        setInput(text.trim())
        send(text.trim())
      }
    }
    window.addEventListener('calamox-voice-command', onVoiceCommand)
    return () => window.removeEventListener('calamox-voice-command', onVoiceCommand)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Speak using the backend Edge-TTS endpoint when available; otherwise fall
   * back to the browser Web Speech API.
   */
  const speak = async (text) => {
    if (!ttsEnabled || !text) return
    const clean = text.replace(/[#*`>]/g, '').slice(0, 400)
    try {
      const res = await fetch(`${apiBase}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, lang: voiceLang }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        setSpeaking(true)
        audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url) }
        audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); speakFallback(clean) }
        await audio.play()
        return
      }
      speakFallback(clean)
    } catch {
      speakFallback(clean)
    }
  }

  const speakFallback = (text) => {
    if (!('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = voiceLang === 'hi-IN' ? 'hi-IN' : 'en-IN'
      utterance.rate = 1.02
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(utterance)
    } catch {
      setSpeaking(false)
    }
  }

  const send = async (raw) => {
    const text = (raw ?? input).trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setShowCommands(false)
    setLoading(true)

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: selectedModel, provider: selectedProvider }),
      })
      const data = await res.json()
      const responseText = data.response || JSON.stringify(data, null, 2)
      const agentName = data.agent?.name || ''
      const intent = data.routing?.intent || (data.executed ? data.tool : null)
      const intentLabel = data.routing?.intent_label || ''
      const toolExecuted = data.tool || null

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: responseText,
        agent: agentName,
        intent,
        intentLabel,
        tool: toolExecuted,
        execution: data.execution || null,
        timestamp: Date.now(),
      }])
      speak(responseText)
      window.dispatchEvent(new CustomEvent('calamox-agent-activity', { detail: { count: 1 } }))
      // Refresh the Task Panel — the backend may have created/updated tasks
      window.dispatchEvent(new CustomEvent('calamox-task-updated'))
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now() }])
    }
    setLoading(false)
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setInput(value)
    const isSlash = value.startsWith('/') && !value.includes(' ')
    setShowCommands(isSlash)
    if (isSlash) setCmdIndex(0)
  }

  const handleKeyDown = (e) => {
    // Command autocomplete navigation
    if (showCommands) {
      const matches = SLASH_COMMANDS.filter(c => c.command.toLowerCase().includes(input.toLowerCase()))
      const exactMatch = matches.some(c => c.command === input.trim())
      if (matches.length > 0) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCmdIndex(i => (i + 1) % matches.length); return }
        if (e.key === 'ArrowUp') { e.preventDefault(); setCmdIndex(i => (i - 1 + matches.length) % matches.length); return }
        // Enter runs an already-typed command; Tab autocompletes a partial one
        if (e.key === 'Enter' && exactMatch) { /* fall through to send */ }
        else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const picked = matches[Math.min(cmdIndex, matches.length - 1)]
          setInput(`${picked.command} `)
          setShowCommands(false)
          inputRef.current?.focus()
          return
        }
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowCommands(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const pickCommand = (i) => {
    const matches = SLASH_COMMANDS.filter(c => c.command.toLowerCase().includes(input.toLowerCase()))
    const picked = matches[Math.min(i, matches.length - 1)]
    setInput(`${picked.command} `)
    setShowCommands(false)
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full glass border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2"><Sparkles size={15} className="text-brand-glow" /> Chat &amp; Voice</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">English · हिंदी · Hinglish</p>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={voiceLang}
            onChange={e => setVoiceLang(e.target.value)}
            className="glass-input px-2 py-1.5 text-[10px] cursor-pointer"
            title="Assistant reply language"
          >
            <option value="en-IN">EN</option>
            <option value="hi-IN">हिंदी</option>
          </select>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`p-2 rounded-lg transition cursor-pointer ${ttsEnabled ? 'text-brand-glow bg-brand/10' : 'text-slate-600 hover:bg-white/5'}`}
            title={ttsEnabled ? 'Mute replies' : 'Enable voice replies'}
          >
            {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <VoiceController />
        </div>
      </div>

      {/* Provider / model picker — OpenRouter · OpenCode Zen · Google Gemini */}
      {providers.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
          <select
            value={selectedProvider}
            onChange={e => switchProvider(e.target.value)}
            className="glass-input px-2 py-1.5 text-[10px] cursor-pointer font-semibold shrink-0"
            title="LLM provider"
          >
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="glass-input px-2 py-1.5 text-[10px] cursor-pointer flex-1 min-w-0 truncate"
            title="Model"
          >
            {models
              .filter(m => m.providerKey === selectedProvider)
              .map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.free ? ' · FREE' : ''}</option>
              ))}
          </select>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand/20 to-brand-glow/10 border border-brand/20 flex items-center justify-center mb-3">
              <Bot size={22} className="text-brand" />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ask me anything — I'll route to the best of 200 agents.
              <br />
              Type <span className="text-brand">/</span> for commands, or try:{" "}
              <span className="text-brand">/code ls -la</span>, <span className="text-brand">/news</span>,{" "}
              <span className="text-brand">"add a task: review PR"</span>
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 fade-in ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand/20 to-brand-glow/10 border border-brand/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-brand" />
              </div>
            )}
            <div className={msg.role === 'user' ? 'chat-bubble-user !text-[13px] !px-3.5 !py-2.5 max-w-[85%]' : 'chat-bubble-agent !text-[13px] !px-3.5 !py-2.5 max-w-[85%]'}>
              {(msg.agent || msg.intent || msg.tool) && (
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  {msg.agent && <span className="text-[10px] text-brand font-semibold">via {msg.agent}</span>}
                  {msg.intent && msg.intentLabel && msg.intent !== msg.tool && (
                    <span className={`badge border text-[9px] ${intentColor[msg.intent] || intentColor.general}`}>
                      <Route size={9} className="inline mr-0.5" /> {msg.intentLabel}
                    </span>
                  )}
                  {msg.tool && (
                    <span className="badge border text-[9px] bg-brand/10 text-brand-glow border-brand/20">
                      <Zap size={9} className="inline mr-0.5" /> {msg.tool}
                    </span>
                  )}
                  {msg.execution && (
                    <span className="badge border text-[9px] bg-success/10 text-success border-success/20">
                      <FileDiff size={9} className="inline mr-0.5" /> executed
                    </span>
                  )}
                </div>
              )}
              {msg.role === 'assistant' ? (
                <>
                  {msg.execution && <TerminalBlock exec={msg.execution} />}
                  <Markdown>{msg.content}</Markdown>
                </>
              ) : (
                <div className="whitespace-pre-wrap break-words text-[13px]">{msg.content}</div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent/20 to-orange-500/20 border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-accent" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 fade-in">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand/20 to-brand-glow/10 border border-brand/20 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-brand" />
            </div>
            <div className="chat-bubble-agent !px-3.5 flex items-center gap-1.5 py-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-brand typing-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-brand typing-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-brand typing-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3">
        <div className="relative">
          {showCommands && (
            <CommandSuggestions
              query={input}
              selected={cmdIndex}
              onSelect={pickCommand}
              onClose={() => setShowCommands(false)}
            />
          )}
          <div className="flex items-end gap-1.5 p-1.5 bg-white/[0.04] border border-white/[0.06] rounded-xl">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message Calamox…"
              rows={1}
              className="flex-1 bg-transparent border-none outline-none resize-none px-2.5 py-2 text-[13px] text-slate-100 placeholder:text-slate-600 max-h-28 font-sans"
              style={{ minHeight: '38px' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="p-2.5 rounded-lg bg-gradient-to-r from-brand to-brand-glow hover:brightness-110 disabled:opacity-30 transition cursor-pointer shrink-0"
            >
              <Send size={15} className="text-white" />
            </button>
          </div>
        </div>
        <div className="flex justify-between mt-1.5 px-1">
          <span className="text-[9px] text-slate-600 truncate">{currentModelName} · Enter to send · type <span className="text-brand-glow">/</span> for commands</span>
          {speaking && <span className="text-[9px] text-brand-glow animate-pulse">Speaking…</span>}
        </div>
      </div>
    </div>
  )
}
