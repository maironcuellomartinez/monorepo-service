// core/services/availability/availability.service.ts
import {
  IAvailabilityService,
  AvailabilityQuery,
  SlotAvailabilityDto,
  TechnicianAvailabilityDto,
} from '../../ports/incoming/availability/availability-service.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { ISlotRepository } from '../../ports/outgoing/repositories/slot-repository.port';
import { ITechnicianRepository } from '../../ports/outgoing/repositories/technician-repository.port';
import { IAppointmentRepository } from '../../ports/outgoing/repositories/appointment-repository.port';
import { ICache } from '../../ports/outgoing/cache/cache.port';
import { AppointmentStatus } from '../../domain/enums/appointment-status.enum';
import { Slot } from '../../domain/entities/slot.entity';
import { SlotStatus } from '../../domain/enums/slot-status.enum';
import { Appointment } from '../../domain/entities/appointment.entity';
import { Result } from '@app/result';
import { CornerId } from '@app/shared/types/branded-ids';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

export class AvailabilityService implements IAvailabilityService {
  constructor(
    private cornerRepo: ICornerRepository,
    private slotRepo: ISlotRepository,
    private technicianRepo: ITechnicianRepository,
    private appointmentRepo: IAppointmentRepository,
    private cache: ICache,
  ) {}

  async getAvailability(
    query: AvailabilityQuery,
  ): Promise<Result<SlotAvailabilityDto[]>> {
    const cacheKey = `availability:${query.cornerId}:${query.date.toISOString().split('T')[0]}:${query.duration}`;

    const cachedResult = await this.cache.get<SlotAvailabilityDto[]>(cacheKey);
    const cachedValue = cachedResult.toNullable();
    if (cachedValue) return Result.ok(cachedValue);

    const slots = await this.calculateAvailability(query);
    if (slots instanceof Error) return Result.err(slots);

    await this.cache.set(cacheKey, slots, 30);
    return Result.ok(slots);
  }

  async getTechniciansAvailability(
    cornerId: string,
    date: Date,
  ): Promise<Result<TechnicianAvailabilityDto[]>> {
    // Obtener técnicos del corner
    const techResult = await this.technicianRepo.findByCorner(
      cornerId as unknown as CornerId,
    );
    if (techResult.isFailure) return Result.err(techResult.unwrapError());
    const technicians = techResult.unwrap();

    // Obtener timezone del corner
    const cornerResult = await this.cornerRepo.findById(
      cornerId as unknown as CornerId,
    );
    if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
    const corner = cornerResult.unwrap();
    const timezone = corner?.timezone ?? 'UTC';

    // Obtener citas activas del corner en esa fecha
    const startOfDay = this.startOfDay(date, timezone);
    const endOfDay = this.endOfDay(date, timezone);
    const appointmentResult = await this.appointmentRepo.findByDateRange(
      cornerId as unknown as CornerId,
      startOfDay,
      endOfDay,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());

    const activeAppointments = appointmentResult
      .unwrap()
      .filter(
        (i) =>
          i.status === AppointmentStatus.IN_PROGRESS ||
          i.status === AppointmentStatus.DELIVERED ||
          i.status === AppointmentStatus.PENDING_THIRD_PARTY ||
          i.status === AppointmentStatus.PENDING_USER ||
          i.status === AppointmentStatus.PENDING_SPARE_PART,
      );

    const dtos: TechnicianAvailabilityDto[] = technicians.map((tech) => {
      const currentAppointment = activeAppointments.find(
        (i) => i.currentTechnicianId?.toString() === tech.id.toString(),
      );

      if (currentAppointment) {
        return {
          technicianId: tech.id.toString(),
          name: tech.name,
          available: false,
          occupiedUntil: currentAppointment.scheduledRange.end,
          currentIncidentId: currentAppointment.id.toString(),
        };
      }

      return {
        technicianId: tech.id.toString(),
        name: tech.name,
        available: true,
      };
    });

    return Result.ok(dtos);
  }

  async checkSlotAvailability(
    cornerId: string,
    startTime: Date,
    duration: number,
  ): Promise<Result<boolean>> {
    const slotsResult = await this.slotRepo.findConsecutiveSlots(
      cornerId,
      startTime,
      duration,
    );
    if (slotsResult.isFailure) return Result.err(slotsResult.unwrapError());
    return Result.ok(slotsResult.unwrap().length > 0);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async calculateAvailability(
    query: AvailabilityQuery,
  ): Promise<SlotAvailabilityDto[] | Error> {
    // 1. Validar que el corner existe y obtener su duración de slot
    const cornerResult = await this.cornerRepo.findById(
      query.cornerId as unknown as CornerId,
    );
    if (cornerResult.isFailure) return cornerResult.unwrapError();
    const corner = cornerResult.unwrap();
    if (!corner) return new Error(`Corner ${query.cornerId} not found`);

    // 2. Obtener todos los slots del día
    const slotsResult = await this.slotRepo.findByCornerAndDate(
      query.cornerId,
      query.date,
    );
    if (slotsResult.isFailure) return slotsResult.unwrapError();
    const allSlots = slotsResult.unwrap();

    // Excluir slots que ya terminaron (generados antes de la hora actual)
    const now = new Date();
    const futureSlots = allSlots.filter((s) => s.timeRange.end > now);
    if (futureSlots.length === 0) return [];
    const activeSlots = futureSlots;

    // La duración del slot está codificada en el propio slot; se deriva del primero disponible
    const firstSlotDurationMin =
      (activeSlots[0].timeRange.end.getTime() -
        activeSlots[0].timeRange.start.getTime()) /
      60_000;
    const slotsNeeded = Math.ceil(query.duration / firstSlotDurationMin);

    // 3. Obtener técnicos e incidencias activas del día para calcular disponibilidad
    const techResult = await this.technicianRepo.findByCorner(
      query.cornerId as unknown as CornerId,
    );
    if (techResult.isFailure) return techResult.unwrapError();
    const technicians = techResult.unwrap();

    const timezone = corner.timezone;
    const startOfDay = this.startOfDay(query.date, timezone);
    const endOfDay = this.endOfDay(query.date, timezone);
    const appointmentResult = await this.appointmentRepo.findByDateRange(
      query.cornerId as unknown as CornerId,
      startOfDay,
      endOfDay,
    );
    if (appointmentResult.isFailure) return appointmentResult.unwrapError();
    const appointments = appointmentResult
      .unwrap()
      .filter(
        (i) =>
          i.status !== AppointmentStatus.CANCELED &&
          i.status !== AppointmentStatus.CLOSED,
      );

    // 4. Construir ventanas de tiempo deslizantes con los slots disponibles
    const result: SlotAvailabilityDto[] = [];
    const userId = query.userId;

    for (let i = 0; i <= activeSlots.length - slotsNeeded; i++) {
      const window = activeSlots.slice(i, i + slotsNeeded);

      // Verificar que los slots son consecutivos
      if (!this.areConsecutive(window)) continue;

      const windowStart = window[0].timeRange.start;
      const windowEnd = window[window.length - 1].timeRange.end;

      // Un slot es "usable" si:
      //   - está AVAILABLE, o
      //   - está HELD por el usuario solicitante, o
      //   - está HELD pero el hold ya expiró (lazy expiration)
      const allUsable = window.every((s) => s.isAvailableForUser(userId));

      // Detectar si todos los slots de la ventana son holds del propio usuario
      const heldByCurrentUser =
        !!userId && window.every((s) => s.isHeldBy(userId));

      // Bloqueada solo por holds vigentes (lote en preparación), sin BOOKED:
      // la UI la distingue porque puede liberarse si el lote se descarta.
      const blockers = window.filter((s) => !s.isAvailableForUser(userId));
      const heldOnly =
        blockers.length > 0 &&
        blockers.every((s) => s.status === SlotStatus.HELD);

      // Calcular disponibilidad de técnicos en esta ventana
      const techAvailability = this.getTechAvailabilityForWindow(
        technicians,
        appointments,
        windowStart,
        windowEnd,
      );

      result.push({
        startTime: windowStart,
        endTime: windowEnd,
        available: allUsable && techAvailability.available > 0,
        slotIds: window.map((s) => s.id.toString()),
        technicians: techAvailability,
        occupiedSlots: blockers.map((s) => s.id.toString()),
        heldByCurrentUser: heldByCurrentUser || undefined,
        held: heldOnly || undefined,
      });
    }

    return result;
  }

  private areConsecutive(slots: Slot[]): boolean {
    for (let i = 1; i < slots.length; i++) {
      const expectedStart = new Date(slots[i - 1].timeRange.end.getTime());
      if (slots[i].timeRange.start.getTime() !== expectedStart.getTime()) {
        return false;
      }
    }
    return true;
  }

  private getTechAvailabilityForWindow(
    technicians: any[],
    appointments: Appointment[],
    windowStart: Date,
    windowEnd: Date,
  ): SlotAvailabilityDto['technicians'] {
    const occupied: SlotAvailabilityDto['technicians']['occupied'] = [];
    const availableNames: string[] = [];

    for (const tech of technicians) {
      const conflict = appointments.find((i) => {
        if (i.currentTechnicianId?.toString() !== tech.id.toString())
          return false;
        // Hay conflicto si el incident se solapa con la ventana
        return (
          i.scheduledRange.start < windowEnd &&
          i.scheduledRange.end > windowStart
        );
      });

      if (conflict) {
        occupied.push({
          id: tech.id.toString(),
          name: tech.name,
          occupiedUntil: conflict.scheduledRange.end,
        });
      } else {
        availableNames.push(tech.name);
      }
    }

    return {
      total: technicians.length,
      available: availableNames.length,
      availableNames,
      occupied,
    };
  }

  private startOfDay(date: Date, timezone: string = 'UTC'): Date {
    const dateStr = format(toZonedTime(date, timezone), 'yyyy-MM-dd');
    return fromZonedTime(`${dateStr}T00:00:00`, timezone);
  }

  private endOfDay(date: Date, timezone: string = 'UTC'): Date {
    const dateStr = format(toZonedTime(date, timezone), 'yyyy-MM-dd');
    return fromZonedTime(`${dateStr}T23:59:59.999`, timezone);
  }
}
