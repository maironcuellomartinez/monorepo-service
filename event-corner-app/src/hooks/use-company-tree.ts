import { useEffect, useRef, useState } from 'react'
import { companiesApi } from '@/lib/api'

/**
 * Resuelve el treeId (grupo de tipos de cita) de una compañía por su ID.
 * Se usa para filtrar el picker de tipos de cita al grupo de la compañía
 * del cliente elegido — evitar que se pueda seleccionar un tipo que el
 * backend va a rechazar con IssueTypeNotAllowedForCompanyError porque
 * pertenece a otro grupo.
 */
export function useCompanyTree(companyId: string | null | undefined) {
  const [treeId, setTreeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    if (!companyId) {
      setTreeId(null)
      setLoading(false)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    companiesApi
      .getById(companyId)
      .then((company) => { if (id === requestId.current) setTreeId(company.treeId ?? null) })
      .catch(() => { if (id === requestId.current) setTreeId(null) })
      .finally(() => { if (id === requestId.current) setLoading(false) })
  }, [companyId])

  return { treeId, loading }
}
