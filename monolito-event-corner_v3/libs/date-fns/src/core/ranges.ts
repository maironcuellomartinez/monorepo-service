import { isAfter, isBefore, isEqual, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Verifica si una hora (formato HH:mm) está dentro de un rango.
 * @param startStr Hora inicio (HH:mm)
 * @param endStr Hora fin (HH:mm)
 * @param targetStr Hora objetivo (HH:mm)
 * @param timeZone Zona horaria opcional
 */
export function isTimeBetween(
    startStr: string,
    endStr: string,
    targetStr: string,
    timeZone?: string,
): boolean {
    const baseDate = new Date(2000, 0, 1);
    let start = parse(startStr, 'HH:mm', baseDate);
    let end = parse(endStr, 'HH:mm', baseDate);
    let target = parse(targetStr, 'HH:mm', baseDate);

    if (timeZone) {
        start = toZonedTime(start, timeZone);
        end = toZonedTime(end, timeZone);
        target = toZonedTime(target, timeZone);
    }

    if (isBefore(start, end)) {
        return (isAfter(target, start) || isEqual(target, start)) && isBefore(target, end);
    } else {
        // Cruza medianoche
        return isAfter(target, start) || isBefore(target, end);
    }
}

/**
 * Verifica si una fecha está dentro de un intervalo.
 */
export function isDateInRange(
    date: Date,
    start: Date,
    end: Date,
): boolean {
    return (isAfter(date, start) || isEqual(date, start)) && (isBefore(date, end) || isEqual(date, end));
}