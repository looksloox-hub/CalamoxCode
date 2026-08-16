import { useEffect, useRef } from 'react'
import { CornerDownLeft, TerminalSquare } from 'lucide-react'

/**
 * Available slash commands — mirrors the backend SLASH_COMMANDS.
 */
export const SLASH_COMMANDS = [
  { command: '/code', description: 'Run a shell command on this machine', example: '/code ls -la' },
  { command: '/search', description: 'Search the web', example: '/search latest AI news' },
  { command: '/research', description: 'Deep-research a topic', example: '/research quantum computing' },
  { command: '/task', description: 'Create a task', example: '/task review PR' },
  { command: '/plugin', description: 'List / call plugins', example: '/plugin' },
  { command: '/news', description: 'Fetch live headlines', example: '/news tech' },
  { command: '/browser', description: 'Fetch and summarize a URL', example: '/browser https://example.com' },
  { command: '/youtube', description: 'YouTube upload status', example: '/youtube' },
  { command: '/session', description: 'List saved chat sessions', example: '/session' },
  { command: '/clear', description: 'Clear the conversation', example: '/clear' },
  { command: '/help', description: 'List all commands', example: '/help' },
]

/**
 * CommandSuggestions — floating "/" autocomplete popup.
 *
 * Renders when the user types "/" in the chat input. Arrow keys navigate,
 * Enter/Tab selects, Escape closes.
 */
export default function CommandSuggestions({ query, selected, onSelect, onClose }) {
  const ref = useRef(null)
  const q = query.toLowerCase()

  const filtered = SLASH_COMMANDS.filter(c => c.command.toLowerCase().includes(q))
  const highlighted = filtered[Math.min(selected, Math.max(filtered.length - 1, 0))]

  // Keep the highlighted item scrolled into view
  useEffect(() => {
    const el = ref.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-1.5 z-50 glass shadow-glass-lg rounded-xl overflow-hidden fade-in"
    >
      <div className="px-3 py-1.5 border-b border-white/[0.06] text-[9px] uppercase tracking-[0.2em] text-slate-500 flex items-center gap-1.5">
        <TerminalSquare size={11} className="text-brand-glow" /> Commands — ↑↓ navigate · Enter run · Esc close
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {filtered.map((c, i) => (
          <button
            key={c.command}
            data-active={highlighted?.command === c.command ? 'true' : 'false'}
            onMouseEnter={() => onSelect(i)}
            onClick={() => onSelect(i) /* onSelect triggers select via parent */}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition cursor-pointer ${
              highlighted?.command === c.command ? 'bg-brand/15' : 'hover:bg-white/[0.04]'
            }`}
          >
            <span className={`font-mono text-[12px] font-bold shrink-0 ${highlighted?.command === c.command ? 'text-brand-glow' : 'text-brand'}`}>
              {c.command}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] text-slate-300 truncate">{c.description}</span>
              {c.example && <span className="block text-[10px] text-slate-600 font-mono truncate">{c.example}</span>}
            </span>
            {highlighted?.command === c.command && <CornerDownLeft size={12} className="text-brand-glow shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
}
