import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Home from './components/Home.jsx'
import Chat from './components/Chat.jsx'
import AgentGrid from './components/AgentGrid.jsx'
import NewsMapModule from './components/NewsMapModule.jsx'
import TaskManager from './components/TaskManager.jsx'
import ApiKeyManager from './components/ApiKeyManager.jsx'
import PromptLibrary from './components/PromptLibrary.jsx'
import YouTubeUploader from './components/YouTubeUploader.jsx'

const API = ''

const pages = {
  home: { title: 'Jarvis Hub', Component: Home },
  chat: { title: 'Chat', Component: Chat },
  agents: { title: 'Agent Workspace', Component: AgentGrid },
  news: { title: 'Live News', Component: NewsMapModule },
  tasks: { title: 'Task Manager', Component: TaskManager },
  youtube: { title: 'YouTube Upload', Component: YouTubeUploader },
  apikeys: { title: 'API Key Manager', Component: ApiKeyManager },
  prompts: { title: 'Prompt Library', Component: PromptLibrary },
}

export default function App() {
  const [page, setPage] = useState('home')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [health, setHealth] = useState(null)
  const [importArticle, setImportArticle] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/health`).then(r => r.json()).then(setHealth).catch(() => setHealth({ status: 'offline' }))
    const id = setInterval(() => {
      fetch(`${API}/api/health`).then(r => r.json()).then(setHealth).catch(() => setHealth({ status: 'offline' }))
    }, 10000)
    return () => clearInterval(id)
  }, [])

  // News page "Import to Chat" → jump to Jarvis Hub and hand the article to the
  // main chat console, which auto-injects it as a message.
  useEffect(() => {
    const onImport = (e) => {
      const article = e.detail?.article
      if (!article) return
      setImportArticle({ ...article, _key: Date.now() })
      setPage('home')
    }
    window.addEventListener('calamox-import-article', onImport)
    return () => window.removeEventListener('calamox-import-article', onImport)
  }, [])

  // Real-time events: backend publishes task/agent activity over WebSocket
  // and we fan them out to the globe + task panel via window events.
  useEffect(() => {
    let ws
    const connect = () => {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        ws = new WebSocket(`${proto}://${window.location.host}/ws`)
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'tasks_updated') {
              window.dispatchEvent(new CustomEvent('calamox-task-updated'))
            } else if (msg.type === 'agent_activity') {
              window.dispatchEvent(new CustomEvent('calamox-agent-activity', { detail: { count: msg.count || 1 } }))
            }
          } catch { /* ignore malformed frames */ }
        }
        ws.onclose = () => setTimeout(connect, 5000)
      } catch { /* ws unsupported */ }
    }
    connect()
    return () => ws?.close()
  }, [])

  const { Component } = pages[page] || pages.chat

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0a0b]">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        page={page}
        onNavigate={setPage}
        health={health}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <Component apiBase={API} importArticle={page === 'home' ? importArticle : null} />
        </div>
      </main>
    </div>
  )
}
