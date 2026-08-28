// core/domain/enums/slot-status.enum.ts
export enum SlotStatus {
    AVAILABLE = 'AVAILABLE',
    /** Reservado temporalmente por un técnico mientras arma un lote. Expira con TTL lazy. */
    HELD = 'HELD',
    BOOKED = 'BOOKED',
    EXPIRED = 'EXPIRED'
}