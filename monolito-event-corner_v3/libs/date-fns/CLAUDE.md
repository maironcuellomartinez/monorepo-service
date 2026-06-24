# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a NestJS shared library (`@tu-org/date-utils`) for date manipulation, built on `date-fns` and `date-fns-tz`. It provides both a unified `DateUtils` class and standalone functional modules.

## Build & Test

```bash
npm run build    # Compile TypeScript to dist/
npm test         # Run Jest tests
```

## Architecture

### Entry Point

`src/index.ts` exports the `DateUtils` class (main facade) and functional modules from `src/core/`.

### Two-Layer Design

1. **`DateUtils` class** (`src/date-utils.ts`) — Stateful facade combining formatting, calculations, comparisons, ranges, validation, and business hour logic. Injectable as a NestJS provider.

2. **Standalone functions** (`src/core/`) — Pure functions organized by concern:
   - `calculations.ts` — add/subtract/difference helpers
   - `comparisons.ts` — isAfter, isBefore, isEqual, isSame
   - `formatting.ts` — formatDate, formatDateWithTimezone
   - `ranges.ts` — isTimeBetween, isDateInRange
   - `validation.ts` — isValidDate, isValidTime, isValidDateString

### Holiday Provider Pattern

Holiday providers use an interface in `src/providers/holiday-provider.interface.ts`. Two implementations exist:

- **`SimpleHolidayProvider`** (`src/holiday-provider.ts`) — In-memory holiday list. Used for simple cases.
- **`LocalHolidayProvider`** (`src/providers/local-holiday-provider.ts`) — In-memory with country filtering.
- **`CalendarificProvider`** (`src/providers/calendarific-provider.ts`) — Fetches from Calendarific API. Requires `@nestjs/axios` peer dependency.

## Usage

### As NestJS Provider

```typescript
import { DateUtils, SimpleHolidayProvider } from '@tu-org/date-utils';

const holidays = [new Date('2023-12-25')];
const provider = new SimpleHolidayProvider(holidays);

const dateUtils = new DateUtils({
    holidayProvider: provider,
    defaultTimeZone: 'America/Bogota',
    businessHours: { start: '08:00', end: '17:00' },
});
```

### Standalone Functions

```typescript
import { add, subtract, difference } from './core/calculations';
import { isSame } from './core/comparisons';
import { formatDate, formatDateWithTimezone } from './core/formatting';
import { isTimeBetween, isDateInRange } from './core/ranges';
import { isValidDate, isValidTime } from './core/validation';
```

## Dependencies

- `date-fns` ^2.30.0 — Core date manipulation
- `date-fns-tz` ^2.0.0 — Timezone support
- `@nestjs/axios` ^3.0.0 — Peer dependency (only needed for CalendarificProvider)
