import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#818cf8',
    primaryTextColor: '#1e293b',
    primaryBorderColor: '#6366f1',
    lineColor: '#94a3b8',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#f1f5f9',
    background: '#ffffff',
    mainBkg: '#eef2ff',
    nodeBorder: '#6366f1',
    clusterBkg: '#f8fafc',
    titleColor: '#1e293b',
    edgeLabelBackground: '#f8fafc',
    fontSize: '13px',
  },
  flowchart: { curve: 'basis', padding: 20 },
  sequence: { actorMargin: 60, messageMargin: 40, boxMargin: 12 },
})

let counter = 0

export function MermaidDiagram({ chart, className }: { chart: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const id = useRef(`mermaid-${++counter}`)

  useEffect(() => {
    setError(null)
    let cancelled = false

    const render = async () => {
      if (!containerRef.current) return
      try {
        const { svg } = await mermaid.render(id.current, chart.trim())
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = svg
        const svgEl = containerRef.current.querySelector('svg')
        if (svgEl) {
          svgEl.style.maxWidth = '100%'
          svgEl.style.height = 'auto'
          svgEl.removeAttribute('width')
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    render()
    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return (
      <div className="my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 font-mono text-xs text-destructive">
        <p className="mb-1 font-semibold">Error rendering diagram:</p>
        <pre className="whitespace-pre-wrap">{error}</pre>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'my-8 flex justify-center overflow-x-auto rounded-xl border bg-white p-6 shadow-sm',
        className
      )}
    >
      <div ref={containerRef} className="w-full" />
    </motion.div>
  )
}
