import { useState, useEffect } from 'react'
import { RefreshCw, ExternalLink, Newspaper } from 'lucide-react'

const categories = ['tech', 'ai', 'world', 'finance', 'security']
const catColor = {
  tech: 'bg-brand/15 text-brand border-brand/20',
  ai: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  world: 'bg-success/15 text-success border-success/20',
  finance: 'bg-warning/15 text-warning border-warning/20',
  security: 'bg-danger/15 text-danger border-danger/20',
}

export default function NewsFeed({ apiBase }) {
  const [articles, setArticles] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetchedAt, setFetchedAt] = useState('')

  const load = async (cats) => {
    setLoading(true)
    try {
      const param = cats?.length ? `?categories=${cats.join(',')}` : ''
      const res = await fetch(`${apiBase}/api/news${param}`)
      const data = await res.json()
      setArticles(data.articles || [])
      setFetchedAt(data.fetched_at || '')
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [apiBase])

  const toggle = (cat) => {
    const next = selected.includes(cat) ? selected.filter(c => c !== cat) : [...selected, cat]
    setSelected(next)
    load(next.length ? next : undefined)
  }

  return (
    <div className="space-y-5 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><Newspaper size={22} /> Live News</h1>
        <p className="text-sm text-slate-500">{articles.length} articles {fetchedAt && `· fetched ${new Date(fetchedAt).toLocaleTimeString()}`}</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => toggle(cat)} className={`badge border cursor-pointer transition-all ${selected.includes(cat) ? catColor[cat] : 'bg-white/[0.03] text-slate-500 border-white/[0.08] hover:bg-white/[0.06]'}`}>
              {cat}
            </button>
          ))}
        </div>
        <button onClick={() => load(selected.length ? selected : undefined)} className="btn-ghost flex items-center gap-1.5 cursor-pointer">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="space-y-2">
        {articles.length === 0 && !loading && <div className="text-center py-16 text-slate-600 text-sm">No articles. Click refresh to load.</div>}
        {articles.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block glass px-5 py-4 hover:border-brand/30 transition-all duration-200 group cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-100 group-hover:text-brand transition line-clamp-2">{a.title}</div>
                {a.summary && <div className="text-xs text-slate-500 mt-1.5 line-clamp-2">{a.summary.replace(/<[^>]+>/g, '').slice(0, 160)}</div>}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`badge border text-[10px] ${catColor[a.category] || 'bg-white/5 text-slate-500 border-white/10'}`}>{a.category}</span>
                  <span className="text-[11px] text-slate-600">{a.source}</span>
                  {a.published && <span className="text-[11px] text-slate-600">· {new Date(a.published).toLocaleDateString()}</span>}
                </div>
              </div>
              <ExternalLink size={14} className="text-slate-600 group-hover:text-brand mt-1 shrink-0 transition" />
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
