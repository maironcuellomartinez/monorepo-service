import { format as formatDateFns } from 'date-fns';
import { format as formatDateFnsTz, toZonedTime } from 'date-fns-tz';

/**
 * Formato básico sin zona horaria.
 * @param date Fecha a formatear
 * @param pattern Patrón de formato (ej: 'yyyy-MM-dd HH:mm:ss')
 */
export function formatDate(date: Date, pattern: string): string {
    return formatDateFns(date, pattern);
}

/**
 * Formato con zona horaria específica.
 * @param date Fecha original (se asume UTC si no tiene zona)
 * @param pattern Patrón de formato
 * @param timeZone Zona horaria destino (ej: 'America/New_York')
 */
export function formatDateWithTimezone(
    date: Date,
    pattern: string,
    timeZone: string,
): string {
    const zonedDate = toZonedTime(date, timeZone);
    return formatDateFnsTz(zonedDate, pattern, { timeZone });
}