-- Compromisos vinculados entre fuentes empresariales y procesos.
-- Migración exclusivamente aditiva: no modifica ni elimina Sistemas de Gestión,
-- checklists, Programas, Cumplimientos, procesos, documentos ni evidencias existentes.

CREATE TABLE IF NOT EXISTS `linkedCommitments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `processId` INT NOT NULL,
  `sourceType` ENUM('checklist_action', 'checklist_vigency', 'program_action', 'company_compliance', 'own') NOT NULL,
  `sourceId` INT NULL,
  `sourceSubId` INT NULL,
  `kind` ENUM('action', 'vigency', 'own') NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `description` TEXT NULL,
  `dueDate` DATE NULL,
  `referenceResponsible` VARCHAR(255) NULL,
  `status` ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
  `completedAt` TIMESTAMP NULL,
  `renewedValidFrom` DATE NULL,
  `renewedValidUntil` DATE NULL,
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `linked_commitment_source_process_unique` (`companyId`, `processId`, `sourceType`, `sourceId`, `sourceSubId`),
  INDEX `linked_commitment_company_process_index` (`companyId`, `processId`),
  INDEX `linked_commitment_source_index` (`companyId`, `sourceType`, `sourceId`, `sourceSubId`),
  INDEX `linked_commitment_status_due_index` (`companyId`, `processId`, `status`, `dueDate`)
);

CREATE TABLE IF NOT EXISTS `linkedCommitmentEvidence` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `linkedCommitmentId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `fileKey` VARCHAR(1024) NOT NULL,
  `fileUrl` VARCHAR(1024) NOT NULL,
  `mimeType` VARCHAR(255) NOT NULL,
  `fileSizeBytes` INT NOT NULL DEFAULT 0,
  `uploadedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `linked_commitment_evidence_commitment_index` (`linkedCommitmentId`),
  INDEX `linked_commitment_evidence_company_index` (`companyId`)
);

-- Acciones detalladas para Programas. Los contadores actuales de Programas se
-- conservan, por lo que los programas existentes siguen funcionando sin cambios.
CREATE TABLE IF NOT EXISTS `programActions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `programId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `action` TEXT NOT NULL,
  `responsible` VARCHAR(255) NULL,
  `implementationDate` DATE NULL,
  `completed` TINYINT(1) NOT NULL DEFAULT 0,
  `completedAt` TIMESTAMP NULL,
  `orderIndex` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `program_action_program_index` (`programId`),
  INDEX `program_action_company_index` (`companyId`)
);
