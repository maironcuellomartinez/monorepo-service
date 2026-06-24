-- Script de inicialización de base de datos para Minerva App
-- Ejecutar en MySQL 8.0+

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS minerva_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE minerva_db;

-- Tabla de dispositivos (se crea automáticamente con TypeORM, pero este script es opcional)
-- La tabla se creará automáticamente al iniciar el servicio con SYNCHRONIZE_DATABASE=true

-- Para producción, usar migraciones en lugar de synchronize:
-- npm run typeorm:migration:generate
-- npm run typeorm:migration:run
