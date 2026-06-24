import {
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
} from 'date-fns';

/**
 * Compara si dos fechas son iguales en la unidad especificada.
 * @param dateLeft
 * @param dateRight
 * @param unit 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'
 */
export function isSame(
    dateLeft: Date,
    dateRight: Date,
    unit: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year' = 'day',
): boolean {
    switch (unit) {
        case 'day': return isSameDay(dateLeft, dateRight);
        case 'hour': return isSameHour(dateLeft, dateRight);
        case 'minute': return isSameMinute(dateLeft, dateRight);
        case 'second': return isSameSecond(dateLeft, dateRight);
        case 'week': return isSameWeek(dateLeft, dateRight);
        case 'month': return isSameMonth(dateLeft, dateRight);
        case 'year': return isSameYear(dateLeft, dateRight);
        default: return isSameDay(dateLeft, dateRight);
    }
}

export { isAfter, isBefore, isEqual };