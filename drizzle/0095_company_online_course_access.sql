-- Autorización exclusiva de Capacitaciones en Línea para Jefes de Proceso.
-- Es estrictamente aditiva: no modifica procesos, roles ni datos operativos.
CREATE TABLE IF NOT EXISTS `companyOnlineCourseAccess` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `accountId` int NOT NULL,
  `accessLevel` enum('standard','online_course_manager') NOT NULL DEFAULT 'standard',
  `grantedByAccountId` int NULL,
  `grantedAt` timestamp NULL,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_online_course_access_scope` (`companyId`,`accountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bitácora propia de cursos: evita modificar la tabla de auditoría existente.
CREATE TABLE IF NOT EXISTS `companyOnlineCourseAccessAudit` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `accountId` int NOT NULL,
  `performedByAccountId` int NULL,
  `eventType` enum('granted','revoked') NOT NULL,
  `description` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `company_online_course_access_audit_company_idx` (`companyId`,`accountId`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
