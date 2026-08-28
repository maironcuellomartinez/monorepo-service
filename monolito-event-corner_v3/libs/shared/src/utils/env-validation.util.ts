import * as Joi from 'joi';

const PLACEHOLDER_PREFIXES = ['CHANGE_ME', 'REPLACE_WITH_'];

/**
 * Rechaza valores que todavía son el placeholder sin completar de un
 * .env.staging/.env.production (ver CLAUDE.md: "las claves se inyectan por
 * secretos (k8s); los .env.* traen placeholders CHANGE_ME / REPLACE_WITH_").
 * En dev nunca dispara — los .env.development ya traen valores reales.
 */
export function notPlaceholder(schema: Joi.StringSchema): Joi.StringSchema {
    return schema
        .custom((value: string, helpers) => {
            if (PLACEHOLDER_PREFIXES.some((prefix) => value.startsWith(prefix))) {
                return helpers.error('any.placeholder');
            }
            return value;
        }, 'reject unfilled .env placeholders')
        .messages({
            'any.placeholder':
                '"{{#label}}" todavía tiene el valor placeholder del .env sin completar',
        });
}
