import { useState, useEffect } from 'react'
import { Search, ChevronDown, ChevronRight, Send, Zap, ArrowRight } from 'lucide-react'

export default function AgentGrid({ apiBase }) {
  const [groups, setGroups] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${apiBase}/api/agents/groups`).then(r => r.json()).then(d => setGroups(d.groups || [])).catch(() => {})
  }, [apiBase])

  const filtered = search
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()) || g.description?.toLowerCase().includes(search.toLowerCase()))
    : groups

  const handleDispatch = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/api/agents/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, agent_id: selectedAgent?.id }),
      })
      setResult(await res.json())
    } catch (e) {
      setResult({ error: e.message })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1">Multi-Agent Workspace</h1>
        <p className="text-sm text-slate-500">200 specialized agents across 20 functional groups</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-3.5 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search groups..."
          className="w-full pl-11 pr-4 py-3 glass-input text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(group => (
          <div key={group.id} className="glass overflow-hidden transition-all duration-200 hover:border-white/[0.12]">
            <button
              onClick={() => setExpanded(expanded === group.id ? null : group.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-lg">
                {group.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{group.name}</div>
                <div className="text-xs text-slate-500">{group.agent_count} agents</div>
              </div>
              <div className={`p-1 rounded-lg transition-transform ${expanded === group.id ? 'rotate-0' : '-rotate-90'}`}>
                <ChevronDown size={16} className="text-slate-500" />
              </div>
            </button>

            {expanded === group.id && (
              <div className="px-4 pb-3 border-t border-white/[0.06] fade-in">
                <div className="py-2 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Agents</div>
                <div className="space-y-0.5 max-h-52 overflow-y-auto">
                  <AgentList apiBase={apiBase} groupId={group.id} onSelect={a => setSelectedAgent(a)} selected={selectedAgent} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="glass p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
            <Zap size={16} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Dispatch Prompt</h3>
            {selectedAgent && (
              <span className="text-[11px] text-brand font-medium">→ {selectedAgent.name}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Enter your prompt — routes to the best agent automatically, or select one above."
            rows={3}
            className="flex-1 glass-input px-4 py-3 text-sm font-mono resize-none"
          />
          <button
            onClick={handleDispatch}
            disabled={loading || !prompt.trim()}
            className="btn-primary self-end flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            <Send size={14} /> {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
        {result && (
          <pre className="mt-4 p-4 bg-surface rounded-xl border border-white/[0.06] text-xs text-slate-300 overflow-auto max-h-52 font-mono fade-in">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

function AgentList({ apiBase, groupId, onSelect, selected }) {
  const [agents, setAgents] = useState([])
  useEffect(() => {
    fetch(`${apiBase}/api/agents/groups/${groupId}`).then(r => r.json()).then(d => setAgents(d.agents || [])).catch(() => {})
  }, [apiBase, groupId])

  return (
    <>
      {agents.map(agent => (
        <button
          key={agent.id}
          onClick={() => onSelect(agent)}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition cursor-pointer ${
            selected?.id === agent.id
              ? 'bg-brand/15 text-brand border border-brand/20'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent'
          }`}
        >
          <span className="font-medium">{agent.name}</span>
          <span className="text-slate-600 ml-2">{agent.description?.slice(0, 40)}…</span>
        </button>
      ))}
    </>
  )
}
