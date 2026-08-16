import { useState, useEffect, useRef } from 'react'
import { Send, ChevronDown, Sparkles, RotateCcw, Copy, Check, Bot, User, Zap, Route } from 'lucide-react'
import Markdown from './Markdown.jsx'

const KNOWN_MODELS = [
  // ── OpenRouter (free tier) ──────────────────────────────────────────────
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra', provider: 'NVIDIA', providerKey: 'openrouter', desc: '550B MoE — frontier reasoning', free: true },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning', provider: 'NVIDIA', providerKey: 'openrouter', desc: '30B MoE — fast and efficient', free: true },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super', provider: 'NVIDIA', providerKey: 'openrouter', desc: '120B MoE — balanced', free: true },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano', provider: 'NVIDIA', providerKey: 'openrouter', desc: '30B MoE — lightweight', free: true },
  { id: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1', provider: 'Poolside', providerKey: 'openrouter', desc: '118B — coding specialist', free: true },
  { id: 'poolside/laguna-xs-2.1:free', name: 'Laguna XS 2.1', provider: 'Poolside', providerKey: 'openrouter', desc: '33B MoE — coding agent', free: true },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', provider: 'Google', providerKey: 'openrouter', desc: 'Instruction-tuned, general purpose', free: true },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B', provider: 'Google', providerKey: 'openrouter', desc: '26B, 4B active — efficient', free: true },
  { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B', provider: 'OpenAI', providerKey: 'openrouter', desc: 'Open-source GPT variant', free: true },
  { id: 'openrouter/free', name: 'Auto Router', provider: 'OpenRouter', providerKey: 'openrouter', desc: 'Picks the best free model automatically', free: true },
  // ── OpenCode Zen (free + pay-per-use) ───────────────────────────────────
  { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'Fast DeepSeek V4 — free tier', free: true },
  { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'Frontier reasoning — free tier', free: true },
  { id: 'north-mini-code-free', name: 'North Mini Code', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'Coding specialist — free tier', free: true },
  { id: 'mimo-v2.5-free', name: 'MiMo V2.5', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'General purpose — free tier', free: true },
  { id: 'qwen3.6-plus-free', name: 'Qwen 3.6 Plus', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'Strong open model — free tier', free: true },
  { id: 'minimax-m3-free', name: 'MiniMax M3', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'General purpose — free tier', free: true },
  { id: 'big-pickle', name: 'Big Pickle', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'Stealth free model', free: true },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'Fast, pay-per-use', free: false },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'Highest capability DeepSeek', free: false },
  { id: 'glm-5.2', name: 'GLM 5.2', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'General purpose, pay-per-use', free: false },
  { id: 'kimi-k2.6', name: 'Kimi K2.6', provider: 'OpenCode Zen', providerKey: 'opencode_zen', desc: 'Reasoning, pay-per-use', free: false },
  // ── Google Gemini (free tier) ───────────────────────────────────────────
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google Gemini', providerKey: 'google_gemini', desc: 'Fast, free tier available', free: true },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'Google Gemini', providerKey: 'google_gemini', desc: 'Cheapest / fastest, free tier', free: true },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google Gemini', providerKey: 'google_gemini', desc: 'Deep reasoning (limited free tier)', free: false },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Google Gemini', providerKey: 'google_gemini', desc: 'Latest-gen flash model', free: false },
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'Google Gemini', providerKey: 'google_gemini', desc: 'Latest-gen flagship', free: false },
]

export default function Chat({ apiBase }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('nvidia/nemotron-3.5-lightning:free')
  const [modelSearch, setModelSearch] = useState('')
  const [showModels, setShowModels] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(null)
  const messagesEnd = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredModels = KNOWN_MODELS.filter(m =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.provider.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  )

  const currentModel = KNOWN_MODELS.find(m => m.id === model)
  const modelDisplayName = currentModel?.name || model

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

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

  return (
    <div className="flex flex-col h-full max-w-7xl mx-auto bg-[--surface] min-h-screen">
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
            <div className="absolute top-full left-0 mt-2 w-80 glass shadow-glass-lg z-50 p-2 fade-in">
              <input
                type="text"
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}                    placeholder="Search free models..."
                className="w-full px-3 py-2.5 glass-input text-sm mb-2"
                autoFocus
              />
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {Object.entries(
                  filteredModels.reduce((groups, m) => {
                    (groups[m.providerKey] ||= []).push(m)
                    return groups
                  }, {})
                ).map(([providerKey, models]) => (
                  <div key={providerKey} className="mb-1">
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {models[0].provider}
                    </div>
                    {models.map(m => (
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
                    ))}
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
              <Sparkles size={28} className="text-primary-glow" />
            </div>
            <h2 className="text-xl font-bold mb-2">What can I help with?</h2>
            <p className="text-sm text-slate-500 max-w-md">
              Choose a model above, then ask anything. I'll route your prompt to the best-suited agent from the 200 available.
            </p>
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {['Write a bash script', 'Design a landing page', 'Analyze this dataset', 'Security audit'].map(suggestion => (
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
                    <span className="badge border text-[9px] bg-primary/10 text-primary border-primary/20">
                      <Route size={9} className="inline mr-0.5" /> {msg.intentLabel}
                    </span>
                  )}
                  {msg.tool && (
                    <span className="badge border text-[9px] bg-primary/10 text-primary-glow border-primary/20">
                      <Zap size={9} className="inline mr-0.5" /> {msg.tool}
                    </span>
                  )}
                </div>
              )}
              {msg.role === 'assistant'
                ? <Markdown>{msg.content}</Markdown>
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
          Model: {modelDisplayName} · Press Enter to send, Shift+Enter for newline
        </div>
      </div>

      {/* Click outside to close model dropdown */}
      {showModels && <div className="fixed inset-0 z-40" onClick={() => setShowModels(false)} />}
    </div>
  )
}
