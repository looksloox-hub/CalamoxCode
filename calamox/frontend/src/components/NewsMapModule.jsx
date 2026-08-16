import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Newspaper, ExternalLink, MessageSquarePlus, MapPin, X } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const categories = ['tech', 'ai', 'world', 'finance', 'security']
const catColor = {
  tech: 'bg-brand/15 text-brand border-brand/20',
  ai: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  world: 'bg-success/15 text-success border-success/20',
  finance: 'bg-warning/15 text-warning border-warning/20',
  security: 'bg-danger/15 text-danger border-danger/20',
}

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; OpenStreetMap &copy; CARTO'

/**
 * NewsMapModule — redesigned News page (spec §4).
 *
 *   Left half:  interactive dark world map (Leaflet) with glowing news
 *               hotspots at article coordinates. Clicking a pin filters the
 *               feed for that region.
 *   Right half: live news feed. Every card has an external-link button and an
 *               "Import to Chat" button that sends the article into the main
 *               chat console (via `calamox-import-article` window event).
 */
export default function NewsMapModule({ apiBase }) {
  const [articles, setArticles] = useState([])
  const [selected, setSelected] = useState([])
  const [activeRegion, setActiveRegion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetchedAt, setFetchedAt] = useState('')
  const mapEl = useRef(null)
  const map = useRef(null)
  const markers = useRef([])

  const load = useCallback(async (cats, region) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (cats?.length) params.set('categories', cats.join(','))
      if (region) params.set('region', region)
      const qs = params.toString()
      const res = await fetch(`${apiBase}/api/news${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      setArticles(data.articles || [])
      setFetchedAt(data.fetched_at || '')
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [apiBase])

  useEffect(() => { load() }, [load])

  // Init the dark map once. Leaflet captures the container size at init, so we
  // must invalidate it after layout settles — otherwise the SVG projection drifts
  // and markers land outside the map (under the sidebar).
  useEffect(() => {
    if (!mapEl.current || map.current) return
    // DEBUG: expose the instance + log container size at init
    const logSize = (tag) => {
      const c = mapEl.current
      window.__newsMapLog = window.__newsMapLog || []
      window.__newsMapLog.push(`${tag} client=${c?.clientWidth}x${c?.clientHeight} rect=${Math.round(c?.getBoundingClientRect().width)}x${Math.round(c?.getBoundingClientRect().height)}`)
    }
    logSize('init')
    map.current = L.map(mapEl.current, {
      center: [25, 10],
      zoom: 2,
      zoomControl: true,
      worldCopyJump: true,
      attributionControl: true,
    })
    window.__newsMap = map.current
    L.tileLayer(DARK_TILES, { attribution: TILE_ATTR, maxZoom: 6 }).addTo(map.current)
    const t = setTimeout(() => {
      logSize('invalidate-150ms')
      map.current?.invalidateSize({ animate: false })
      logSize('after-invalidate-150ms')
    }, 150)
    return () => {
      clearTimeout(t)
      map.current?.remove()
      map.current = null
    }
  }, [])  // Redraw glowing hotspots whenever articles change.
  // invalidateSize() re-projects the panes asynchronously, so markers are drawn
  // one frame later — otherwise they land on the stale transform (outside the map).
  useEffect(() => {
    const m = map.current
    if (!m) return
    // DEBUG: log map internal size when the marker effect runs
    window.__newsMapLog = window.__newsMapLog || []
    window.__newsMapLog.push(`marker-effect articles=${articles.length} container=${mapEl.current?.clientWidth}x${mapEl.current?.clientHeight} map._size=${m.getSize().x}x${m.getSize().y}`)
    m.invalidateSize({ animate: false })
    window.__newsMapLog.push(`marker-effect after-invalidate container=${mapEl.current?.clientWidth}x${mapEl.current?.clientHeight} map._size=${m.getSize().x}x${m.getSize().y}`)

    const raf = setTimeout(() => {
      // Clear previous markers
      markers.current.forEach(mk => mk.remove())
      markers.current = []

      // Group articles by exact lat/lng to avoid stacking pins
      const grouped = new Map()
      articles.forEach(a => {
        if (!a.location || a.location.lat == null || a.location.lng == null) return
        const key = `${a.location.lat.toFixed(1)},${a.location.lng.toFixed(1)}`
        if (!grouped.has(key)) grouped.set(key, { ...a.location, count: 0, titles: [] })
        const g = grouped.get(key)
        g.count += 1
        g.titles.push(a.title)
      })

      grouped.forEach((loc) => {
        const circle = L.circleMarker([loc.lat, loc.lng], {
          radius: 6 + Math.min(loc.count, 8),
          color: '#00D2FF',
          weight: 1.5,
          fillColor: '#3B82F6',
          fillOpacity: 0.85,
          className: 'news-hotspot',
        })
        circle.bindTooltip(`${loc.name} — ${loc.count} headline${loc.count > 1 ? 's' : ''}`, {
          direction: 'top',
          className: 'news-tooltip',
        })
        circle.on('click', () => {
          const nextRegion = activeRegion === loc.region ? null : loc.region
          setActiveRegion(nextRegion)
          load(selected.length ? selected : undefined, nextRegion)
        })
        circle.addTo(m)
        markers.current.push(circle)
      })
    })

    return () => clearTimeout(raf)
  }, [articles, activeRegion, selected, load])

  const toggle = (cat) => {
    const next = selected.includes(cat) ? selected.filter(c => c !== cat) : [...selected, cat]
    setSelected(next)
    load(next.length ? next : undefined, activeRegion)
  }

  const clearRegion = () => {
    setActiveRegion(null)
    load(selected.length ? selected : undefined, null)
  }

  const importToChat = (article) => {
    window.dispatchEvent(new CustomEvent('calamox-import-article', { detail: { article } }))
  }

  const hotspots = articles.filter(a => a.location?.lat != null).length

  return (
    <div className="flex gap-4 h-full p-4 min-h-0">
      {/* ── Left half: interactive world map ─────────────────────────────── */}
      <section className="w-1/2 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2"><MapPin size={18} className="text-brand-glow" /> World News Map</h1>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-brand-glow shadow-glow inline-block" />
            {hotspots} hotspots · click a pin to filter
          </div>
        </div>
        <div
          ref={mapEl}
          className="flex-1 min-h-[280px] rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0a0f1e] relative"
          style={{ zIndex: 0 }}
        />
        {activeRegion && (
          <button
            onClick={clearRegion}
            className="mt-2 self-start badge border bg-brand/15 text-brand-glow border-brand/30 hover:bg-brand/25 transition cursor-pointer"
          >
            <X size={10} /> Filtering: {activeRegion} — clear
          </button>
        )}
      </section>

      {/* ── Right half: live feed ────────────────────────────────────────── */}
      <section className="w-1/2 min-w-0 flex flex-col">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <h1 className="text-xl font-bold flex items-center gap-2"><Newspaper size={18} /> Live News</h1>
          <button onClick={() => load(selected.length ? selected : undefined, activeRegion)} className="btn-ghost flex items-center gap-1.5 cursor-pointer">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="flex gap-2 flex-wrap mb-3">
          {categories.map(cat => (
            <button key={cat} onClick={() => toggle(cat)} className={`badge border cursor-pointer transition-all ${selected.includes(cat) ? catColor[cat] : 'bg-white/[0.03] text-slate-500 border-white/[0.08] hover:bg-white/[0.06]'}`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {articles.length === 0 && !loading && (
            <div className="text-center py-16 text-slate-600 text-sm">
              No articles{activeRegion ? ` for ${activeRegion}` : ''}. Click refresh to load.
            </div>
          )}
          {articles.map((a, i) => (
            <div key={i} className="glass px-4 py-3 hover:border-brand/30 transition-all duration-200 group">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-100 group-hover:text-brand transition line-clamp-2">{a.title}</div>
                  {a.summary && <div className="text-xs text-slate-500 mt-1.5 line-clamp-2">{a.summary.replace(/<[^>]+>/g, '').slice(0, 160)}</div>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`badge border text-[10px] ${catColor[a.category] || 'bg-white/5 text-slate-500 border-white/10'}`}>{a.category}</span>
                    <span className="text-[11px] text-slate-600">{a.source}</span>
                    {a.region && (
                      <span className="badge border text-[10px] bg-brand/10 text-brand-glow border-brand/20">
                        <MapPin size={9} className="inline mr-0.5" /> {a.region}
                      </span>
                    )}
                    {a.published && <span className="text-[11px] text-slate-600">· {new Date(a.published).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open original article"
                    className="p-2 rounded-lg bg-white/[0.04] text-slate-400 hover:text-brand-glow hover:bg-white/[0.08] border border-white/[0.06] transition cursor-pointer"
                  >
                    <ExternalLink size={14} />
                  </a>
                  <button
                    onClick={() => importToChat(a)}
                    title="Import to Chat — ask questions or summarize"
                    className="p-2 rounded-lg bg-brand/10 text-brand-glow border border-brand/20 hover:bg-brand/20 transition cursor-pointer"
                  >
                    <MessageSquarePlus size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {fetchedAt && (
          <div className="pt-2 text-[10px] text-slate-600 text-right">fetched {new Date(fetchedAt).toLocaleTimeString()}</div>
        )}
      </section>
    </div>
  )
}
