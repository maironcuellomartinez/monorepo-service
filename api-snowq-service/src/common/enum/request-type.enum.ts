/**
 * Enumeración de tipos de peticiones compatibles con ServiceNow
 * Nota: Los valores deben coincidir con los nombres de tabla en ServiceNow
 * 
 * Resumen en Tabla:
 * | Tipo de Petición       | Descripción breve                                      | Tabla ServiceNow         |
 * |------------------------|--------------------------------------------------------|--------------------------|
 * | INCIDENT               | Resolver interrupciones del servicio                   | incident                 |
 * | CHANGE_REQUEST         | Gestionar cambios en la infraestructura TI             | change_request           |
 * | SERVICE_CATALOG        | Proveer acceso a servicios TI                          | sc_req_item              |
 * | PROBLEM                | Investigar causas raíz de incidentes                   | problem                  |
 * | KNOWLEDGE_ARTICLE      | Compartir información/documentación                    | kb_article               |
 * | RELEASE_TASK           | Tarea dentro de un lanzamiento de cambios              | release_task             |  
 * | CONFIGURATION_ITEM     | Solicitudes de cumplimiento relacionados con CI        | cmdb_ci                  |
 * |------------------------|--------------------------------------------------------|--------------------------|
 * 
 * @summary Enumeración de tipos de peticiones compatibles con ServiceNow
 * @description Esta enumeración define los tipos de peticiones que se pueden gestionar
 * en ServiceNow, cada uno con su propia tabla asociada.
 */
export enum RequestType {
    /**
     * Tickets de incidente (Tabla incident)
     * - Problemas no planificados que interrumpen servicios
     * - Prioridad alta por defecto
     */
    INCIDENT = 'incident',

    /**
     * Solicitudes de cambio (Tabla change_request)
     * - Cambios planificados en la infraestructura
     * - Requieren aprobación
     */
    CHANGE_REQUEST = 'change_request',

    /**
     * Items del catálogo de servicios (Tabla sc_req_item)
     * - Solicitudes de servicio estándar
     * - Baja prioridad por defecto
     */
    SERVICE_CATALOG = 'sc_req_item',

    /**
     * Tickets de problema (Tabla problem)
     * - Problemas recurrentes o de causa desconocida
     * - Requieren análisis root-cause
     */
    PROBLEM = 'problem',

    /**
     * Elementos de knowledge base (Tabla kb_article)
     * - Artículos de documentación/soluciones
     */
    KNOWLEDGE_ARTICLE = 'kb_article',

    /**
     * Tareas de liberación (Tabla release_task)
     * - Items relacionados con releases/implementaciones
     */
    RELEASE_TASK = 'release_task',

    /**
     * Solicitudes de cumplimiento (Tabla cmdb_ci)
     * - Relacionadas con elementos de configuración
     */
    CONFIGURATION_ITEM = 'cmdb_ci'
}

/**
 * Tipo para validación de RequestTypes
 */
export type RequestTypeStrings = keyof typeof RequestType;

/**
 * Helper para trabajar con RequestTypes
 */
export class RequestTypeUtils {
    private static readonly TableEndpoints: Record<RequestType, string> = {
        [RequestType.INCIDENT]: '/api/now/v2/incident',
        [RequestType.CHANGE_REQUEST]: '/api/now/v2/change_request',
        [RequestType.SERVICE_CATALOG]: '/api/now/v2/sc_req_item',
        [RequestType.PROBLEM]: '/api/now/v2/problem',
        [RequestType.KNOWLEDGE_ARTICLE]: '/api/now/v2/kb_article',
        [RequestType.RELEASE_TASK]: '/api/now/v2/release_task',
        [RequestType.CONFIGURATION_ITEM]: '/api/now/v2/cmdb_ci'
    };

    /**
     * Obtiene el endpoint API para un tipo de petición
     */
    static getEndpoint(type: RequestType): string {
        return this.TableEndpoints[type];
    }

    /**
     * Valida si un string es un RequestType válido
     */
    static isValid(type: string): type is RequestType {
        return Object.values(RequestType).includes(type as RequestType);
    }

    // static getDefaultType(dto: CreateIncidenceDto): RequestType {
    //     // Lógica para derivar el tipo de petición basado en el DTO
    //     if (dto.severity === 'critical' || dto.urgency === 3) {
    //         return RequestType.INCIDENT;
    //     } else if (dto.type && this.isValid(dto.type)) {
    //         return dto.type as RequestType;
    //     } else {
    //         return RequestType.SERVICE_CATALOG; // Valor por defecto
    //     }
    // }

    /**
     * @summary Obtiene la equivalencia de severidad, impacto y urgencia para un tipo de petición
     * @param type Tipo de petición
     * @returns Objeto con severidad, impacto y urgencia
     * @description
     * Esta función devuelve un objeto con los valores de severidad, impacto y urgencia
     * equivalentes al tipo de petición proporcionado.
     * Los valores son:
     * - severety: 'critical', 'high', 'medium', 'low'
     * - impact: 1, 2, 3 (donde 1 es bajo, 2 es medio, 3 es alto)
     * - urgency: 1, 2, 3 (donde 1 es bajo, 2 es medio, 3 es alto)
     * @example
     * ```typescript
     * const equivalent = RequestTypeUtils.requestTypeEquivalent(RequestType.INCIDENT);
     * console.log(equivalent); // { severety: 'critical', impact: 3, urgency: 3 }
     * ```
     * @returns {Object} Objeto con las propiedades `severety`, `impact` y `urgency`
     * @throws {Error} Si el tipo de petición no es válido, devuelve valores por defecto
     * @description
     * Esta función es útil para mapear tipos de peticiones a sus correspondientes
     * valores de severidad, impacto y urgencia, facilitando la creación de tickets
     * con la información adecuada en ServiceNow.
     */
    static requestTypeEquivalent(type: RequestType) {
        const map = {
            [RequestType.INCIDENT]: { severity: 'critical', impact: 3, urgency: 3 },
            [RequestType.CHANGE_REQUEST]: { severity: 'medium', impact: 2, urgency: 2 },
            [RequestType.SERVICE_CATALOG]: { severity: 'low', impact: 1, urgency: 1 },
            [RequestType.PROBLEM]: { severity: 'high', impact: 2, urgency: 2 },
            [RequestType.KNOWLEDGE_ARTICLE]: { severity: 'low', impact: 1, urgency: 1 },
            [RequestType.RELEASE_TASK]: { severity: 'high', impact: 3, urgency: 2 },
            [RequestType.CONFIGURATION_ITEM]: { severity: 'medium', impact: 2, urgency: 2 }
        };

        return map[type] || { severity: 'medium', impact: 2, urgency: 2 };
    }

    static serverityToRequestType(severity: string): number {
        const map = {
            'critical': 3,
            'high': 3,
            'medium': 2,
            'low': 1
        }
        return map[severity.toLowerCase()] || 2;
    }

    static buildPayloadForServiceNow(incidence: any): Record<string, any> {
        const basePayload = {
            short_description: incidence.payload.short_description ?? incidence.description ?? '',
            description: incidence.payload.description ?? incidence.description ?? '',
            urgency: (incidence.payload.urgency ?? 2).toString(),
            impact: (incidence.payload.impact ?? 2).toString(),
            u_severity: incidence.payload.severity ?? 'medium',
            caller_id: incidence.payload.caller_id || incidence.source || "default_user",
            location: incidence.payload.location || undefined,
            expected_start: incidence.payload.expected_start || undefined,
        };

        const map = {
            [RequestType.INCIDENT]: {
                ...basePayload,
                category:         incidence.payload.category        || "email",
                assignment_group: incidence.payload.assignmentGroup || undefined,
                company:          incidence.payload.company         || undefined,
                contact_type: "phone"
            },
            [RequestType.CHANGE_REQUEST]: {
                ...basePayload,
                reason:           incidence.payload.reason          || "Solicitado desde Thruk",
                type:             "normal",
                risk:             "2",
                start_date:       incidence.payload.startDate       || new Date(Date.now() + 86_400_000).toISOString().slice(0, 16).replace('T', ' '),
                end_date:         incidence.payload.endDate         || new Date(Date.now() + 90_000_000).toISOString().slice(0, 16).replace('T', ' '),
                assignment_group: incidence.payload.assignmentGroup || undefined,
                company:          incidence.payload.company         || undefined,
                requested_by:     incidence.payload.requestedBy     || "thruk@example.com"
            },
            [RequestType.SERVICE_CATALOG]: {
                ...basePayload,
                assignment_group: incidence.payload.assignmentGroup || undefined,
                company:          incidence.payload.company         || undefined,
                requested_for:    incidence.payload.requested_for   || undefined,
                // Campos opcionales para fulfillment real de catálogo (sc_cat_item) — no siempre aplican.
                request:          incidence.payload.requestId       || undefined,
                cat_item:         incidence.payload.cat_item ?? incidence.payload.catalogItemId ?? undefined,
                variables:        incidence.payload.variables || {},
            },
            [RequestType.PROBLEM]: {
                ...basePayload,
                root_cause_analysis: incidence.payload.rootCause       || "No definido",
                priority:            incidence.priority.toString(),
                assignment_group:    incidence.payload.assignmentGroup || undefined,
                company:             incidence.payload.company         || undefined,
            },
            [RequestType.KNOWLEDGE_ARTICLE]: {
                short_description: incidence.description,
                text: incidence.payload.content,
                category: incidence.payload.category || "general",
                workflow_state: "published",
                kb_knowledge_base: incidence.payload.kbKnowledgeBase || "default_kb_sysid"
            },
            [RequestType.RELEASE_TASK]: {
                name: incidence.payload.name,
                description: incidence.payload.description,
                start_date: incidence.payload.startDate || new Date(Date.now() + 86_400_000).toISOString().slice(0, 16).replace('T', ' '),
                end_date: incidence.payload.endDate || new Date(Date.now() + 259_200_000).toISOString().slice(0, 16).replace('T', ' '),
                assigned_to: incidence.payload.assignedTo || "default_user",
                release: incidence.payload.releaseId || "REL0010001"
            },
            [RequestType.CONFIGURATION_ITEM]: {
                name: incidence.payload.name,
                ip_address: incidence.payload.ipAddress,
                manufacturer: incidence.payload.manufacturer,
                model_number: incidence.payload.model,
                operational_status: incidence.payload.operationalStatus || "1",
                install_status: incidence.payload.installStatus || "100",
                support_group: incidence.payload.supportGroup || "sys_user_group.default"
            }
        };

        return map[incidence.type] || basePayload;
    }
}