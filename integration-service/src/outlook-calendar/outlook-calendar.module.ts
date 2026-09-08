// src/outlook-calendar/outlook-calendar.module.ts
import { Module } from '@nestjs/common';
import { OutlookCalendarConnector } from './outlook-calendar.connector';
import { CalendarAdapter } from './calendar.adapter';

// Sin controller propio todavia -- nada en el ecosistema llama a este
// conector hoy (ver README, seccion de conectores registrados).
@Module({
    providers: [OutlookCalendarConnector, CalendarAdapter],
    exports: [OutlookCalendarConnector],
})
export class OutlookCalendarModule { }
