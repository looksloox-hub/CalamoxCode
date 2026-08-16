import { useState, useEffect } from 'react'
import { Key, Save, Trash2, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'

export default function ApiKeyManager({ apiBase }) {
  const [providers, setProviders] = useState([])
  const [keys, setKeys] = useState({})
  const [visible, setVisible] = useState({})
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${apiBase}/api/keys`).then(r => r.json()).then(d => setProviders(d.providers || [])).catch(() => {})
  }, [apiBase])

  const save = async (provider) => {
    const key = keys[provider]
    if (!key || !key.trim()) {
      setError('Please enter a key first')
      setTimeout(() => setError(null), 2000)
      return
    }
    try {
      const res = await fetch(`${apiBase}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: key.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setSaved(provider)
        setKeys(prev => ({ ...prev, [provider]: '' }))
        setTimeout(() => setSaved(null), 2000)
        fetch(`${apiBase}/api/keys`).then(r => r.json()).then(d => setProviders(d.providers || [])).catch(() => {})
      }
    } catch (e) {
      setError('Failed to save key')
      setTimeout(() => setError(null), 2000)
    }
  }

  const remove = async (provider) => {
    await fetch(`${apiBase}/api/keys/${provider}`, { method: 'DELETE' })
    fetch(`${apiBase}/api/keys`).then(r => r.json()).then(d => setProviders(d.providers || [])).catch(() => {})
  }

  const providerColors = {
    openai: 'from-green-500/20 to-green-600/10 border-green-500/30',
    anthropic: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
    openrouter: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    opencode_zen: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    google_gemini: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    groq: 'from-pink-500/20 to-pink-600/10 border-pink-500/30',
    ollama: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
  }

  return (
    <div className="space-y-5 p-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><Key size={22} /> API Keys</h1>
        <p className="text-sm text-slate-500">Add provider keys to enable real AI responses. Stored locally in <code className="text-xs bg-surface-2 px-1.5 py-0.5 rounded font-mono">~/.calamox/api_keys.json</code></p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm fade-in">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="space-y-4">
        {providers.map(p => (
          <div key={p.id} className={`glass p-5 transition-all hover:border-white/[0.12] bg-gradient-to-br ${providerColors[p.id] || ''}`}>
            {/* Provider header — very clear */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center">
                  <Key size={16} className="text-slate-300" />
                </div>
                <div>
                  <div className="text-base font-bold">{p.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{p.id}</div>
                </div>
                {p.has_key && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 border border-success/20">
                    <Check size={12} className="text-success" />
                    <span className="text-[11px] text-success font-semibold">Saved</span>
                  </div>
                )}
              </div>
              {p.has_key && (
                <button onClick={() => remove(p.id)} className="p-2 text-slate-600 hover:text-danger hover:bg-danger/10 rounded-lg transition cursor-pointer" title="Remove key">
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Key input — labeled clearly */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <label className="block text-[11px] text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
                  {p.has_key ? 'Enter new key to replace' : `${p.name} API Key`}
                </label>
                <input
                  type={visible[p.id] ? 'text' : 'password'}
                  value={keys[p.id] || ''}
                  onChange={e => setKeys({ ...keys, [p.id]: e.target.value })}
                  placeholder={p.has_key ? `Current: ${p.key_preview || '••••••••'} (enter new to replace)` : `Paste your ${p.name} API key here`}
                  className="w-full glass-input px-4 py-3 pr-10 text-sm font-mono"
                />
                <button onClick={() => setVisible({ ...visible, [p.id]: !visible[p.id] })} className="absolute right-3 top-9 text-slate-600 hover:text-slate-400 cursor-pointer">
                  {visible[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="flex flex-col justify-end">
                <button
                  onClick={() => save(p.id)}
                  className={`px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                    saved === p.id
                      ? 'bg-success text-white'
                      : 'bg-brand hover:bg-brand-dark text-white'
                  }`}
                >
                  {saved === p.id ? <><Check size={15} /> Saved!</> : <><Save size={15} /> Save</>}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center text-[11px] text-slate-600 mt-4">
        Keys never leave your machine. Only the backend reads them for API calls.
      </div>
    </div>
  )
}
