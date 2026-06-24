import { getDay, isAfter, isBefore, isEqual, parse, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { HolidayProvider } from '../providers/holiday-provider.interface';

/**
 * Verifica si una fecha está dentro del horario laboral (Lunes-Viernes, horario configurable).
 */
export function isDuringWorkHours(
    date: Date,
    startTime: string = '09:00',
    endTime: string = '18:00',
    timeZone: string = 'UTC',
): boolean {
    const zonedDate = toZonedTime(date, timeZone);
    const dayOfWeek = getDay(zonedDate);
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;

    const baseDate = new Date(1970, 0, 1);
    const currentTime = parse(format(zonedDate, 'HH:mm'), 'HH:mm', baseDate);
    const parsedStart = parse(startTime, 'HH:mm', baseDate);
    const parsedEnd = parse(endTime, 'HH:mm', baseDate);

    return (
        (isAfter(currentTime, parsedStart) || isEqual(currentTime, parsedStart)) &&
        (isBefore(currentTime, parsedEnd) || isEqual(currentTime, parsedEnd))
    );
}

/**
 * Verifica si una fecha es día hábil (considerando festivos).
 * Requiere un proveedor de días festivos.
 */
export async function isBusinessDay(
    date: Date,
    country: string,
    holidayProvider: HolidayProvider,
    startTime?: string,
    endTime?: string,
    timeZone?: string,
): Promise<boolean> {
    // Primero verificar horario laboral
    if (!isDuringWorkHours(date, startTime, endTime, timeZone)) {
        return false;
    }
    // Luego verificar si es festivo
    const isHoliday = await holidayProvider.isPublicHoliday(date, country);
    return !isHoliday;
}