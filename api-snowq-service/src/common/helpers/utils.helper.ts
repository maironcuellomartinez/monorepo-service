import { ServiceNowFatalError } from '../errors/if-faltal.error';
import { ServiceNowTemporalError } from '../errors/if-temporal.error';
import { ServiceNowAuthError } from '../errors/servicenow-auth.error';

export const isTemporaryError = (error: unknown): error is ServiceNowTemporalError =>
    error instanceof ServiceNowTemporalError;

export const isFatalError = (error: unknown): error is ServiceNowFatalError =>
    error instanceof ServiceNowFatalError;

export const isAuthError = (error: unknown): error is ServiceNowAuthError =>
    error instanceof ServiceNowAuthError;
