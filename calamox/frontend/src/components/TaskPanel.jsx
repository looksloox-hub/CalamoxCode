import { useState, useEffect, useCallback } from 'react'
import { Plus, Check, Trash2, ListTodo, Loader2, CheckCircle2 } from 'lucide-react'

/**
 * TaskPanel — left side panel (To-Do & active jobs).
 *
 * Tasks come from the backend Task Manager. In addition to manual add/complete,
 * it listens for `calamox-task-create` events (dispatched by ChatPanel when the
 * user assigns work via text or voice) and refreshes on `calamox-task-updated`.
 * Each change also pings the 3D globe with `calamox-agent-activity`.
 */
export default function TaskPanel({ apiBase }) {
  const [tasks, setTasks] = useState([])
  const [stats, setStats] = useState({})
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    fetch(`${apiBase}/api/tasks`)
      .then(r => r.json())
      .then(d => setTasks(d.tasks || []))
      .catch(() => {})
    fetch(`${apiBase}/api/tasks/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
  }, [apiBase])

  useEffect(() => {
    load()
    const onCreate = (e) => {
      const t = e.detail?.title
      if (t) addTask(t)
    }
    const onUpdated = () => load()
    window.addEventListener('calamox-task-create', onCreate)
    window.addEventListener('calamox-task-updated', onUpdated)
    const id = setInterval(load, 20000)
    return () => {
      window.removeEventListener('calamox-task-create', onCreate)
      window.removeEventListener('calamox-task-updated', onUpdated)
      clearInterval(id)
    }
  }, [load])

  const addTask = async (raw) => {
    const text = (raw || '').trim()
    if (!text) return
    const priority = /urgent|asap|high|jald|jaldi/.test(text.toLowerCase()) ? 'high' : 'medium'
    const clean = text.replace(/^(add task|to do|todo|remind me to|create task)[:\s]*/i, '')
    setLoading(true)
    try {
      await fetch(`${apiBase}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: clean || text, priority }),
      })
      setTitle('')
      load()
      window.dispatchEvent(new CustomEvent('calamox-agent-activity', { detail: { count: 1 } }))
    } finally {
      setLoading(false)
    }
  }

  const complete = async (id) => {
    await fetch(`${apiBase}/api/tasks/${id}/complete`, { method: 'POST' })
    load()
    window.dispatchEvent(new CustomEvent('calamox-agent-activity', { detail: { count: 1 } }))
  }

  const remove = async (id) => {
    await fetch(`${apiBase}/api/tasks/${id}`, { method: 'DELETE' })
    load()
  }

  const priStyle = {
    high: 'bg-danger/15 text-danger border-danger/20',
    medium: 'bg-warning/15 text-warning border-warning/20',
    low: 'bg-success/15 text-success border-success/20',
  }
  const statusIcon = (task) => {
    if (task.status === 'completed') return <CheckCircle2 size={14} className="text-success shrink-0" />
    if (task.status === 'in_progress') return <Loader2 size={14} className="text-brand animate-spin shrink-0" />
    return <ListTodo size={14} className="text-slate-600 shrink-0" />
  }

  const visible = tasks.slice(0, 8)

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden glass border-white/[0.06]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2"><ListTodo size={15} className="text-brand" /> Task Manager</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {stats.completed || 0} done · {stats.pending || 0} pending
          </p>
        </div>
      </div>

      <div className="px-3 pt-3 pb-1">
        <div className="flex gap-1.5">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask(title)}
            placeholder="Add a task…"
            className="flex-1 glass-input px-3 py-2 text-xs min-w-0"
          />
          <button
            onClick={() => addTask(title)}
            disabled={!title.trim() || loading}
            className="p-2 rounded-lg bg-brand hover:bg-brand-dark disabled:opacity-30 transition cursor-pointer"
          >
            <Plus size={14} className="text-white" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {visible.length === 0 && (
          <div className="text-center py-8 text-[11px] text-slate-600">
            No tasks yet.
            <br />
            Say <span className="text-brand">"add a task"</span> via voice or type below.
          </div>
        )}
        {visible.map(task => (
          <div
            key={task.id}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] transition ${
              task.status === 'completed' ? 'opacity-45' : 'hover:border-white/[0.12]'
            }`}
          >
            <button
              onClick={() => complete(task.id)}
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition cursor-pointer shrink-0 ${
                task.status === 'completed' ? 'bg-success border-success' : 'border-slate-600 hover:border-brand'
              }`}
            >
              {task.status === 'completed' && <Check size={10} className="text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-medium truncate ${task.status === 'completed' ? 'line-through text-slate-600' : 'text-slate-200'}`}>
                {task.title}
              </div>
              {task.status === 'in_progress' && <div className="text-[9px] text-brand">In progress…</div>}
            </div>
            {statusIcon(task)}
            <span className={`badge border text-[9px] ${priStyle[task.priority] || priStyle.medium}`}>{task.priority}</span>
            <button onClick={() => remove(task.id)} className="p-1 text-slate-600 hover:text-danger transition cursor-pointer shrink-0">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-white/[0.06] text-[10px] text-slate-600 flex justify-between">
        <span>Auto-syncs with voice &amp; chat</span>
        <span className="text-brand">{stats.total || 0} total</span>
      </div>
    </div>
  )
}
