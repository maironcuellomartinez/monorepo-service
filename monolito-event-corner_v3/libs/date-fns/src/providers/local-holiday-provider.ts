import { HolidayProvider } from './holiday-provider.interface';

export interface LocalHoliday {
    date: Date;
    name: string;
    country: string;
}

export class LocalHolidayProvider implements HolidayProvider {
    private holidays: LocalHoliday[] = [];
    private country: string;

    constructor(holidays: LocalHoliday[], country: string) {
        this.holidays = holidays;
        this.country = country;
    }

    async isHoliday(date: Date): Promise<boolean> {
        return this.holidays.some(h =>
            h.country === this.country &&
            h.date.toDateString() === date.toDateString()
        );
    }

    async isPublicHoliday(date: Date, country: string): Promise<boolean> {
        return this.holidays.some(h =>
            h.country === country &&
            h.date.toDateString() === date.toDateString()
        );
    }
}