import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, Terminal } from 'lucide-react'

/**
 * CodeBlock — dark, syntax-highlighted code block with a copy button.
 */
export function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-white/10 bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.05] border-b border-white/10">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
          <Terminal size={11} /> {language || 'code'}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
        >
          {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto">
        <code className={`hljs language-${language}`}>{code}</code>
      </pre>
    </div>
  )
}

/**
 * Shared markdown component overrides: fenced code -> CodeBlock, inline code,
 * links, and common block elements styled for the dark theme.
 */
export const markdownComponents = {
  pre({ children }) {
    const child = children && children.props
    const className = (child && child.className) || ''
    const match = /language-(\w+)/.exec(className)
    const language = match ? match[1] : 'code'
    const code = String((child && child.children) || '').replace(/\n$/, '')
    return <CodeBlock language={language} code={code} />
  },
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    if (match) {
      return <code className={className} {...props}>{children}</code>
    }
    return (
      <code className="px-1.5 py-0.5 rounded bg-white/10 text-brand-glow text-[12px] font-mono" {...props}>
        {children}
      </code>
    )
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-glow underline decoration-brand/30 hover:decoration-brand"
      >
        {children}
      </a>
    )
  },
  ul({ children }) { return <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul> },
  ol({ children }) { return <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol> },
  h1({ children }) { return <h1 className="text-base font-bold mt-2 mb-1">{children}</h1> },
  h2({ children }) { return <h2 className="text-[15px] font-bold mt-2 mb-1">{children}</h2> },
  h3({ children }) { return <h3 className="text-sm font-bold mt-1.5 mb-0.5">{children}</h3> },
  p({ children }) { return <p className="my-1.5 leading-relaxed">{children}</p> },
  strong({ children }) { return <strong className="font-semibold text-white">{children}</strong> },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-[12px] border-collapse">{children}</table>
      </div>
    )
  },
  th({ children }) {
    return <th className="text-left px-3 py-1.5 bg-white/[0.05] text-slate-300 font-semibold border-b border-white/10">{children}</th>
  },
  td({ children }) {
    return <td className="px-3 py-1.5 border-b border-white/[0.06] align-top">{children}</td>
  },
}

/**
 * Markdown — drop-in renderer for assistant responses.
 */
export default function Markdown({ children, className = '' }) {
  return (
    <div className={`text-[13px] [&_pre]:text-[12px] ${className}`}>
      <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
