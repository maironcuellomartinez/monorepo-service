// core/domain/enums/day-of-week.enum.ts

/**
 * Días de la semana con valores string para persistencia en BD
 * @example
 * const day = DayOfWeek.MONDAY; // 'MON'
 */
export enum DayOfWeek {
    SUNDAY = 'SUN',
    MONDAY = 'MON',
    TUESDAY = 'TUE',
    WEDNESDAY = 'WED',
    THURSDAY = 'THU',
    FRIDAY = 'FRI',
    SATURDAY = 'SAT'
}

export const ALL_WEEKDAYS: DayOfWeek[] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY
];

export const ALL_WEEKEND_DAYS: DayOfWeek[] = [
    DayOfWeek.SUNDAY,
    DayOfWeek.SATURDAY
];

export const ALL_DAYS: DayOfWeek[] = [
    DayOfWeek.SUNDAY,
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY
];

export function isWeekend(day: DayOfWeek): boolean {
    return day === DayOfWeek.SUNDAY || day === DayOfWeek.SATURDAY;
}

export function isWeekday(day: DayOfWeek): boolean {
    return !isWeekend(day);
}

export function getDayName(day: DayOfWeek): string {
    const names: Record<DayOfWeek, string> = {
        [DayOfWeek.SUNDAY]: 'Sunday',
        [DayOfWeek.MONDAY]: 'Monday',
        [DayOfWeek.TUESDAY]: 'Tuesday',
        [DayOfWeek.WEDNESDAY]: 'Wednesday',
        [DayOfWeek.THURSDAY]: 'Thursday',
        [DayOfWeek.FRIDAY]: 'Friday',
        [DayOfWeek.SATURDAY]: 'Saturday'
    };
    return names[day];
}

export function getDayOfWeekFromDate(date: Date): DayOfWeek {
    const days: DayOfWeek[] = [
        DayOfWeek.SUNDAY,
        DayOfWeek.MONDAY,
        DayOfWeek.TUESDAY,
        DayOfWeek.WEDNESDAY,
        DayOfWeek.THURSDAY,
        DayOfWeek.FRIDAY,
        DayOfWeek.SATURDAY
    ];
    return days[date.getDay()];
}

export function parseDayOfWeek(value: string): DayOfWeek | null {
    const upperValue = value.toUpperCase();
    const validDays = Object.values(DayOfWeek) as string[];
    if (validDays.includes(upperValue)) {
        return upperValue as DayOfWeek;
    }
    return null;
}