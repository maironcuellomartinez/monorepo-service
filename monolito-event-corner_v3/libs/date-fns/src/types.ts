export type Unit =
    | 'year'
    | 'month'
    | 'week'
    | 'day'
    | 'hour'
    | 'minute'
    | 'second';

export type TimeUnit = 'hour' | 'minute' | 'second';
export type DateUnit = 'year' | 'month' | 'week' | 'day';

export interface BusinessHours {
    start: string; // HH:mm
    end: string;   // HH:mm
    timeZone?: string;
}

export interface HolidayConfig {
    country?: string;
    region?: string;
    customHolidays?: Date[];
}