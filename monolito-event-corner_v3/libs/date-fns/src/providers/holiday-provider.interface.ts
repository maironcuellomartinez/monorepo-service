export interface HolidayProvider {
    isHoliday(date: Date): Promise<boolean> | boolean;
    isPublicHoliday(date: Date, country: string): Promise<boolean>;
}