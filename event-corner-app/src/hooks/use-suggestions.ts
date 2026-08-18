import { useEffect, useRef, useState } from 'react'

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300

/**
 * Autocomplete genérico: sugerencias server-side con debounce, activables/desactivables
 * en caliente (ej. requieren un corner ya elegido). `searchFn` debe ser estable.
 */
export function useSuggestions<T>(
  query: string,
  searchFn: (q: string) => Promise<T[]>,
  enabled = true,
) {
  const [suggestions, setSuggestions] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!enabled || q.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)
    const timer = setTimeout(() => {
      searchFn(q)
        .then((data) => { if (id === requestId.current) setSuggestions(data) })
        .catch(() => { if (id === requestId.current) setSuggestions([]) })
        .finally(() => { if (id === requestId.current) setLoading(false) })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, searchFn, enabled])

  return { suggestions, loading, clear: () => setSuggestions([]) }
}
