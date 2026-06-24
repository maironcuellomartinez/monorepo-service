# @tu-org/date-utils

Librería interna de manejo de fechas construida sobre [`date-fns`](https://date-fns.org/) y [`date-fns-tz`](https://github.com/marnusw/date-fns-tz), con soporte para zonas horarias, días festivos y lógica de jornada laboral.

---

## Tabla de contenidos

1. [Instalación](#instalación)
2. [Arquitectura](#arquitectura)
3. [Integración con NestJS](#integración-con-nestjs)
4. [Tipos y contratos](#tipos-y-contratos)
5. [Módulos core](#módulos-core)
   - [Formateo](#formateo)
   - [Cálculos](#cálculos)
   - [Comparaciones](#comparaciones)
   - [Rangos](#rangos)
   - [Validación](#validación)
   - [Jornada laboral](#jornada-laboral)
6. [Proveedores de días festivos](#proveedores-de-días-festivos)
   - [SimpleHolidayProvider](#simpleholidayprovider)
   - [LocalHolidayProvider](#localholidayprovider)
   - [CalendarificProvider](#calendarificprovider)
   - [Implementar un proveedor propio](#implementar-un-proveedor-propio)
7. [Clase DateUtils](#clase-dateutils)
8. [Casos de uso completos](#casos-de-uso-completos)

---

## Instalación

La librería es un paquete interno del monorepo. Asegúrate de que `tsconfig.json` raíz tenga el path mapeado:

```json
{
  "compilerOptions": {
    "paths": {
      "@tu-org/date-utils": ["libs/date-fns/src/index.ts"]
    }
  }
}
```

Dependencias necesarias:

```bash
npm install date-fns date-fns-tz
# Opcional, solo si usas CalendarificProvider:
npm install @nestjs/axios axios
```

---

## Arquitectura

```
libs/date-fns/
├── app.module.ts                    # Módulo NestJS con registro del proveedor
├── src/
│   ├── index.ts                     # Punto de entrada / barrel de exports
│   ├── date-utils.ts                # Clase principal (facade de todos los módulos)
│   ├── types.ts                     # Tipos: Unit, DateUnit, BusinessHours, etc.
│   ├── holiday-provider.ts          # SimpleHolidayProvider (lista fija en memoria)
│   ├── core/
│   │   ├── formatting.ts            # formatDate, formatDateWithTimezone
│   │   ├── calculations.ts          # add, subtract, difference
│   │   ├── comparisons.ts           # isAfter, isBefore, isEqual, isSame
│   │   ├── ranges.ts                # isTimeBetween, isDateInRange
│   │   ├── validation.ts            # isValidDate, isValidTime, isValidDateString
│   │   └── business.ts              # isDuringWorkHours, isBusinessDay
│   └── providers/
│       ├── holiday-provider.interface.ts   # Contrato HolidayProvider
│       ├── local-holiday-provider.ts       # Proveedor con lista tipada por país
│       └── calendarific-provider.ts        # Proveedor vía API Calendarific
```

> **Dos formas de usar la librería:**
> - **Funciones puras** exportadas desde `src/core/*` — ideal para tree-shaking y uso funcional.
> - **Clase `DateUtils`** — facade orientada a objetos con configuración inyectable, perfecta para NestJS.

---

## Integración con NestJS

### Registro en AppModule

```typescript
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
export class AppModule {}
```

### Uso en un servicio

```typescript
import { Injectable } from '@nestjs/common';
import { DateUtils } from '@tu-org/date-utils';

@Injectable()
export class ScheduleService {
  constructor(private readonly dateUtils: DateUtils) {}

  async canSchedule(date: Date): Promise<boolean> {
    const isWork = await this.dateUtils.isBusinessDayExcludingHolidays(date);
    const formatted = this.dateUtils.format(date, 'yyyy-MM-dd HH:mm');
    console.log(`Fecha: ${formatted} — ¿Hábil? ${isWork}`);
    return isWork;
  }
}
```

---

## Tipos y contratos

```typescript
// Unidades de tiempo disponibles
type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';
type DateUnit = 'year' | 'month' | 'week' | 'day';
type TimeUnit = 'hour' | 'minute' | 'second';

// Configuración de horario laboral
interface BusinessHours {
  start: string;      // Formato HH:mm
  end: string;        // Formato HH:mm
  timeZone?: string;
}

// Contrato para cualquier proveedor de festivos
interface HolidayProvider {
  isHoliday(date: Date): Promise<boolean> | boolean;
  isPublicHoliday(date: Date, country: string): Promise<boolean>;
}

// Para el proveedor local
interface LocalHoliday {
  date: Date;
  name: string;
  country: string;  // Código ISO 3166-1 alpha-2: 'CO', 'AR', 'MX', 'US'...
}
```

---

## Módulos core

### Formateo

> Archivo: `src/core/formatting.ts`

#### `formatDate(date, pattern)`

Formatea una fecha **sin** conversión de zona horaria.

| Parámetro | Tipo     | Descripción                                    |
|-----------|----------|------------------------------------------------|
| `date`    | `Date`   | Fecha a formatear                              |
| `pattern` | `string` | Patrón date-fns (ej: `'yyyy-MM-dd HH:mm:ss'`) |

```typescript
import { formatDate } from '@tu-org/date-utils';

const date = new Date('2024-06-15T10:30:00Z');

formatDate(date, 'yyyy-MM-dd');           // "2024-06-15"
formatDate(date, 'dd/MM/yyyy');           // "15/06/2024"
formatDate(date, 'yyyy-MM-dd HH:mm:ss'); // "2024-06-15 10:30:00"
```

#### `formatDateWithTimezone(date, pattern, timeZone)`

Formatea una fecha **convirtiendo** a la zona horaria especificada.

| Parámetro  | Tipo     | Descripción                                        |
|------------|----------|----------------------------------------------------|
| `date`     | `Date`   | Fecha original (se asume UTC si no tiene zona)     |
| `pattern`  | `string` | Patrón de formato                                  |
| `timeZone` | `string` | Zona IANA, ej: `'America/Bogota'`                  |

```typescript
import { formatDateWithTimezone } from '@tu-org/date-utils';

const utcDate = new Date('2024-06-15T15:00:00Z');

formatDateWithTimezone(utcDate, 'HH:mm', 'America/Bogota');               // "10:00"
formatDateWithTimezone(utcDate, 'HH:mm', 'Europe/Madrid');                // "17:00"
formatDateWithTimezone(utcDate, 'HH:mm', 'America/Argentina/Buenos_Aires'); // "12:00"
```

---

### Cálculos

> Archivo: `src/core/calculations.ts`

Expone tres objetos con funciones agrupadas: `add`, `subtract` y `difference`.

#### `add`

```typescript
import { add } from '@tu-org/date-utils';

const base = new Date('2024-01-01');

add.days(base, 7);     // 2024-01-08
add.months(base, 3);   // 2024-04-01
add.years(base, 1);    // 2025-01-01
add.hours(base, 5);    // 2024-01-01T05:00:00
add.minutes(base, 90); // 2024-01-01T01:30:00
```

#### `subtract`

```typescript
import { subtract } from '@tu-org/date-utils';

const base = new Date('2024-06-15');

subtract.days(base, 10);    // 2024-06-05
subtract.months(base, 2);   // 2024-04-15
subtract.years(base, 1);    // 2023-06-15
subtract.hours(base, 3);    // 2024-06-14T21:00:00
```

#### `difference`

Retorna la diferencia redondeada hacia abajo entre dos fechas.

```typescript
import { difference } from '@tu-org/date-utils';

const start = new Date('2024-01-01');
const end   = new Date('2024-06-15');

difference.days(start, end);    // 166
difference.weeks(start, end);   // 23
difference.months(start, end);  // 5
difference.years(start, end);   // 0
difference.hours(start, end);   // 3984
difference.minutes(start, end); // 239040
```

---

### Comparaciones

> Archivo: `src/core/comparisons.ts`

#### `isAfter / isBefore / isEqual`

Re-exportaciones directas de `date-fns`.

```typescript
import { isAfter, isBefore, isEqual } from '@tu-org/date-utils';

const a = new Date('2024-06-01');
const b = new Date('2024-06-15');

isAfter(b, a);   // true  — b es posterior a a
isBefore(a, b);  // true  — a es anterior a b
isEqual(a, a);   // true
```

#### `isSame(dateLeft, dateRight, unit?)`

Compara si dos fechas son iguales en la unidad dada. Default: `'day'`.

| `unit`     | Descripción                                 |
|------------|---------------------------------------------|
| `'day'`    | Mismo año, mes y día (default)              |
| `'week'`   | Misma semana ISO                            |
| `'month'`  | Mismo mes y año                             |
| `'year'`   | Mismo año                                   |
| `'hour'`   | Mismo año, mes, día y hora                  |
| `'minute'` | Mismo año, mes, día, hora y minuto          |
| `'second'` | Mismo año, mes, día, hora, minuto y segundo |

```typescript
import { isSame } from '@tu-org/date-utils';

const a = new Date('2024-06-15T09:30:00');
const b = new Date('2024-06-15T14:00:00');

isSame(a, b);            // true  — mismo día
isSame(a, b, 'hour');    // false — distinta hora
isSame(a, b, 'month');   // true  — mismo mes y año
isSame(a, b, 'year');    // true  — mismo año
```

---

### Rangos

> Archivo: `src/core/ranges.ts`

#### `isTimeBetween(startStr, endStr, targetStr, timeZone?)`

Verifica si una hora (`HH:mm`) cae dentro de un rango horario.
Soporta rangos que **cruzan medianoche** (ej: `'22:00'` → `'06:00'`).

```typescript
import { isTimeBetween } from '@tu-org/date-utils';

// Rango normal
isTimeBetween('08:00', '17:00', '10:30');  // true
isTimeBetween('08:00', '17:00', '18:00');  // false

// Rango que cruza medianoche
isTimeBetween('22:00', '06:00', '23:30');  // true
isTimeBetween('22:00', '06:00', '05:00');  // true
isTimeBetween('22:00', '06:00', '12:00');  // false

// Con zona horaria
isTimeBetween('08:00', '17:00', '11:00', 'America/Bogota'); // true
```

#### `isDateInRange(date, start, end)`

Verifica si una fecha está dentro de un intervalo **inclusivo** en ambos extremos.

```typescript
import { isDateInRange } from '@tu-org/date-utils';

const start = new Date('2024-01-01');
const end   = new Date('2024-12-31');

isDateInRange(new Date('2024-06-15'), start, end); // true
isDateInRange(new Date('2024-01-01'), start, end); // true  (inclusivo)
isDateInRange(new Date('2024-12-31'), start, end); // true  (inclusivo)
isDateInRange(new Date('2025-01-01'), start, end); // false
```

---

### Validación

> Archivo: `src/core/validation.ts`

#### `isValidDate(date)`

Acepta `Date` o `string` ISO.

```typescript
import { isValidDate } from '@tu-org/date-utils';

isValidDate(new Date('2024-06-15'));  // true
isValidDate(new Date('invalid'));     // false
isValidDate('2024-06-15');           // true  (string ISO)
isValidDate('not-a-date');           // false
isValidDate(null);                   // false
```

#### `isValidTime(time)`

Valida formato `HH:mm` estricto (00:00 – 23:59).

```typescript
import { isValidTime } from '@tu-org/date-utils';

isValidTime('08:00');  // true
isValidTime('23:59');  // true
isValidTime('24:00');  // false
isValidTime('8:00');   // false — falta el cero inicial
isValidTime('08:60');  // false
```

#### `isValidDateString(dateStr)`

Valida formato `YYYY-MM-DD` y que la fecha resultante sea real.

```typescript
import { isValidDateString } from '@tu-org/date-utils';

isValidDateString('2024-06-15');  // true
isValidDateString('2024-02-29');  // true  (2024 es bisiesto)
isValidDateString('2023-02-29');  // false (2023 no es bisiesto)
isValidDateString('15-06-2024');  // false — formato incorrecto
isValidDateString('2024/06/15');  // false — separador incorrecto
```

---

### Jornada laboral

> Archivo: `src/core/business.ts`

#### `isDuringWorkHours(date, startTime?, endTime?, timeZone?)`

Verifica si una fecha/hora cae dentro del horario laboral (lunes a viernes, configurable).

| Parámetro   | Tipo     | Default   | Descripción               |
|-------------|----------|-----------|---------------------------|
| `date`      | `Date`   | —         | Fecha a evaluar           |
| `startTime` | `string` | `'09:00'` | Inicio jornada (HH:mm)    |
| `endTime`   | `string` | `'18:00'` | Fin jornada (HH:mm)       |
| `timeZone`  | `string` | `'UTC'`   | Zona horaria IANA         |

```typescript
import { isDuringWorkHours } from '@tu-org/date-utils';

const weekday  = new Date('2024-05-15T10:00:00Z'); // miércoles
const saturday = new Date('2024-05-18T10:00:00Z'); // sábado

isDuringWorkHours(weekday);                                       // true
isDuringWorkHours(weekday, '08:00', '17:00', 'America/Bogota');   // true
isDuringWorkHours(saturday);                                      // false (fin de semana)

const lateNight = new Date('2024-05-15T22:00:00Z');
isDuringWorkHours(lateNight);                                     // false
```

#### `isBusinessDay(date, country, holidayProvider, startTime?, endTime?, timeZone?)`

Verifica si una fecha es día hábil: debe ser día laboral **y** no festivo según el proveedor.

```typescript
import { isBusinessDay, LocalHolidayProvider } from '@tu-org/date-utils';

const provider = new LocalHolidayProvider([
  { date: new Date('2024-01-01'), name: 'Año Nuevo', country: 'CO' },
  { date: new Date('2024-12-25'), name: 'Navidad',   country: 'CO' },
], 'CO');

// Lunes 6 de enero 2024 a las 10:00 UTC
const monday = new Date('2024-01-06T10:00:00Z');
await isBusinessDay(monday, 'CO', provider, '08:00', '17:00', 'America/Bogota');
// → true

// 1 de enero (festivo)
const newYear = new Date('2024-01-01T10:00:00Z');
await isBusinessDay(newYear, 'CO', provider);
// → false
```

---

## Proveedores de días festivos

Todos los proveedores implementan la interfaz `HolidayProvider`:

```typescript
interface HolidayProvider {
  isHoliday(date: Date): Promise<boolean> | boolean;
  isPublicHoliday(date: Date, country: string): Promise<boolean>;
}
```

### SimpleHolidayProvider

Proveedor en memoria con una lista de fechas fijas. Sin conciencia de país.
Ideal para pruebas o fechas universales (ej: Navidad, Año Nuevo).

```typescript
import { SimpleHolidayProvider } from '@tu-org/date-utils';

const provider = new SimpleHolidayProvider([
  new Date('2024-01-01'),
  new Date('2024-12-25'),
]);

await provider.isHoliday(new Date('2024-12-25'));              // true
await provider.isHoliday(new Date('2024-06-15'));              // false
await provider.isPublicHoliday(new Date('2024-01-01'), 'CO'); // true (delega a isHoliday)
```

---

### LocalHolidayProvider

Proveedor en memoria con festivos tipados por nombre y país. Permite manejar múltiples países en una sola instancia.

```typescript
import { LocalHolidayProvider } from '@tu-org/date-utils';

const holidays = [
  { date: new Date('2024-07-04'), name: 'Independence Day',        country: 'US' },
  { date: new Date('2024-07-20'), name: 'Día de la Independencia', country: 'CO' },
  { date: new Date('2024-12-25'), name: 'Christmas',               country: 'US' },
  { date: new Date('2024-12-25'), name: 'Navidad',                 country: 'CO' },
];

// isHoliday filtra por el país del constructor
const coProvider = new LocalHolidayProvider(holidays, 'CO');

await coProvider.isHoliday(new Date('2024-07-20'));  // true  (festivo CO)
await coProvider.isHoliday(new Date('2024-07-04'));  // false (festivo US, no CO)

// isPublicHoliday permite consultar por país dinámicamente
await coProvider.isPublicHoliday(new Date('2024-07-04'), 'US'); // true
await coProvider.isPublicHoliday(new Date('2024-07-04'), 'CO'); // false
```

---

### CalendarificProvider

Proveedor que consulta la [API de Calendarific](https://calendarific.com/) para obtener los festivos oficiales de cualquier país. Requiere `@nestjs/axios`.

```typescript
// Registro en módulo NestJS
import { HttpModule } from '@nestjs/axios';
import { CalendarificProvider } from '@tu-org/date-utils';

@Module({
  imports: [HttpModule],
  providers: [
    {
      provide: 'HOLIDAY_PROVIDER',
      useFactory: (httpService: HttpService) =>
        new CalendarificProvider(httpService, 'TU_API_KEY', 'CO'),
      inject: [HttpService],
    },
  ],
})
export class HolidayModule {}
```

```typescript
// Uso en servicio
const isHoliday = await provider.isPublicHoliday(new Date('2024-12-25'), 'CO'); // true
```

> **Nota:** Si la API falla, retorna `false` por defecto. No lanza excepción para no bloquear el flujo de negocio.

---

### Implementar un proveedor propio

```typescript
import { HolidayProvider } from '@tu-org/date-utils';

export class MyDatabaseHolidayProvider implements HolidayProvider {
  constructor(private readonly holidayRepo: HolidayRepository) {}

  async isHoliday(date: Date): Promise<boolean> {
    return this.holidayRepo.existsByDate(date);
  }

  async isPublicHoliday(date: Date, country: string): Promise<boolean> {
    return this.holidayRepo.existsByDateAndCountry(date, country);
  }
}
```

---

## Clase DateUtils

Facade orientada a objetos que agrupa todos los módulos con configuración inyectable.

### Constructor

```typescript
new DateUtils(options?: {
  holidayProvider?: HolidayProvider;  // Default: SimpleHolidayProvider([])
  defaultTimeZone?: string;           // Default: 'UTC'
  businessHours?: BusinessHours;      // Default: { start: '09:00', end: '18:00' }
})
```

### Referencia de métodos

| Método | Firma | Descripción |
|--------|-------|-------------|
| `format` | `(date, pattern, timeZone?)` | Formatea fecha con zona horaria |
| `formatISO` | `(date, timeZone?)` | Formato ISO 8601 |
| `add` | `(date, amount, unit)` | Suma unidades de tiempo |
| `subtract` | `(date, amount, unit)` | Resta unidades de tiempo |
| `difference` | `(start, end, unit)` | Diferencia entre fechas |
| `isAfter` | `(date1, date2)` | Comparación de orden |
| `isBefore` | `(date1, date2)` | Comparación de orden |
| `isEqual` | `(date1, date2)` | Igualdad exacta |
| `isSame` | `(date1, date2, unit)` | Igualdad por unidad |
| `isValidTime` | `(timeStr)` | Valida formato HH:mm |
| `isTimeBetween` | `(target, start, end)` | Hora dentro de rango |
| `isBusinessDay` | `(date, timeZone?)` | Día hábil sin verificar festivos |
| `isHoliday` | `(date)` | Es festivo según el proveedor |
| `isBusinessDayExcludingHolidays` | `(date, timeZone?)` | Día hábil excluyendo festivos |
| `startOf` | `(date, unit)` | Inicio de período |
| `endOf` | `(date, unit)` | Fin de período |
| `age` | `(birthDate)` | Calcula edad en años |
| `relativeTime` | `(date, baseDate?)` | Tiempo relativo (ej: "hace 3 días") |
| `timeFromNow` | `(date)` | Tiempo desde/hasta ahora |
| `toZonedTime` | `(date, timeZone?)` | Convierte a zona horaria |

```typescript
const utils = new DateUtils({
  defaultTimeZone: 'America/Bogota',
  businessHours: { start: '08:00', end: '17:00' },
  holidayProvider: new SimpleHolidayProvider([new Date('2024-12-25')]),
});

utils.format(new Date(), 'yyyy-MM-dd');                                    // "2026-04-01"
utils.add(new Date('2024-01-01'), 5, 'day');                               // 2024-01-06
utils.difference(new Date('2024-01-01'), new Date('2024-06-01'), 'month'); // 5
await utils.isBusinessDayExcludingHolidays(new Date('2024-12-25'));        // false
utils.startOf(new Date('2024-06-15'), 'month');                            // 2024-06-01T00:00:00
utils.endOf(new Date('2024-06-15'), 'month');                              // 2024-06-30T23:59:59
utils.age(new Date('1990-05-15'));                                          // 34
utils.relativeTime(new Date('2024-01-01'));                                 // "hace X meses"
utils.timeFromNow(new Date(Date.now() - 60000));                           // "hace 1 minuto"
```

---

## Casos de uso completos

### Caso 1: Validar y agendar una reunión

```typescript
import {
  isValidDateString,
  isValidTime,
  isDuringWorkHours,
  isBusinessDay,
  LocalHolidayProvider,
} from '@tu-org/date-utils';

const colombianHolidays = [
  { date: new Date('2024-01-01'), name: 'Año Nuevo',            country: 'CO' },
  { date: new Date('2024-01-08'), name: 'Reyes Magos',          country: 'CO' },
  { date: new Date('2024-03-25'), name: 'Día de San José',      country: 'CO' },
  { date: new Date('2024-05-01'), name: 'Día del Trabajo',      country: 'CO' },
  { date: new Date('2024-07-20'), name: 'Día de Independencia', country: 'CO' },
  { date: new Date('2024-12-25'), name: 'Navidad',              country: 'CO' },
];

const provider = new LocalHolidayProvider(colombianHolidays, 'CO');

async function validateMeeting(dateStr: string, timeStr: string): Promise<string> {
  if (!isValidDateString(dateStr)) {
    return `Error: '${dateStr}' no es una fecha válida. Use YYYY-MM-DD.`;
  }
  if (!isValidTime(timeStr)) {
    return `Error: '${timeStr}' no es una hora válida. Use HH:mm.`;
  }

  const date = new Date(`${dateStr}T${timeStr}:00`);

  if (!isDuringWorkHours(date, '08:00', '17:00', 'America/Bogota')) {
    return 'La reunión está fuera del horario laboral (08:00–17:00, Lun–Vie).';
  }

  const isWorkDay = await isBusinessDay(date, 'CO', provider, '08:00', '17:00', 'America/Bogota');
  if (!isWorkDay) {
    return 'No se pueden agendar reuniones en días festivos colombianos.';
  }

  return `Reunión confirmada: ${dateStr} a las ${timeStr} (hora Bogotá).`;
}

// Pruebas:
await validateMeeting('2024-12-25', '10:00'); // festivio → rechazada
await validateMeeting('2024-06-15', '22:00'); // fuera de horario → rechazada
await validateMeeting('2024-06-15', '09:30'); // confirmada
```

---

### Caso 2: Calcular vencimiento de un contrato

```typescript
import { add, difference, isDateInRange, formatDate } from '@tu-org/date-utils';

interface ContractSummary {
  startDate: string;
  expiryDate: string;
  isActive: boolean;
  daysRemaining: number;
  status: string;
}

function calculateContractExpiry(startDate: Date, durationMonths: number): ContractSummary {
  const expiryDate   = add.months(startDate, durationMonths);
  const today        = new Date();
  const isActive     = isDateInRange(today, startDate, expiryDate);
  const daysRemaining = Math.max(0, difference.days(today, expiryDate));

  let status: string;
  if (!isActive)           status = 'Vencido';
  else if (daysRemaining <= 30) status = 'Por vencer';
  else                     status = 'Vigente';

  return {
    startDate:  formatDate(startDate, 'dd/MM/yyyy'),
    expiryDate: formatDate(expiryDate, 'dd/MM/yyyy'),
    isActive,
    daysRemaining,
    status,
  };
}

console.log(calculateContractExpiry(new Date('2024-01-01'), 12));
// { startDate: '01/01/2024', expiryDate: '01/01/2025', isActive: true, daysRemaining: 200, status: 'Vigente' }

console.log(calculateContractExpiry(new Date('2023-01-01'), 12));
// { startDate: '01/01/2023', expiryDate: '01/01/2024', isActive: false, daysRemaining: 0, status: 'Vencido' }
```

---

### Caso 3: Mostrar fechas en la zona horaria del usuario

```typescript
import { formatDateWithTimezone, isSame } from '@tu-org/date-utils';

function displayEventTime(utcDate: Date, userTimezone: string): string {
  const today    = new Date();
  const isToday  = isSame(utcDate, today, 'day');

  const dateLabel = isToday
    ? 'Hoy'
    : formatDateWithTimezone(utcDate, "EEEE d 'de' MMMM", userTimezone);
  const time = formatDateWithTimezone(utcDate, 'HH:mm', userTimezone);

  return `${dateLabel} a las ${time} (${userTimezone})`;
}

const event = new Date('2024-06-15T15:00:00Z');

displayEventTime(event, 'America/Bogota');               // "Sábado 15 de junio a las 10:00 (America/Bogota)"
displayEventTime(event, 'Europe/Madrid');                // "Sábado 15 de junio a las 17:00 (Europe/Madrid)"
displayEventTime(event, 'America/Argentina/Buenos_Aires'); // "Sábado 15 de junio a las 12:00 (...)"
displayEventTime(event, 'America/New_York');             // "Sábado 15 de junio a las 11:00 (America/New_York)"
```

---

### Caso 4: Dashboard de actividad de usuarios

```typescript
import { DateUtils, SimpleHolidayProvider } from '@tu-org/date-utils';

const utils = new DateUtils({ defaultTimeZone: 'America/Bogota' });

interface UserActivity {
  userId: string;
  lastLogin: Date;
  birthDate: Date;
}

function buildActivityReport(user: UserActivity) {
  const now = new Date();

  return {
    lastLoginFormatted: utils.format(user.lastLogin, "dd/MM/yyyy 'a las' HH:mm"),
    lastLoginRelative:  utils.timeFromNow(user.lastLogin),          // "hace 2 horas"
    age:                utils.age(user.birthDate),                  // 34
    accountStartOfMonth: utils.format(
      utils.startOf(user.lastLogin, 'month'),
      'dd/MM/yyyy'
    ),
    accountEndOfMonth:   utils.format(
      utils.endOf(user.lastLogin, 'month'),
      'dd/MM/yyyy'
    ),
    isRecentlyActive:   utils.difference(user.lastLogin, now, 'hour') < 24,
  };
}

buildActivityReport({
  userId: 'u-001',
  lastLogin: new Date(Date.now() - 1000 * 60 * 120), // hace 2h
  birthDate: new Date('1990-08-20'),
});
// {
//   lastLoginFormatted: "01/04/2026 a las 09:40",
//   lastLoginRelative:  "hace 2 horas",
//   age:                35,
//   accountStartOfMonth: "01/04/2026",
//   accountEndOfMonth:   "30/04/2026",
//   isRecentlyActive:   true
// }
```

---

## Referencia de patrones de formato (date-fns)

| Patrón          | Resultado         | Descripción              |
|-----------------|-------------------|--------------------------|
| `yyyy`          | `2024`            | Año (4 dígitos)          |
| `yy`            | `24`              | Año (2 dígitos)          |
| `MM`            | `06`              | Mes (2 dígitos)          |
| `MMM`           | `Jun`             | Mes abreviado            |
| `MMMM`          | `June`            | Mes completo             |
| `dd`            | `15`              | Día del mes (2 dígitos)  |
| `d`             | `15`              | Día del mes              |
| `EEEE`          | `Saturday`        | Día de la semana completo|
| `EEE`           | `Sat`             | Día de la semana abrev.  |
| `HH`            | `14`              | Hora (24h, 2 dígitos)    |
| `hh`            | `02`              | Hora (12h, 2 dígitos)    |
| `mm`            | `30`              | Minutos                  |
| `ss`            | `00`              | Segundos                 |
| `a`             | `PM`              | AM/PM                    |
| `yyyy-MM-dd`    | `2024-06-15`      | Fecha ISO                |
| `HH:mm:ss`      | `14:30:00`        | Hora completa            |
| `dd/MM/yyyy`    | `15/06/2024`      | Fecha local              |
| `'texto'`       | `texto`           | Texto literal            |

> Ver referencia completa en: https://date-fns.org/docs/format
