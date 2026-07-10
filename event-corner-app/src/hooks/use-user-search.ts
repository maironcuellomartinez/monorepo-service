import { useEffect, useRef, useState } from 'react'
import { MonolithUser } from '@/lib/api'

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300

/**
 * Búsqueda server-side de usuarios con debounce.
 * `searchFn` debe ser una referencia estable (ej. usersApi.search) para evitar
 * relanzar el efecto en cada render.
 */
export function useUserSearch(searchFn: (q: string) => Promise<MonolithUser[]>) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MonolithUser[]>([])
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)
    const timer = setTimeout(() => {
      searchFn(q)
        .then((data) => { if (id === requestId.current) setResults(data) })
        .catch(() => { if (id === requestId.current) setResults([]) })
        .finally(() => { if (id === requestId.current) setLoading(false) })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, searchFn])

  const reset = () => {
    requestId.current++
    setQuery('')
    setResults([])
    setLoading(false)
  }

  return { query, setQuery, results, loading, reset }
}
