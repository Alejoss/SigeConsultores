-- Hallazgos operativos para Auditorías, Inspecciones y Simulacros.
-- Migración aditiva: conserva los conteos y archivos existentes.

ALTER TABLE `linkedCommitments`
  MODIFY COLUMN `sourceType` ENUM(
    'checklist_action',
    'checklist_vigency',
    'program_action',
    'company_compliance',
    'audit_finding',
    'inspection_finding',
    'own'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS `operationalFindings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `sourceType` ENUM('audit', 'inspection') NOT NULL,
  `sourceId` INT NOT NULL,
  `classification` ENUM('major_nc', 'minor_nc', 'observation', 'improvement_opportunity') NOT NULL,
  `finding` TEXT NOT NULL,
  `closureTask` TEXT NOT NULL,
  `referenceResponsible` VARCHAR(255) NULL,
  `targetDate` DATE NULL,
  `completed` BOOLEAN NOT NULL DEFAULT FALSE,
  `completedAt` TIMESTAMP NULL,
  `orderIndex` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `operational_findings_source_idx` (`companyId`, `sourceType`, `sourceId`)
);

CREATE TABLE IF NOT EXISTS `operationalFindingBaselines` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `sourceType` ENUM('audit', 'inspection') NOT NULL,
  `sourceId` INT NOT NULL,
  `findingsMajorNC` INT NOT NULL DEFAULT 0,
  `findingsMinorNC` INT NOT NULL DEFAULT 0,
  `findingsObservations` INT NOT NULL DEFAULT 0,
  `findingsOM` INT NOT NULL DEFAULT 0,
  `closuresMajorNC` INT NOT NULL DEFAULT 0,
  `closuresMinorNC` INT NOT NULL DEFAULT 0,
  `closuresObservations` INT NOT NULL DEFAULT 0,
  `closuresOM` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `operational_finding_baseline_source_unique` (`companyId`, `sourceType`, `sourceId`)
);
