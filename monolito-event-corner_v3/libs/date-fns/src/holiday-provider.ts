import { HolidayProvider } from './providers/holiday-provider.interface';

// Proveedor simple con lista de fechas fijas
export class SimpleHolidayProvider implements HolidayProvider {
    constructor(private holidays: Date[]) { }

    isHoliday(date: Date): boolean {
        return this.holidays.some(holiday =>
            holiday.toDateString() === date.toDateString()
        );
    }

    async isPublicHoliday(date: Date, _country: string): Promise<boolean> {
        return this.isHoliday(date);
    }
}

// Proveedor usando una API externa (ejemplo con Calendarific)
// Puedes implementar otros como el de date-holidays