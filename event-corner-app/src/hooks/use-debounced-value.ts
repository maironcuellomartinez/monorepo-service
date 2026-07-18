import { useEffect, useState } from 'react'

/**
 * Devuelve el valor con un retraso: solo se propaga cuando el usuario dejó de
 * cambiarlo durante `delayMs`. Para filtros de texto con búsqueda en vivo.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
