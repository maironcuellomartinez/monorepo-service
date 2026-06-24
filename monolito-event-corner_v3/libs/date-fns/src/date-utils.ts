import {
    format,
    addDays,
    addHours,
    addMinutes,
    addMonths,
    addWeeks,
    addYears,
    subDays,
    subHours,
    subMinutes,
    subMonths,
    subWeeks,
    subYears,
    differenceInDays,
    differenceInHours,
    differenceInMinutes,
    differenceInMonths,
    differenceInWeeks,
    differenceInYears,
    isAfter,
    isBefore,
    isEqual,
    isSameDay,
    isSameHour,
    isSameMinute,
    isSameMonth,
    isSameSecond,
    isSameWeek,
    isSameYear,
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    parse,
    isValid,
    getDay,
    isWeekend,
    formatDistance,
    formatDistanceToNow,
    formatISO,
    addSeconds,
    subSeconds,
    differenceInSeconds,
} from 'date-fns';
import { toZonedTime, format as formatTz } from 'date-fns-tz';
import { HolidayProvider } from './providers/holiday-provider.interface';
import { BusinessHours, DateUnit, TimeUnit, Unit } from './types';
import { SimpleHolidayProvider } from './holiday-provider';

/**
import { Injectable } from '@nestjs/common';
import { DateUtils } from '@yourorg/date-utils';

@Injectable()
export class SomeService {
  constructor(private dateUtils: DateUtils) {}

  async checkDate(date: Date) {
    const formatted = this.dateUtils.format(date, 'yyyy-MM-dd HH:mm');
    const isWorkDay = await this.dateUtils.isBusinessDayExcludingHolidays(date);
    return { formatted, isWorkDay };
  }
}
 */
export class DateUtils {
    private holidayProvider: HolidayProvider;
    private defaultTimeZone: string;
    private businessHours: BusinessHours;

    constructor(options?: {
        holidayProvider?: HolidayProvider;
        defaultTimeZone?: string;
        businessHours?: BusinessHours;
    }) {
        this.holidayProvider = options?.holidayProvider || new SimpleHolidayProvider([]);
        this.defaultTimeZone = options?.defaultTimeZone || 'UTC';
        this.businessHours = options?.businessHours || { start: '09:00', end: '18:00' };
    }

    // ==================== FORMATO ====================
    format(date: Date | string, pattern: string, timeZone?: string): string {
        const d = this.toDate(date);
        const tz = timeZone || this.defaultTimeZone;
        return formatTz(d, pattern, { timeZone: tz });
    }

    formatISO(date: Date | string, timeZone?: string): string {
        const d = this.toDate(date);
        const tz = timeZone || this.defaultTimeZone;
        return formatISO(d);
    }

    // ==================== SUMA/RESTA ====================
    add(date: Date | string, amount: number, unit: Unit): Date {
        const d = this.toDate(date);
        switch (unit) {
            case 'year': return addYears(d, amount);
            case 'month': return addMonths(d, amount);
            case 'week': return addWeeks(d, amount);
            case 'day': return addDays(d, amount);
            case 'hour': return addHours(d, amount);
            case 'minute': return addMinutes(d, amount);
            case 'second': return addSeconds(d, amount); // necesitas importar addSeconds
            default: return d;
        }
    }

    subtract(date: Date | string, amount: number, unit: Unit): Date {
        const d = this.toDate(date);
        switch (unit) {
            case 'year': return subYears(d, amount);
            case 'month': return subMonths(d, amount);
            case 'week': return subWeeks(d, amount);
            case 'day': return subDays(d, amount);
            case 'hour': return subHours(d, amount);
            case 'minute': return subMinutes(d, amount);
            case 'second': return subSeconds(d, amount);
            default: return d;
        }
    }

    // ==================== DIFERENCIAS ====================
    difference(start: Date | string, end: Date | string, unit: Unit): number {
        const s = this.toDate(start);
        const e = this.toDate(end);
        switch (unit) {
            case 'year': return differenceInYears(e, s);
            case 'month': return differenceInMonths(e, s);
            case 'week': return differenceInWeeks(e, s);
            case 'day': return differenceInDays(e, s);
            case 'hour': return differenceInHours(e, s);
            case 'minute': return differenceInMinutes(e, s);
            case 'second': return differenceInSeconds(e, s);
            default: return 0;
        }
    }

    // ==================== COMPARACIONES ====================
    isAfter(date1: Date | string, date2: Date | string): boolean {
        return isAfter(this.toDate(date1), this.toDate(date2));
    }

    isBefore(date1: Date | string, date2: Date | string): boolean {
        return isBefore(this.toDate(date1), this.toDate(date2));
    }

    isEqual(date1: Date | string, date2: Date | string): boolean {
        return isEqual(this.toDate(date1), this.toDate(date2));
    }

    isSame(
        date1: Date | string,
        date2: Date | string,
        unit: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'
    ): boolean {
        const d1 = this.toDate(date1);
        const d2 = this.toDate(date2);
        switch (unit) {
            case 'day': return isSameDay(d1, d2);
            case 'hour': return isSameHour(d1, d2);
            case 'minute': return isSameMinute(d1, d2);
            case 'second': return isSameSecond(d1, d2);
            case 'week': return isSameWeek(d1, d2);
            case 'month': return isSameMonth(d1, d2);
            case 'year': return isSameYear(d1, d2);
            default: return false;
        }
    }

    // ==================== VALIDACIÓN DE HORA ====================
    isValidTime(timeStr: string): boolean {
        const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        return regex.test(timeStr);
    }

    isTimeBetween(
        targetTime: string,
        startTime: string,
        endTime: string
    ): boolean {
        if (!this.isValidTime(targetTime) || !this.isValidTime(startTime) || !this.isValidTime(endTime)) {
            return false;
        }
        const baseDate = new Date(2000, 0, 1);
        const target = parse(targetTime, 'HH:mm', baseDate);
        const start = parse(startTime, 'HH:mm', baseDate);
        const end = parse(endTime, 'HH:mm', baseDate);

        if (isBefore(start, end)) {
            return isAfter(target, start) && isBefore(target, end);
        } else {
            // cruza medianoche
            return isAfter(target, start) || isBefore(target, end);
        }
    }

    // ==================== JORNADA LABORAL ====================
    isBusinessDay(date: Date | string, timeZone?: string): boolean {
        const d = this.toDate(date, timeZone);
        const dayOfWeek = getDay(d);
        // Lunes a viernes: 1-5
        if (dayOfWeek === 0 || dayOfWeek === 6) return false;

        // Verificar horario
        const hours = this.businessHours;
        const currentTime = this.format(d, 'HH:mm', timeZone);
        return this.isTimeBetween(currentTime, hours.start, hours.end);
    }

    // ==================== DÍAS FESTIVOS ====================
    async isHoliday(date: Date | string): Promise<boolean> {
        const d = this.toDate(date);
        return await this.holidayProvider.isHoliday(d);
    }

    async isBusinessDayExcludingHolidays(date: Date | string, timeZone?: string): Promise<boolean> {
        const isWorkDay = this.isBusinessDay(date, timeZone);
        if (!isWorkDay) return false;
        const holiday = await this.isHoliday(date);
        return !holiday;
    }

    // ==================== INICIO/FIN DE UNIDAD ====================
    startOf(date: Date | string, unit: DateUnit): Date {
        const d = this.toDate(date);
        switch (unit) {
            case 'day': return startOfDay(d);
            case 'week': return startOfWeek(d);
            case 'month': return startOfMonth(d);
            case 'year': return startOfYear(d);
            default: return d;
        }
    }

    endOf(date: Date | string, unit: DateUnit): Date {
        const d = this.toDate(date);
        switch (unit) {
            case 'day': return endOfDay(d);
            case 'week': return endOfWeek(d);
            case 'month': return endOfMonth(d);
            case 'year': return endOfYear(d);
            default: return d;
        }
    }

    // ==================== EDAD ====================
    age(birthDate: Date | string): number {
        const birth = this.toDate(birthDate);
        return differenceInYears(new Date(), birth);
    }

    // ==================== FORMATO RELATIVO ====================
    relativeTime(date: Date | string, baseDate?: Date | string): string {
        const d = this.toDate(date);
        const base = baseDate ? this.toDate(baseDate) : new Date();
        return formatDistance(d, base, { addSuffix: true });
    }

    timeFromNow(date: Date | string): string {
        const d = this.toDate(date);
        return formatDistanceToNow(d, { addSuffix: true });
    }

    // ==================== ZONAS HORARIAS ====================
    toZonedTime(date: Date | string, timeZone?: string): Date {
        const d = this.toDate(date);
        const tz = timeZone || this.defaultTimeZone;
        return toZonedTime(d, tz);
    }

    // ==================== UTILIDADES ====================
    private toDate(date: Date | string, timeZone?: string): Date {
        if (date instanceof Date) return date;
        const tz = timeZone || this.defaultTimeZone;
        // parse ISO string y convertir a zona horaria
        const parsed = new Date(date);
        if (isValid(parsed)) {
            return toZonedTime(parsed, tz);
        }
        throw new Error('Invalid date');
    }
}