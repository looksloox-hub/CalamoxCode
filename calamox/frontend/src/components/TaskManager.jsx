import { useState, useEffect } from 'react'
import { Plus, Check, Trash2, ListTodo } from 'lucide-react'

export default function TaskManager({ apiBase }) {
  const [tasks, setTasks] = useState([])
  const [stats, setStats] = useState({})
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [filter, setFilter] = useState('all')

  const load = () => {
    const params = filter !== 'all' ? `?status=${filter}` : ''
    fetch(`${apiBase}/api/tasks${params}`).then(r => r.json()).then(d => setTasks(d.tasks || [])).catch(() => {})
    fetch(`${apiBase}/api/tasks/stats`).then(r => r.json()).then(setStats).catch(() => {})
  }

  useEffect(load, [apiBase, filter])

  const add = async () => {
    if (!title.trim()) return
    await fetch(`${apiBase}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority }),
    })
    setTitle('')
    load()
  }

  const complete = async (id) => { await fetch(`${apiBase}/api/tasks/${id}/complete`, { method: 'POST' }); load() }
  const remove = async (id) => { await fetch(`${apiBase}/api/tasks/${id}`, { method: 'DELETE' }); load() }

  const priStyle = {
    high: 'bg-danger/15 text-danger border-danger/20',
    medium: 'bg-warning/15 text-warning border-warning/20',
    low: 'bg-success/15 text-success border-success/20',
  }

  return (
    <div className="space-y-5 p-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><ListTodo size={22} /> Task Manager</h1>
        <p className="text-sm text-slate-500">{stats.total || 0} tasks · {stats.pending || 0} pending · {stats.completed || 0} done</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'in_progress', 'completed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`btn-ghost text-xs cursor-pointer ${filter === f ? '!bg-brand/15 !text-brand !border-brand/20' : ''}`}>
            {f.replace('_', ' ')} {f !== 'all' && stats[f] !== undefined ? `(${stats[f]})` : ''}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="What needs to be done?" className="flex-1 glass-input px-4 py-3 text-sm" />
        <select value={priority} onChange={e => setPriority(e.target.value)} className="glass-input px-3 py-3 text-sm cursor-pointer">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button onClick={add} className="btn-primary flex items-center gap-1.5 cursor-pointer"><Plus size={15} /> Add</button>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 && <div className="text-center py-12 text-slate-600 text-sm">No tasks yet. Add one above.</div>}
        {tasks.map(task => (
          <div key={task.id} className={`glass flex items-center gap-3 px-4 py-3 transition-all duration-200 hover:border-white/[0.12] ${task.status === 'completed' ? 'opacity-50' : ''}`}>
            <button onClick={() => complete(task.id)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition cursor-pointer ${task.status === 'completed' ? 'bg-success border-success' : 'border-slate-600 hover:border-brand'}`}>
              {task.status === 'completed' && <Check size={12} className="text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-slate-600' : ''}`}>{task.title}</div>
              {task.description && <div className="text-xs text-slate-500 truncate">{task.description}</div>}
            </div>
            <span className={`badge border ${priStyle[task.priority] || priStyle.medium}`}>{task.priority}</span>
            <button onClick={() => remove(task.id)} className="p-1.5 text-slate-600 hover:text-danger transition cursor-pointer"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
