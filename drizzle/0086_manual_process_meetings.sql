-- Reuniones manuales por proceso.
-- Migración exclusivamente aditiva: crea registros nuevos y amplía el tipo de
-- fuente de Compromisos vinculados sin eliminar ni modificar información previa.

ALTER TABLE `linkedCommitments`
  MODIFY COLUMN `sourceType` enum(
    'checklist_action',
    'checklist_vigency',
    'program_action',
    'company_compliance',
    'audit_finding',
    'inspection_finding',
    'meeting_agreement',
    'own'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS `meetingTypes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `processId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `isArchived` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `meeting_types_company_process_idx` (`companyId`, `processId`)
);

CREATE TABLE IF NOT EXISTS `processMeetings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `processId` int NOT NULL,
  `meetingTypeId` int NOT NULL,
  `meetingDate` date NOT NULL,
  `objective` text NOT NULL,
  `participants` text,
  `locationOrMedium` varchar(255),
  `notes` text,
  `minutesText` text,
  `status` enum('active', 'annulled') NOT NULL DEFAULT 'active',
  `annulledAt` timestamp NULL,
  `annulmentReason` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `process_meetings_company_process_idx` (`companyId`, `processId`),
  KEY `process_meetings_type_idx` (`meetingTypeId`)
);

CREATE TABLE IF NOT EXISTS `meetingAgreements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `processId` int NOT NULL,
  `meetingId` int NOT NULL,
  `description` text NOT NULL,
  `responsibleType` enum('same_process_employee', 'same_process_owner', 'other_process') NOT NULL,
  `responsibleName` varchar(255),
  `responsibleEmail` varchar(320),
  `targetProcessId` int,
  `dueDate` date,
  `status` enum('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  `completedAt` timestamp NULL,
  `notes` text,
  `communicationStatus` enum('not_requested', 'pending', 'sent', 'failed') NOT NULL DEFAULT 'not_requested',
  `communicationLastAttemptAt` timestamp NULL,
  `communicationError` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `meeting_agreements_meeting_idx` (`meetingId`),
  KEY `meeting_agreements_company_process_idx` (`companyId`, `processId`),
  KEY `meeting_agreements_target_process_idx` (`targetProcessId`)
);

CREATE TABLE IF NOT EXISTS `meetingFiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `meetingId` int NOT NULL,
  `companyId` int NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `fileKey` varchar(1024) NOT NULL,
  `fileUrl` varchar(1024) NOT NULL,
  `mimeType` varchar(255) NOT NULL,
  `fileSizeBytes` int NOT NULL DEFAULT 0,
  `uploadedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `meeting_files_meeting_idx` (`meetingId`),
  KEY `meeting_files_company_idx` (`companyId`)
);

CREATE TABLE IF NOT EXISTS `meetingAgreementEvidence` (
  `id` int NOT NULL AUTO_INCREMENT,
  `meetingAgreementId` int NOT NULL,
  `companyId` int NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `fileKey` varchar(1024) NOT NULL,
  `fileUrl` varchar(1024) NOT NULL,
  `mimeType` varchar(255) NOT NULL,
  `fileSizeBytes` int NOT NULL DEFAULT 0,
  `uploadedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `meeting_agreement_evidence_agreement_idx` (`meetingAgreementId`),
  KEY `meeting_agreement_evidence_company_idx` (`companyId`)
);
