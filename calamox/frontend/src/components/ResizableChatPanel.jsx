import { useState, useRef, useCallback } from 'react'
import { GripVertical } from 'lucide-react'
import ChatPanel from './ChatPanel.jsx'

const MIN_WIDTH = 320
const MAX_WIDTH = 700
const DEFAULT_WIDTH = 380

/**
 * ResizableChatPanel — right sidebar with a draggable left border.
 *
 * Drag the handle to resize the panel between 320px and 700px (spec: min 320, max 700).
 */
export default function ResizableChatPanel({ apiBase, importArticle }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)

  const onPointerDown = useCallback((e) => {
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }, [width])

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return
    const next = startWidth.current + (startX.current - e.clientX)
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)))
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerMove])

  return (
    <aside
      className="relative flex-shrink-0 overflow-hidden hidden md:flex"
      style={{ width }}
    >
      {/* Drag handle on the left border */}
      <div
        onPointerDown={onPointerDown}
        title="Drag to resize (320–700px)"
        className="absolute left-0 top-0 bottom-0 z-30 w-[7px] -ml-[3px] cursor-col-resize group flex items-center justify-center"
      >
        <div className="h-12 w-[3px] rounded-full bg-white/0 group-hover:bg-brand-glow/70 transition-all" />
        <GripVertical size={10} className="absolute text-slate-600 opacity-0 group-hover:opacity-100 transition" />
      </div>

      <div className="flex-1 min-w-0 h-full pl-[3px]">
        <ChatPanel apiBase={apiBase} importArticle={importArticle} />
      </div>
    </aside>
  )
}
