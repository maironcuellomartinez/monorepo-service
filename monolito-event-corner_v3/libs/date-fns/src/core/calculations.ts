import {
    addDays,
    addHours,
    addMinutes,
    addMonths,
    addYears,
    subDays,
    subHours,
    subMonths,
    subYears,
    differenceInDays,
    differenceInHours,
    differenceInMinutes,
    differenceInMonths,
    differenceInWeeks,
    differenceInYears,
} from 'date-fns';

export const add = {
    days: addDays,
    hours: addHours,
    minutes: addMinutes,
    months: addMonths,
    years: addYears,
};

export const subtract = {
    days: subDays,
    hours: subHours,
    months: subMonths,
    years: subYears,
};

export const difference = {
    days: differenceInDays,
    hours: differenceInHours,
    minutes: differenceInMinutes,
    months: differenceInMonths,
    weeks: differenceInWeeks,
    years: differenceInYears,
};