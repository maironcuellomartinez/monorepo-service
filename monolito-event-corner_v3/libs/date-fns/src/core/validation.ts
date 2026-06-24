import { isValid, parseISO } from 'date-fns';

/**
 * Valida una fecha (objeto Date o string ISO).
 */
export function isValidDate(date: any): boolean {
    if (date instanceof Date) return isValid(date);
    if (typeof date === 'string') return isValid(parseISO(date));
    return false;
}

/**
 * Valida formato HH:mm.
 */
export function isValidTime(time: string): boolean {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(time);
}

/**
 * Valida fecha completa en formato YYYY-MM-DD.
 */
export function isValidDateString(dateStr: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = parseISO(dateStr);
    return isValid(date);
}