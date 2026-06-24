// app.module.ts
import { Module } from '@nestjs/common';
import { DateUtils } from './src/date-utils';
import { SimpleHolidayProvider } from './src/holiday-provider';

@Module({
    providers: [
        {
            provide: DateUtils,
            useFactory: () => {
                const holidays = [new Date('2023-12-25'), new Date('2024-01-01')];
                const provider = new SimpleHolidayProvider(holidays);
                return new DateUtils({
                    holidayProvider: provider,
                    defaultTimeZone: 'America/Bogota',
                    businessHours: { start: '08:00', end: '17:00' },
                });
            },
        },
    ],
    exports: [DateUtils],
})
export class AppModule { }