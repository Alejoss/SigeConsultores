-- Estructuras aditivas de Ciclos de Planificación.
-- No alteran procesos, tareas ni planificaciones existentes.
CREATE TABLE IF NOT EXISTS `planningCycleActivations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `targetYear` int NOT NULL,
  `deadline` date NULL,
  `status` enum('draft','active','closed','cancelled') NOT NULL DEFAULT 'draft',
  `createdByAccountId` int NULL,
  `activatedByAccountId` int NULL,
  `activatedAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `planningCycleActivations_company_year_unique` (`companyId`,`targetYear`)
);

CREATE TABLE IF NOT EXISTS `planningCycles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activationId` int NULL,
  `sourceCycleId` int NULL,
  `companyId` int NOT NULL,
  `processId` int NOT NULL,
  `cycleYear` int NOT NULL,
  `status` enum('not_started','in_review','ready','active','closed','skipped') NOT NULL DEFAULT 'not_started',
  `preparedByAccountId` int NULL,
  `preparedAt` timestamp NULL,
  `managerApprovalStatus` varchar(24) NOT NULL DEFAULT 'pending',
  `managerReviewedByAccountId` int NULL,
  `managerReviewedAt` timestamp NULL,
  `managerReviewNote` text NULL,
  `activatedAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `planningCycles_company_process_year_unique` (`companyId`,`processId`,`cycleYear`)
);

CREATE TABLE IF NOT EXISTS `planningCycleDecisions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `targetCycleId` int NOT NULL,
  `sourceCycleId` int NULL,
  `itemType` enum('ote','otg','stakeholder_action','compliance','participant_kpi') NOT NULL,
  `sourceItemKey` varchar(255) NOT NULL,
  `title` text NOT NULL,
  `description` text NULL,
  `completionPercent` decimal(7,2) NOT NULL DEFAULT '0.00',
  `sourcePayloadJson` longtext NOT NULL,
  `decision` enum('pending','migrate','close','review') NOT NULL DEFAULT 'pending',
  `decisionNote` text NULL,
  `decidedByAccountId` int NULL,
  `decidedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `planningCycleDecisions_cycle_item_unique` (`targetCycleId`,`itemType`,`sourceItemKey`)
);

CREATE TABLE IF NOT EXISTS `planningCycleSnapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cycleId` int NOT NULL,
  `itemType` enum('ote','otg','stakeholder_action','compliance','participant_kpi') NOT NULL,
  `sourceItemKey` varchar(255) NOT NULL,
  `title` text NOT NULL,
  `description` text NULL,
  `completionPercent` decimal(7,2) NOT NULL DEFAULT '0.00',
  `snapshotJson` longtext NOT NULL,
  `migrationDecision` enum('migrate','close','review') NOT NULL,
  `migratedToCycleId` int NULL,
  `closedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `planningCycleSnapshots_cycle_item_unique` (`cycleId`,`itemType`,`sourceItemKey`)
);

CREATE TABLE IF NOT EXISTS `planningCycleOperationalItems` (
  `id` int NOT NULL AUTO_INCREMENT,
  `targetCycleId` int NOT NULL,
  `sourceDecisionId` int NOT NULL,
  `itemType` enum('ote','otg','stakeholder_action','compliance','participant_kpi') NOT NULL,
  `title` text NOT NULL,
  `description` text NULL,
  `plannedDate` date NULL,
  `sourceCompletionPercent` decimal(7,2) NOT NULL DEFAULT '0.00',
  `sourcePayloadJson` longtext NOT NULL,
  `status` enum('active','review_required') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
