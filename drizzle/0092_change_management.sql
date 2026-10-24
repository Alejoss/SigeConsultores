-- Gestión de Cambios: esquema exclusivamente aditivo.
-- No reemplaza ni modifica expedientes, procesos, compromisos o datos previos.

CREATE TABLE IF NOT EXISTS `changeManagementRecords` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `title` varchar(500) NOT NULL,
  `description` text NULL,
  `reason` text NULL,
  `objective` text NULL,
  `expectedResult` text NULL,
  `origin` enum('strategy','audit','risk_opportunity','legal_requirement','client','technology','internal_improvement','other') NOT NULL DEFAULT 'internal_improvement',
  `originDetail` text NULL,
  `impactLevel` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `status` enum('draft','under_evaluation','approved','in_execution','implemented_pending_verification','closed','cancelled') NOT NULL DEFAULT 'draft',
  `responsibleAccountId` int NULL,
  `responsibleName` varchar(255) NULL,
  `responsibleEmail` varchar(320) NULL,
  `proposedByAccountId` int NULL,
  `proposedByName` varchar(255) NULL,
  `plannedStartDate` date NULL,
  `targetCompletionDate` date NULL,
  `decisionNotes` text NULL,
  `approvedAt` timestamp NULL,
  `approvedByName` varchar(255) NULL,
  `verificationResult` enum('pending','effective','partially_effective','not_effective') NOT NULL DEFAULT 'pending',
  `verificationNotes` text NULL,
  `verificationDate` date NULL,
  `closureRequestedAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `closedByName` varchar(255) NULL,
  `cancellationReason` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `change_management_company_status_idx` (`companyId`,`status`),
  KEY `change_management_responsible_idx` (`companyId`,`responsibleAccountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `changeManagementScopeLinks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `changeId` int NOT NULL,
  `companyId` int NOT NULL,
  `linkType` enum('strategic_objective','process','subprocess','stakeholder','risk_opportunity','indicator','custom_measure') NOT NULL,
  `referenceId` int NULL,
  `processId` int NULL,
  `titleSnapshot` text NOT NULL,
  `descriptionSnapshot` text NULL,
  `snapshotJson` longtext NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `change_management_scope_change_idx` (`changeId`),
  KEY `change_management_scope_company_type_idx` (`companyId`,`linkType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `changeManagementImpacts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `changeId` int NOT NULL,
  `category` enum('quality','environment','occupational_health_safety','legal_compliance','resources_infrastructure','technology','competence_training','information_documentation','risks_opportunities','management_systems','basc_control_security','other') NOT NULL,
  `impactLevel` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `notes` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `change_management_impact_unique` (`changeId`,`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `changeManagementActions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `changeId` int NOT NULL,
  `companyId` int NOT NULL,
  `action` text NOT NULL,
  `responsibleProcessId` int NULL,
  `responsibleName` varchar(255) NULL,
  `responsibleEmail` varchar(320) NULL,
  `resourceRequired` text NULL,
  `plannedDate` date NULL,
  `trainingRequired` text NULL,
  `documentToUpdate` text NULL,
  `evidenceExpected` text NULL,
  `status` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `progressNotes` text NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `change_management_action_change_idx` (`changeId`),
  KEY `change_management_action_process_idx` (`companyId`,`responsibleProcessId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `changeManagementIndicators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `changeId` int NOT NULL,
  `companyId` int NOT NULL,
  `processId` int NULL,
  `indicatorId` int NULL,
  `name` varchar(255) NOT NULL,
  `unit` varchar(100) NULL,
  `baselineValue` varchar(100) NULL,
  `targetValue` varchar(100) NULL,
  `achievedValue` varchar(100) NULL,
  `measurementDate` date NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `change_management_indicator_change_idx` (`changeId`),
  KEY `change_management_indicator_company_idx` (`companyId`,`processId`,`indicatorId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `changeManagementEvents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `changeId` int NOT NULL,
  `companyId` int NOT NULL,
  `eventType` enum('created','updated','status','scope','impact','action','indicator','closure') NOT NULL,
  `detail` text NOT NULL,
  `actorAccountId` int NULL,
  `actorName` varchar(255) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `change_management_event_change_idx` (`changeId`,`createdAt`),
  KEY `change_management_event_company_idx` (`companyId`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `changeManagementSuggestions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `processId` int NULL,
  `suggestedByAccountId` int NULL,
  `suggestedByName` varchar(255) NULL,
  `title` varchar(500) NOT NULL,
  `rationale` text NOT NULL,
  `status` enum('pending','accepted','dismissed') NOT NULL DEFAULT 'pending',
  `reviewNotes` text NULL,
  `changeId` int NULL,
  `reviewedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `change_management_suggestion_company_status_idx` (`companyId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extensión compatible del mecanismo existente de compromisos vinculados.
-- Conserva todos los valores previos y permite que las acciones de cambio se
-- reflejen y se cierren desde el proceso responsable.
ALTER TABLE `linkedCommitments`
  MODIFY COLUMN `sourceType` enum(
    'checklist_action','checklist_vigency','program_action','company_compliance',
    'audit_finding','inspection_finding','meeting_agreement','change_action','own'
  ) NOT NULL;
