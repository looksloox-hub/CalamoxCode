import { Globe, Bot, Newspaper, CheckSquare, Key, Library, MessageSquare, ChevronLeft, PlayCircle } from 'lucide-react'

const nav = [
  { id: 'home', label: 'Jarvis Hub', icon: Globe, desc: '3D globe · tasks · voice' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, desc: 'AI conversations' },
  { id: 'agents', label: 'Agents', icon: Bot, desc: '200 agents' },
  { id: 'news', label: 'News', icon: Newspaper, desc: 'Live feeds' },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare, desc: 'To-do list' },
  { id: 'youtube', label: 'YouTube', icon: PlayCircle, desc: 'Upload videos' },
  { id: 'apikeys', label: 'Keys', icon: Key, desc: 'API providers' },
  { id: 'prompts', label: 'Prompts', icon: Library, desc: 'Templates' },
]

export default function Sidebar({ open, onToggle, page, onNavigate, health }) {
  return (
    <aside className={`${open ? 'w-[260px]' : 'w-[72px]'} flex-shrink-0 overflow-hidden transition-all duration-300 flex flex-col bg-surface/80 backdrop-blur-glass border-r border-white/[0.06]`}>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/[0.06]">
        <div className={`flex items-center gap-3 ${!open && 'justify-center'}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-purple-500 flex items-center justify-center shadow-glow">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          {open && (
            <div className="fade-in">
              <h2 className="font-bold text-[15px] tracking-tight">Calamox</h2>
              <span className="text-[11px] text-slate-500">200 agents · 20 groups</span>
            </div>
          )}
        </div>
        <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition cursor-pointer">
          <ChevronLeft size={16} className={`transition-transform ${!open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map(({ id, label, icon: Icon, desc }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 rounded-xl text-left transition-all duration-200 cursor-pointer ${
                open ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'
              } ${
                active
                  ? 'bg-brand/15 text-brand border border-brand/20 shadow-glow'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent'
              }`}
              title={!open ? label : undefined}
            >
              <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
              {open && (
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold leading-tight">{label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
                </div>
              )}
              {active && open && <div className="w-1.5 h-1.5 rounded-full bg-brand pulse-glow" />}
            </button>
          )
        })}
      </nav>

      {/* Status footer */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className={`flex items-center gap-2 text-xs ${open ? 'px-1' : 'justify-center'}`}>
          <div className={`w-2 h-2 rounded-full ${health?.status === 'ok' ? 'bg-success pulse-glow' : 'bg-danger'}`} />
          {open && <span className="text-slate-500">{health?.status === 'ok' ? 'Connected' : 'Offline'}</span>}
        </div>
      </div>
    </aside>
  )
}
