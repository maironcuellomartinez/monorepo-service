import { useState } from 'react'
import { Calendar, Clock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { availabilityApi, AvailabilitySlot } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'

interface SlotPickerProps {
  cornerId: string
  duration: number
  /** Fecha mínima seleccionable (default: hoy). */
  minDate?: string
  /** Fecha inicial del input (default: hoy). */
  initialDate?: string
  /** Para excluir de disponibilidad los slots que ya tiene reservados el propio usuario (ver AvailabilitySlot.heldByCurrentUser). */
  userId?: string
  selectedSlot: AvailabilitySlot | null
  onSelect: (slot: AvailabilitySlot | null) => void
}

export function SlotPicker({ cornerId, duration, minDate, initialDate, userId, selectedSlot, onSelect }: SlotPickerProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(initialDate ?? today)
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadSlots = async () => {
    if (!cornerId || !date) return
    setLoading(true)
    setError('')
    onSelect(null)
    try {
      const data = await availabilityApi.getSlots(cornerId, date, duration, undefined, userId)
      setSlots(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al verificar disponibilidad')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-end">
        <div className="space-y-1 w-40 shrink-0">
          <Label htmlFor="slot-picker-date">Fecha</Label>
          <Input
            id="slot-picker-date"
            type="date"
            value={date}
            min={minDate ?? today}
            onChange={(e) => { setDate(e.target.value); setSlots([]); onSelect(null) }}
          />
        </div>
        <Button variant="outline" onClick={loadSlots} disabled={!date || loading}>
          <Calendar className="h-4 w-4" />
          {loading ? 'Buscando...' : 'Ver turnos'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {slots.length > 0 && (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {slots.filter((s) => s.available).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">Sin disponibilidad para esta fecha</p>
          ) : (
            slots.filter((s) => s.available).map((slot, i) => (
              <div
                key={i}
                onClick={() => onSelect(slot)}
                className={cn(
                  'flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors',
                  selectedSlot?.startTime === slot.startTime
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{formatDate(slot.startTime)}</p>
                    <p className="text-xs text-muted-foreground">→ {formatDate(slot.endTime)}</p>
                  </div>
                </div>
                {selectedSlot?.startTime === slot.startTime && (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
