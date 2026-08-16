import { useEffect } from 'react'
import Globe3D from './Globe3D.jsx'
import TaskPanel from './TaskPanel.jsx'
import ResizableChatPanel from './ResizableChatPanel.jsx'

/**
 * Home — the JARVIS HUB:
 *
 *   ┌──────────────┬─────────────────────────────┬──────────────────┐
 *   │  TaskPanel   │      Globe3D (center)        │  ChatPanel       │
 *   │  (bottom-    │  interactive holographic     │  (resizable,     │
 *   │   left,      │  globe + agent activity,     │   320–700px)     │
 *   │   w-80 h-72) │  bounded to center column)   │                  │
 *   └──────────────┴─────────────────────────────┴──────────────────┘
 */
export default function Home({ apiBase, importArticle }) {
  // Wake up the globe with a few agent-activity pulses on load
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('calamox-agent-activity', { detail: { count: 5 } }))
    }, 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex gap-3 h-full p-3">
      {/* Left — Task Manager, pinned strictly to the bottom-left (w-80 h-72 z-20) */}
      <aside className="w-80 flex-shrink-0 z-20 hidden md:flex flex-col justify-end overflow-hidden">
        <div className="h-72 min-h-[288px] w-full">
          <TaskPanel apiBase={apiBase} />
        </div>
      </aside>

      {/* Center — Holographic globe (takes remaining space only, never overlaps sidebars) */}
      <main className="flex-1 min-w-0 relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/40">
        <Globe3D className="absolute inset-0" />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] text-slate-500 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-glow animate-pulse" />
          Drag to orbit · voice pulses the globe · agent activity renders as data nodes
        </div>
      </main>

      {/* Right — Resizable Chat & Voice console (drag left border, 320–700px) */}
      <ResizableChatPanel apiBase={apiBase} importArticle={importArticle} />
    </div>
  )
}
