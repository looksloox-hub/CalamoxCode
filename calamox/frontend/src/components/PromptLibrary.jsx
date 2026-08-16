import { useState } from 'react'
import { BookOpen, Copy, Star, Search, Check } from 'lucide-react'

const SAMPLE_PROMPTS = [
  { id: 1, title: 'Code Review', category: 'developer', prompt: 'Review the following code for bugs, security issues, and performance problems. Provide specific line-by-line feedback.', starred: true },
  { id: 2, title: 'API Design', category: 'developer', prompt: 'Design a RESTful API for this feature. Include endpoint paths, methods, request/response schemas, status codes, and error handling.', starred: false },
  { id: 3, title: 'Blog Post Outline', category: 'content', prompt: 'Create a detailed outline for a blog post about [topic]. Include introduction hook, 3-5 main sections with sub-points, and a conclusion with CTA.', starred: false },
  { id: 4, title: 'Product Launch Email', category: 'marketing', prompt: 'Write a product launch email sequence: teaser (T-3 days), launch day, and follow-up (T+2 days). Use urgency and social proof.', starred: true },
  { id: 5, title: 'Security Audit', category: 'security', prompt: 'Perform a security audit of this code. Check for OWASP Top 10 vulnerabilities, hardcoded secrets, and dependency issues.', starred: false },
  { id: 6, title: 'Data Analysis', category: 'data', prompt: 'Analyze this dataset. Identify trends, outliers, and key insights. Create a summary with visualizations and actionable recommendations.', starred: false },
  { id: 7, title: 'Meeting Notes', category: 'ops', prompt: 'Summarize these meeting notes into: key decisions, action items (who/what/deadline), open questions, and follow-up requirements.', starred: false },
  { id: 8, title: 'LinkedIn Post', category: 'social', prompt: 'Write a LinkedIn post about [topic]. Start with a hook, share a personal insight, provide value, and end with an engagement question.', starred: true },
  { id: 9, title: 'Unit Test Generator', category: 'qa', prompt: 'Generate comprehensive unit tests for this function. Cover happy path, edge cases, error conditions, and boundary values.', starred: false },
  { id: 10, title: 'System Architecture', category: 'developer', prompt: 'Design the system architecture for this application. Include tech stack decisions, data flow, API contracts, and deployment strategy.', starred: false },
]

export default function PromptLibrary() {
  const [prompts, setPrompts] = useState(SAMPLE_PROMPTS)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(null)

  const filtered = search
    ? prompts.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.prompt.toLowerCase().includes(search.toLowerCase()))
    : prompts

  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500) }
  const toggleStar = (id) => setPrompts(prompts.map(p => p.id === id ? { ...p, starred: !p.starred } : p))

  return (
    <div className="space-y-5 p-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><BookOpen size={22} /> Prompt Library</h1>
        <p className="text-sm text-slate-500">{prompts.length} templates ready to use</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-3.5 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompts..." className="w-full pl-11 pr-4 py-3 glass-input text-sm" />
      </div>

      <div className="space-y-2">
        {filtered.map(p => (
          <div key={p.id} className="glass p-4 hover:border-white/[0.12] transition-all duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{p.title}</span>
                <span className="badge bg-white/[0.05] text-slate-500 border-white/[0.08] capitalize">{p.category}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleStar(p.id)} className={`p-1.5 rounded-lg transition cursor-pointer ${p.starred ? 'text-warning bg-warning/10' : 'text-slate-600 hover:text-warning'}`}>
                  <Star size={14} fill={p.starred ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => copy(p.prompt, p.id)} className="p-1.5 rounded-lg text-slate-600 hover:text-brand hover:bg-brand/10 transition cursor-pointer">
                  {copied === p.id ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{p.prompt}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
