import { HolidayProvider } from './holiday-provider.interface';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export class CalendarificProvider implements HolidayProvider {
    constructor(
        private httpService: HttpService,
        private apiKey: string,
        private country: string,
    ) { }

    async isHoliday(date: Date): Promise<boolean> {
        const year = date.getFullYear();
        const url = `https://calendarific.com/api/v2/holidays?api_key=${this.apiKey}&country=${this.country}&year=${year}`;

        try {
            const response = await firstValueFrom(this.httpService.get(url));
            const holidays = response.data.response.holidays;
            return holidays.some((holiday: any) => {
                const holidayDate = new Date(holiday.date.iso);
                return holidayDate.toDateString() === date.toDateString();
            });
        } catch (error) {
            console.error('Error fetching holidays:', error);
            return false; // Por defecto, no considerar festivo si falla la API
        }
    }

    async isPublicHoliday(date: Date, country: string): Promise<boolean> {
        const year = date.getFullYear();
        const url = `https://calendarific.com/api/v2/holidays?api_key=${this.apiKey}&country=${country}&year=${year}`;

        try {
            const response = await firstValueFrom(this.httpService.get(url));
            const holidays = response.data.response.holidays;
            return holidays.some((holiday: any) => {
                const holidayDate = new Date(holiday.date.iso);
                return holidayDate.toDateString() === date.toDateString();
            });
        } catch (error) {
            console.error('Error fetching holidays:', error);
            return false;
        }
    }
}