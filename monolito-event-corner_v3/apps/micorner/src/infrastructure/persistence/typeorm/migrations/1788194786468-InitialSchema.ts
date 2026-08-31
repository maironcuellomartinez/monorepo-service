import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1788194786468 implements MigrationInterface {
    name = 'InitialSchema1788194786468'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`servicenow_profiles\` (\`profile_id\` varchar(50) NOT NULL, \`name\` varchar(100) NOT NULL, \`snow_company_sys_id\` varchar(100) NOT NULL, \`snow_company_name\` varchar(100) NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_0a34919935dc682cf89049e709\` (\`name\`), UNIQUE INDEX \`IDX_a90d4acb5d3d779077783d0550\` (\`snow_company_sys_id\`), PRIMARY KEY (\`profile_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`issue_types\` (\`issue_type_id\` varchar(50) NOT NULL, \`tree_id\` varchar(50) NOT NULL, \`name\` varchar(100) NOT NULL, \`category\` varchar(30) NOT NULL, \`device_type\` varchar(50) NULL, \`servicenow_category\` varchar(100) NULL, \`servicenow_close_category\` varchar(100) NULL, \`sn_urgency\` int NOT NULL DEFAULT '2', \`sn_impact\` int NOT NULL DEFAULT '2', \`sn_severity\` varchar(20) NOT NULL DEFAULT 'medium', \`work_minutes\` int NOT NULL, \`spare_minutes\` int NOT NULL DEFAULT '0', \`close_minutes\` int NOT NULL DEFAULT '0', \`not_user_visible\` tinyint NOT NULL DEFAULT 0, \`position\` int NOT NULL DEFAULT '0', \`icon\` varchar(50) NULL, \`nps_disabled\` tinyint NOT NULL DEFAULT 0, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (\`issue_type_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`issue_type_trees\` (\`tree_id\` varchar(50) NOT NULL, \`name\` varchar(100) NOT NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_5aeed77703d3f321495386de1c\` (\`name\`), PRIMARY KEY (\`tree_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`users\` (\`customer_id\` varchar(50) NOT NULL, \`external_id\` varchar(100) NOT NULL, \`name\` varchar(100) NULL, \`last_name\` varchar(100) NULL, \`full_name\` varchar(200) NULL, \`email\` varchar(150) NULL, \`company_id\` varchar(50) NULL, \`domain\` varchar(100) NULL, \`upn\` varchar(200) NULL, \`device_tokens\` text NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_11fc776e0ca3573dc195670f63\` (\`external_id\`), UNIQUE INDEX \`IDX_1f1db41d4540eaf1fde5c8ee8d\` (\`upn\`), PRIMARY KEY (\`customer_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`companies\` (\`company_id\` varchar(50) NOT NULL, \`name\` varchar(100) NOT NULL, \`tree_id\` varchar(50) NULL, \`profile_id\` varchar(50) NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX \`idx_companies_tree_id\` (\`tree_id\`), UNIQUE INDEX \`IDX_3dacbb3eb4f095e29372ff8e13\` (\`name\`), PRIMARY KEY (\`company_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`technicians\` (\`technician_id\` varchar(50) NOT NULL, \`name\` varchar(100) NOT NULL, \`last_name\` varchar(100) NULL, \`full_name\` varchar(200) NULL, \`email\` varchar(150) NOT NULL, \`user_id\` varchar(50) NULL, \`corner_id\` varchar(50) NULL, \`disabled\` tinyint NOT NULL DEFAULT 0, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (\`technician_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`schedule_assignments\` (\`assignment_id\` varchar(36) NOT NULL, \`schedule_id\` varchar(50) NOT NULL, \`technician_id\` varchar(50) NOT NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (\`assignment_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`devices\` (\`device_id\` varchar(50) NOT NULL, \`serial_number\` varchar(100) NOT NULL, \`model\` varchar(100) NULL, \`brand\` varchar(100) NULL, \`device_type\` varchar(50) NULL, \`assigned_user_id\` varchar(100) NULL, \`assigned_user_name\` varchar(200) NULL, \`status\` enum ('SYNCED', 'STALE', 'NOT_FOUND', 'SYNC_ERROR', 'VIRTUAL', 'DISABLED') NOT NULL DEFAULT 'STALE', \`is_virtual\` tinyint NOT NULL DEFAULT 0, \`last_sync_at\` datetime NOT NULL DEFAULT '1970-01-01 00:00:00', \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX \`IDX_f77b99808ca44a4ae236e83eaa\` (\`last_sync_at\`), UNIQUE INDEX \`IDX_cc9e89897e336172fd06367735\` (\`serial_number\`), PRIMARY KEY (\`device_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`lockers\` (\`locker_id\` varchar(50) NOT NULL, \`corner_id\` varchar(50) NOT NULL, \`locker_code\` varchar(50) NOT NULL, \`status\` varchar(20) NOT NULL, \`description\` varchar(255) NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_5b854270932d7ae31f7030af3a\` (\`locker_code\`), PRIMARY KEY (\`locker_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`appointment_timeline\` (\`activity_id\` varchar(36) NOT NULL, \`appointment_id\` varchar(50) NOT NULL, \`technician_id\` varchar(50) NULL, \`action_type\` varchar(40) NOT NULL, \`from_status\` varchar(50) NULL, \`to_status\` varchar(50) NULL, \`worked_from\` timestamp NULL, \`worked_until\` timestamp NULL, \`comment\` varchar(500) NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (\`activity_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`servicenow_ticket_links\` (\`id\` varchar(36) NOT NULL, \`appointment_id\` varchar(50) NOT NULL, \`type\` varchar(20) NOT NULL, \`role\` varchar(20) NOT NULL, \`sys_id\` varchar(100) NULL, \`number\` varchar(50) NULL, \`parent_request_sys_id\` varchar(100) NULL, \`snowq_correlation_id\` varchar(64) NULL, \`status\` varchar(20) NOT NULL, \`closed_at\` timestamp NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX \`idx_snow_ticket_link_status\` (\`status\`), INDEX \`idx_snow_ticket_link_correlation\` (\`snowq_correlation_id\`), INDEX \`idx_snow_ticket_link_sys_id\` (\`sys_id\`), INDEX \`idx_snow_ticket_link_appointment\` (\`appointment_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`appointments\` (\`appointment_id\` varchar(50) NOT NULL, \`issue_id\` int UNSIGNED NOT NULL, \`kind\` varchar(20) NOT NULL, \`issue_type_id\` varchar(50) NOT NULL, \`customer_id\` varchar(50) NOT NULL, \`company_id\` varchar(50) NOT NULL, \`corner_id\` varchar(50) NOT NULL, \`device_id\` varchar(50) NULL, \`locker_id\` varchar(50) NULL, \`current_technician_id\` varchar(50) NULL, \`created_by_technician_id\` varchar(50) NULL, \`status\` varchar(50) NOT NULL, \`priority\` int NOT NULL, \`origin_channel\` varchar(30) NOT NULL, \`scheduled_start\` timestamp NOT NULL, \`scheduled_end\` timestamp NOT NULL, \`duration_minutes\` int NOT NULL, \`metadata\` json NULL, \`closed_at\` timestamp NULL, \`estimated_close_at\` timestamp NULL, \`comment\` text NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (\`appointment_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`appointment_slots\` (\`relation_id\` varchar(36) NOT NULL, \`appointment_id\` varchar(50) NOT NULL, \`slot_id\` varchar(50) NOT NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (\`relation_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`corner_slots\` (\`slot_id\` varchar(50) NOT NULL, \`corner_id\` varchar(50) NOT NULL, \`schedule_id\` varchar(50) NOT NULL, \`starts_at\` timestamp NOT NULL, \`ends_at\` timestamp NOT NULL, \`status\` varchar(20) NOT NULL, \`held_by_user_id\` varchar(50) NULL, \`held_until\` timestamp NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`uq_corner_slot_window\` (\`corner_id\`, \`starts_at\`, \`ends_at\`), INDEX \`idx_corner_starts_status_held\` (\`corner_id\`, \`starts_at\`, \`status\`, \`held_until\`), INDEX \`idx_corner_slot_corner_id\` (\`corner_id\`), PRIMARY KEY (\`slot_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`corner_schedules\` (\`schedule_id\` varchar(50) NOT NULL, \`corner_id\` varchar(50) NOT NULL, \`name\` varchar(100) NOT NULL, \`day_of_week\` varchar(3) NULL, \`start_time\` time NOT NULL, \`end_time\` time NOT NULL, \`valid_from\` date NOT NULL, \`valid_until\` date NOT NULL, \`slot_duration_minutes\` int NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (\`schedule_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`corners\` (\`corner_id\` varchar(50) NOT NULL, \`name\` varchar(100) NOT NULL, \`code\` varchar(50) NULL, \`client_name\` varchar(100) NULL, \`description\` varchar(255) NULL, \`servicenow_location\` varchar(100) NULL, \`snow_assignment_group\` varchar(150) NULL, \`latitude\` decimal(10,7) NULL, \`longitude\` decimal(10,7) NULL, \`timezone\` varchar(60) NOT NULL DEFAULT 'UTC', \`country\` varchar(2) NOT NULL DEFAULT 'AR', \`city\` varchar(100) NULL, \`only_technicians\` tinyint NOT NULL DEFAULT 0, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_75c0db9d713c8673dbb785400f\` (\`code\`), PRIMARY KEY (\`corner_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`outbox_events\` (\`event_id\` varchar(36) NOT NULL, \`event_type\` varchar(100) NOT NULL, \`aggregate_id\` varchar(50) NOT NULL, \`payload\` json NOT NULL, \`published_at\` timestamp NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`retry_count\` int NOT NULL DEFAULT '0', \`max_retries\` int NOT NULL DEFAULT '5', \`last_error\` text NULL, \`retry_after\` timestamp NULL, \`failed_at\` timestamp NULL, PRIMARY KEY (\`event_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`company_issue_configs\` (\`config_id\` varchar(50) NOT NULL, \`company_id\` varchar(50) NOT NULL, \`issue_type_id\` varchar(50) NOT NULL, \`servicenow_group\` varchar(150) NOT NULL, \`work_minutes_override\` int NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_a5963a175346eca7213c4846b8\` (\`company_id\`, \`issue_type_id\`), PRIMARY KEY (\`config_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`servicenow_groups\` (\`group_id\` varchar(50) NOT NULL, \`group_name\` varchar(150) NOT NULL, \`description\` varchar(255) NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_a94e2207d4ed33934b8d7f7541\` (\`group_name\`), PRIMARY KEY (\`group_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`incident_batch_draft_items\` (\`id\` varchar(50) NOT NULL, \`local_id\` varchar(50) NOT NULL, \`corner_id\` varchar(50) NOT NULL, \`corner_name\` varchar(100) NOT NULL, \`customer_id\` varchar(50) NOT NULL, \`customer_name\` varchar(200) NOT NULL, \`customer_email\` varchar(200) NOT NULL, \`device_serial\` varchar(100) NOT NULL, \`issue_type_id\` varchar(50) NOT NULL, \`issue_type_name\` varchar(200) NOT NULL, \`slot_ids\` json NOT NULL, \`start_time\` timestamp NOT NULL, \`end_time\` timestamp NOT NULL, \`description\` text NULL, \`notes\` text NULL, \`status\` varchar(20) NOT NULL DEFAULT 'pending', \`last_error\` text NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`draft_id\` varchar(50) NULL, INDEX \`idx_batch_draft_item_draft\` (\`draft_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`incident_batch_drafts\` (\`id\` varchar(50) NOT NULL, \`user_id\` varchar(50) NOT NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX \`idx_batch_draft_user\` (\`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`issue_types\` ADD CONSTRAINT \`FK_f6bd4d7f0890599c4f0e96e9548\` FOREIGN KEY (\`tree_id\`) REFERENCES \`issue_type_trees\`(\`tree_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD CONSTRAINT \`FK_7ae6334059289559722437bcc1c\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`company_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`companies\` ADD CONSTRAINT \`FK_254ae6fd0b4dc888bd08051360a\` FOREIGN KEY (\`tree_id\`) REFERENCES \`issue_type_trees\`(\`tree_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`companies\` ADD CONSTRAINT \`FK_9e1715d95eb53431a2e79bcf270\` FOREIGN KEY (\`profile_id\`) REFERENCES \`servicenow_profiles\`(\`profile_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`technicians\` ADD CONSTRAINT \`FK_ead11bf8ac28789afb2b59832f4\` FOREIGN KEY (\`corner_id\`) REFERENCES \`corners\`(\`corner_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`schedule_assignments\` ADD CONSTRAINT \`FK_5870c5e4c93700b0d50a6e5a900\` FOREIGN KEY (\`schedule_id\`) REFERENCES \`corner_schedules\`(\`schedule_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`schedule_assignments\` ADD CONSTRAINT \`FK_5932c31c033f286d219fd364d27\` FOREIGN KEY (\`technician_id\`) REFERENCES \`technicians\`(\`technician_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`lockers\` ADD CONSTRAINT \`FK_65119e74e7ae60d4a0a7ee15a43\` FOREIGN KEY (\`corner_id\`) REFERENCES \`corners\`(\`corner_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointment_timeline\` ADD CONSTRAINT \`FK_7e4cbd56e0ce7fd0e117a5c31a2\` FOREIGN KEY (\`appointment_id\`) REFERENCES \`appointments\`(\`appointment_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointment_timeline\` ADD CONSTRAINT \`FK_b6a26d3bae61734969b98e90bb4\` FOREIGN KEY (\`technician_id\`) REFERENCES \`technicians\`(\`technician_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`servicenow_ticket_links\` ADD CONSTRAINT \`FK_53073a55267a540dd8c7d997a46\` FOREIGN KEY (\`appointment_id\`) REFERENCES \`appointments\`(\`appointment_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_95ac92cb63e4b9ef5961ad316b6\` FOREIGN KEY (\`issue_type_id\`) REFERENCES \`issue_types\`(\`issue_type_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_2be3c78815aba227af1c3e8e413\` FOREIGN KEY (\`customer_id\`) REFERENCES \`users\`(\`customer_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_d0cd63e762f524a499e28903e3e\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`company_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_3b0996a7ea3b27454a443570d7b\` FOREIGN KEY (\`corner_id\`) REFERENCES \`corners\`(\`corner_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_be24ebae9af085f5cea47b2d483\` FOREIGN KEY (\`current_technician_id\`) REFERENCES \`technicians\`(\`technician_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_9dcf00e740d6364a6942cc1b6e2\` FOREIGN KEY (\`created_by_technician_id\`) REFERENCES \`technicians\`(\`technician_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_121983c059817e0538bb8e47a4b\` FOREIGN KEY (\`device_id\`) REFERENCES \`devices\`(\`device_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_30f28818efef9096087a3cef819\` FOREIGN KEY (\`locker_id\`) REFERENCES \`lockers\`(\`locker_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointment_slots\` ADD CONSTRAINT \`FK_7b3059d02e073ae381df0a6ccbc\` FOREIGN KEY (\`appointment_id\`) REFERENCES \`appointments\`(\`appointment_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`appointment_slots\` ADD CONSTRAINT \`FK_02f958c0187a2ca6dd7b96d3693\` FOREIGN KEY (\`slot_id\`) REFERENCES \`corner_slots\`(\`slot_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`corner_slots\` ADD CONSTRAINT \`FK_97312720c6860ad3ca3d55dfaf9\` FOREIGN KEY (\`corner_id\`) REFERENCES \`corners\`(\`corner_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`corner_slots\` ADD CONSTRAINT \`FK_1aadde8c78046cd28a5002e862b\` FOREIGN KEY (\`schedule_id\`) REFERENCES \`corner_schedules\`(\`schedule_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`corner_schedules\` ADD CONSTRAINT \`FK_890e3b1fd914d72c6c5d876b563\` FOREIGN KEY (\`corner_id\`) REFERENCES \`corners\`(\`corner_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`company_issue_configs\` ADD CONSTRAINT \`FK_ba813f0d0c864cb6bf113825645\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`company_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`company_issue_configs\` ADD CONSTRAINT \`FK_e8a8a8d611e4bb0fdd72ef2b32b\` FOREIGN KEY (\`issue_type_id\`) REFERENCES \`issue_types\`(\`issue_type_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`incident_batch_draft_items\` ADD CONSTRAINT \`FK_abfe8eef8c3826fa4945995c808\` FOREIGN KEY (\`draft_id\`) REFERENCES \`incident_batch_drafts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);

        // issue_sequences: contador atómico de issue_id incremental (usado por
        // AppointmentRepository, entity_name='appointment'). No es un @Entity()
        // de TypeORM (se maneja con SQL crudo), así que migration:generate no
        // lo detecta a partir de las entidades — se agrega a mano acá.
        await queryRunner.query(`
            CREATE TABLE issue_sequences (
              entity_name VARCHAR(20) NOT NULL PRIMARY KEY,
              next_value INT UNSIGNED NOT NULL DEFAULT 1
            ) ENGINE=InnoDB
        `);
        await queryRunner.query(
            `INSERT INTO issue_sequences (entity_name, next_value) VALUES ('appointment', 1)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`issue_sequences\``);
        await queryRunner.query(`ALTER TABLE \`incident_batch_draft_items\` DROP FOREIGN KEY \`FK_abfe8eef8c3826fa4945995c808\``);
        await queryRunner.query(`ALTER TABLE \`company_issue_configs\` DROP FOREIGN KEY \`FK_e8a8a8d611e4bb0fdd72ef2b32b\``);
        await queryRunner.query(`ALTER TABLE \`company_issue_configs\` DROP FOREIGN KEY \`FK_ba813f0d0c864cb6bf113825645\``);
        await queryRunner.query(`ALTER TABLE \`corner_schedules\` DROP FOREIGN KEY \`FK_890e3b1fd914d72c6c5d876b563\``);
        await queryRunner.query(`ALTER TABLE \`corner_slots\` DROP FOREIGN KEY \`FK_1aadde8c78046cd28a5002e862b\``);
        await queryRunner.query(`ALTER TABLE \`corner_slots\` DROP FOREIGN KEY \`FK_97312720c6860ad3ca3d55dfaf9\``);
        await queryRunner.query(`ALTER TABLE \`appointment_slots\` DROP FOREIGN KEY \`FK_02f958c0187a2ca6dd7b96d3693\``);
        await queryRunner.query(`ALTER TABLE \`appointment_slots\` DROP FOREIGN KEY \`FK_7b3059d02e073ae381df0a6ccbc\``);
        await queryRunner.query(`ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_30f28818efef9096087a3cef819\``);
        await queryRunner.query(`ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_121983c059817e0538bb8e47a4b\``);
        await queryRunner.query(`ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_9dcf00e740d6364a6942cc1b6e2\``);
        await queryRunner.query(`ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_be24ebae9af085f5cea47b2d483\``);
        await queryRunner.query(`ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_3b0996a7ea3b27454a443570d7b\``);
        await queryRunner.query(`ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_d0cd63e762f524a499e28903e3e\``);
        await queryRunner.query(`ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_2be3c78815aba227af1c3e8e413\``);
        await queryRunner.query(`ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_95ac92cb63e4b9ef5961ad316b6\``);
        await queryRunner.query(`ALTER TABLE \`servicenow_ticket_links\` DROP FOREIGN KEY \`FK_53073a55267a540dd8c7d997a46\``);
        await queryRunner.query(`ALTER TABLE \`appointment_timeline\` DROP FOREIGN KEY \`FK_b6a26d3bae61734969b98e90bb4\``);
        await queryRunner.query(`ALTER TABLE \`appointment_timeline\` DROP FOREIGN KEY \`FK_7e4cbd56e0ce7fd0e117a5c31a2\``);
        await queryRunner.query(`ALTER TABLE \`lockers\` DROP FOREIGN KEY \`FK_65119e74e7ae60d4a0a7ee15a43\``);
        await queryRunner.query(`ALTER TABLE \`schedule_assignments\` DROP FOREIGN KEY \`FK_5932c31c033f286d219fd364d27\``);
        await queryRunner.query(`ALTER TABLE \`schedule_assignments\` DROP FOREIGN KEY \`FK_5870c5e4c93700b0d50a6e5a900\``);
        await queryRunner.query(`ALTER TABLE \`technicians\` DROP FOREIGN KEY \`FK_ead11bf8ac28789afb2b59832f4\``);
        await queryRunner.query(`ALTER TABLE \`companies\` DROP FOREIGN KEY \`FK_9e1715d95eb53431a2e79bcf270\``);
        await queryRunner.query(`ALTER TABLE \`companies\` DROP FOREIGN KEY \`FK_254ae6fd0b4dc888bd08051360a\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_7ae6334059289559722437bcc1c\``);
        await queryRunner.query(`ALTER TABLE \`issue_types\` DROP FOREIGN KEY \`FK_f6bd4d7f0890599c4f0e96e9548\``);
        await queryRunner.query(`DROP INDEX \`idx_batch_draft_user\` ON \`incident_batch_drafts\``);
        await queryRunner.query(`DROP TABLE \`incident_batch_drafts\``);
        await queryRunner.query(`DROP INDEX \`idx_batch_draft_item_draft\` ON \`incident_batch_draft_items\``);
        await queryRunner.query(`DROP TABLE \`incident_batch_draft_items\``);
        await queryRunner.query(`DROP INDEX \`IDX_a94e2207d4ed33934b8d7f7541\` ON \`servicenow_groups\``);
        await queryRunner.query(`DROP TABLE \`servicenow_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_a5963a175346eca7213c4846b8\` ON \`company_issue_configs\``);
        await queryRunner.query(`DROP TABLE \`company_issue_configs\``);
        await queryRunner.query(`DROP TABLE \`outbox_events\``);
        await queryRunner.query(`DROP INDEX \`IDX_75c0db9d713c8673dbb785400f\` ON \`corners\``);
        await queryRunner.query(`DROP TABLE \`corners\``);
        await queryRunner.query(`DROP TABLE \`corner_schedules\``);
        await queryRunner.query(`DROP INDEX \`idx_corner_slot_corner_id\` ON \`corner_slots\``);
        await queryRunner.query(`DROP INDEX \`idx_corner_starts_status_held\` ON \`corner_slots\``);
        await queryRunner.query(`DROP INDEX \`uq_corner_slot_window\` ON \`corner_slots\``);
        await queryRunner.query(`DROP TABLE \`corner_slots\``);
        await queryRunner.query(`DROP TABLE \`appointment_slots\``);
        await queryRunner.query(`DROP TABLE \`appointments\``);
        await queryRunner.query(`DROP INDEX \`idx_snow_ticket_link_appointment\` ON \`servicenow_ticket_links\``);
        await queryRunner.query(`DROP INDEX \`idx_snow_ticket_link_sys_id\` ON \`servicenow_ticket_links\``);
        await queryRunner.query(`DROP INDEX \`idx_snow_ticket_link_correlation\` ON \`servicenow_ticket_links\``);
        await queryRunner.query(`DROP INDEX \`idx_snow_ticket_link_status\` ON \`servicenow_ticket_links\``);
        await queryRunner.query(`DROP TABLE \`servicenow_ticket_links\``);
        await queryRunner.query(`DROP TABLE \`appointment_timeline\``);
        await queryRunner.query(`DROP INDEX \`IDX_5b854270932d7ae31f7030af3a\` ON \`lockers\``);
        await queryRunner.query(`DROP TABLE \`lockers\``);
        await queryRunner.query(`DROP INDEX \`IDX_cc9e89897e336172fd06367735\` ON \`devices\``);
        await queryRunner.query(`DROP INDEX \`IDX_f77b99808ca44a4ae236e83eaa\` ON \`devices\``);
        await queryRunner.query(`DROP TABLE \`devices\``);
        await queryRunner.query(`DROP TABLE \`schedule_assignments\``);
        await queryRunner.query(`DROP TABLE \`technicians\``);
        await queryRunner.query(`DROP INDEX \`IDX_3dacbb3eb4f095e29372ff8e13\` ON \`companies\``);
        await queryRunner.query(`DROP INDEX \`idx_companies_tree_id\` ON \`companies\``);
        await queryRunner.query(`DROP TABLE \`companies\``);
        await queryRunner.query(`DROP INDEX \`IDX_1f1db41d4540eaf1fde5c8ee8d\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_11fc776e0ca3573dc195670f63\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_5aeed77703d3f321495386de1c\` ON \`issue_type_trees\``);
        await queryRunner.query(`DROP TABLE \`issue_type_trees\``);
        await queryRunner.query(`DROP TABLE \`issue_types\``);
        await queryRunner.query(`DROP INDEX \`IDX_a90d4acb5d3d779077783d0550\` ON \`servicenow_profiles\``);
        await queryRunner.query(`DROP INDEX \`IDX_0a34919935dc682cf89049e709\` ON \`servicenow_profiles\``);
        await queryRunner.query(`DROP TABLE \`servicenow_profiles\``);
    }

}
