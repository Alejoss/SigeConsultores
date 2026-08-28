-- Checklist operativo de Sistemas de Gestión.
-- Migración aditiva: no modifica ni elimina sistemas de gestión ni archivos de respaldo existentes.

CREATE TABLE IF NOT EXISTS `managementSystemChecklistItems` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `managementSystemId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `importKey` VARCHAR(255) NOT NULL,
  `standardCode` VARCHAR(120) NULL,
  `standardName` VARCHAR(500) NOT NULL,
  `description` TEXT NULL,
  `verificationMode` ENUM('vigencia', 'planificacion', 'ambas') NOT NULL DEFAULT 'planificacion',
  `applicable` TINYINT(1) NOT NULL DEFAULT 1,
  `notApplicableReason` TEXT NULL,
  `validFrom` DATE NULL,
  `validUntil` DATE NULL,
  `responsible` VARCHAR(255) NULL,
  `orderIndex` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `management_checklist_system_index` (`managementSystemId`),
  INDEX `management_checklist_company_index` (`companyId`),
  INDEX `management_checklist_import_key_index` (`managementSystemId`, `importKey`)
);

CREATE TABLE IF NOT EXISTS `managementSystemChecklistActions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `checklistItemId` INT NOT NULL,
  `action` TEXT NOT NULL,
  `responsible` VARCHAR(255) NULL,
  `implementationDate` DATE NULL,
  `completed` TINYINT(1) NOT NULL DEFAULT 0,
  `completedAt` TIMESTAMP NULL,
  `orderIndex` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `management_checklist_action_item_index` (`checklistItemId`)
);
