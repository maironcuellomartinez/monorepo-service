-- =============================================================================
-- Migration 001: Initial schema updates for Event Corner v3
-- Date: 2026-03-12
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Users table: rename ldap_id → external_id, add domain + principal_name
-- -----------------------------------------------------------------------------
ALTER TABLE users
    CHANGE COLUMN ldap_id external_id VARCHAR(255) NULL COMMENT 'External identity provider ID (e.g. Azure AD object ID)',
    ADD COLUMN domain VARCHAR(100) NULL COMMENT 'AD/LDAP domain of the user' AFTER external_id,
    ADD COLUMN principal_name VARCHAR(255) NULL COMMENT 'User Principal Name (UPN), e.g. user@corp.com' AFTER domain;

-- Index on principal_name for fast lookups
CREATE INDEX idx_users_principal_name ON users (principal_name);

-- -----------------------------------------------------------------------------
-- 2. Outbox events table for the Outbox pattern
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_events (
    event_id      VARCHAR(36)  NOT NULL PRIMARY KEY COMMENT 'UUID — idempotency key',
    event_type    VARCHAR(100) NOT NULL              COMMENT 'e.g. INCIDENT_CREATED',
    aggregate_id  VARCHAR(50)  NOT NULL              COMMENT 'ID of the aggregate that raised the event',
    payload       JSON         NOT NULL              COMMENT 'Full DomainEvent serialised as JSON',
    published_at  TIMESTAMP    NULL                  COMMENT 'NULL = pending dispatch; set by OutboxWorker',
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_outbox_pending (published_at, created_at) COMMENT 'Efficient polling for unpublished events'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Outbox table — ensures at-least-once delivery of domain events';

-- -----------------------------------------------------------------------------
-- 3. Incidents: extend status ENUM with new lifecycle states
--    (adjust the full list to match IncidentStatus enum in code)
-- -----------------------------------------------------------------------------
ALTER TABLE incidents
    MODIFY COLUMN status ENUM(
        'CREATED',
        'DELIVERED',
        'IN_PROGRESS',
        'PENDING_THIRD_PARTY',
        'PENDING_USER',
        'PENDING_SPARE_PART',
        'PENDING_PICKUP',
        'PENDING_REPLACEMENT_DELIVERY',
        'CLOSED',
        'REOPENED',
        'VALIDATED',
        'CANCELED'
    ) NOT NULL DEFAULT 'CREATED';

-- -----------------------------------------------------------------------------
-- End of migration 001
-- =============================================================================
