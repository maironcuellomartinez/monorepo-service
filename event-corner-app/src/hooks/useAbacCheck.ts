import { useState, useEffect, useRef } from 'react'
import { abacApi, AbacCheckItem } from '@/lib/api'

type GrantedMap = Record<string, boolean>

// Cache por sesión: evita re-llamar al backend si los mismos checks ya se evaluaron.
// Clave: JSON.stringify de los checks ordenados.
const sessionCache = new Map<string, GrantedMap>()

function buildCacheKey(checks: AbacCheckItem[]): string {
  const sorted = [...checks].sort((a, b) =>
    `${a.resource}:${a.action}`.localeCompare(`${b.resource}:${b.action}`),
  )
  return JSON.stringify(sorted)
}

/**
 * Capa 2 — evaluación ABAC fina por página.
 *
 * Llama a POST /api/abac/batch-evaluate con los checks declarados.
 * Los resultados se cachean por sesión: mismos checks → sin re-llamada.
 *
 * @example
 * const { granted, loading } = useAbacCheck([
 *   { resource: 'appointment', action: 'delete' },
 *   { resource: 'appointment', action: 'take' },
 * ])
 *
 * if (granted['appointment:delete']) { ... }
 */
export function useAbacCheck(checks: AbacCheckItem[]) {
  const [granted, setGranted] = useState<GrantedMap>({})
  const [loading, setLoading] = useState(true)
  // Estabilizar la referencia para que el effect no se re-ejecute en cada render
  const checksRef = useRef(checks)

  useEffect(() => {
    if (checksRef.current.length === 0) {
      setLoading(false)
      return
    }

    const cacheKey = buildCacheKey(checksRef.current)

    if (sessionCache.has(cacheKey)) {
      setGranted(sessionCache.get(cacheKey)!)
      setLoading(false)
      return
    }

    let cancelled = false

    abacApi
      .batchEvaluate(checksRef.current)
      .then((results) => {
        if (cancelled) return
        const map: GrantedMap = {}
        for (const r of results) {
          map[`${r.resource}:${r.action}`] = r.granted
        }
        sessionCache.set(cacheKey, map)
        setGranted(map)
      })
      .catch(() => {
        if (cancelled) return
        // Error de red: denegar todo (fail-closed en cliente)
        const map: GrantedMap = {}
        for (const c of checksRef.current) {
          map[`${c.resource}:${c.action}`] = false
        }
        setGranted(map)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { granted, loading }
}
