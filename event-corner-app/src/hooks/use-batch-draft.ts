import { useState, useEffect, useCallback } from 'react'
import {
  batchDraftsApi, BatchDraftItem, BatchSubmitResultItem, AddBatchItemCmd, EditBatchItemCmd,
} from '@/lib/api'

export type UIBatchItem = BatchDraftItem & {
  uiStatus: 'pending' | 'sending' | 'success' | 'error'
  uiError?: string
}

const RENEW_INTERVAL_MS = 5 * 60 * 1000

function toUIItem(item: BatchDraftItem): UIBatchItem {
  return { ...item, uiStatus: item.status, uiError: item.lastError ?? undefined }
}

export function useBatchDraft(legacyUserId?: string) {
  const [items, setItems] = useState<UIBatchItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [renewedUntil, setRenewedUntil] = useState<Date | null>(null)
  const [hasLegacyDraft, setHasLegacyDraft] = useState(false)

  useEffect(() => {
    batchDraftsApi
      .getMyDraft()
      .then((draft) => {
        if (draft?.items?.length) {
          setItems(draft.items.map(toUIItem))
        } else if (legacyUserId) {
          const key = `ec_batch_draft_${legacyUserId}`
          try {
            const raw = localStorage.getItem(key)
            if (raw) {
              const parsed = JSON.parse(raw)
              if (Array.isArray(parsed) && parsed.length > 0) setHasLegacyDraft(true)
            }
          } catch {}
          localStorage.removeItem(key)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasItems = items.length > 0
  useEffect(() => {
    if (!hasItems) return
    const id = setInterval(async () => {
      try {
        const result = await batchDraftsApi.renewHolds()
        setRenewedUntil(new Date(result.renewedUntil))
      } catch {}
    }, RENEW_INTERVAL_MS)
    return () => clearInterval(id)
  }, [hasItems])

  const addItem = useCallback(async (cmd: AddBatchItemCmd): Promise<UIBatchItem> => {
    const item = await batchDraftsApi.addItem(cmd)
    const ui = toUIItem(item)
    setItems((prev) => [...prev, ui])
    return ui
  }, [])

  const editItem = useCallback(async (itemId: string, cmd: EditBatchItemCmd): Promise<void> => {
    await batchDraftsApi.editItem(itemId, cmd)
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, ...cmd, uiStatus: 'pending', uiError: undefined }
          : it,
      ),
    )
  }, [])

  const removeItem = useCallback(async (itemId: string): Promise<void> => {
    await batchDraftsApi.removeItem(itemId)
    setItems((prev) => prev.filter((it) => it.id !== itemId))
  }, [])

  const submit = useCallback(async (): Promise<BatchSubmitResultItem[]> => {
    setItems((prev) =>
      prev.map((it) =>
        it.uiStatus === 'pending' || it.uiStatus === 'error'
          ? { ...it, uiStatus: 'sending' as const }
          : it,
      ),
    )
    const results = await batchDraftsApi.submit()
    setItems((prev) =>
      prev.map((it) => {
        const r = results.find((x) => x.localId === it.localId)
        if (!r) return it
        if (r.status === 'success') return { ...it, uiStatus: 'success' as const, uiError: undefined }
        return { ...it, uiStatus: 'error' as const, uiError: r.error, status: 'error' }
      }),
    )
    return results
  }, [])

  const discard = useCallback(async (): Promise<void> => {
    await batchDraftsApi.discard()
    setItems([])
  }, [])

  const dismissLegacy = useCallback(() => setHasLegacyDraft(false), [])

  return { items, isLoading, addItem, editItem, removeItem, submit, discard, renewedUntil, hasLegacyDraft, dismissLegacy }
}
