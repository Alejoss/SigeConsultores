-- Preserva una fotografía única de los conteos históricos cuando un Programa
-- adopta el seguimiento detallado por acciones. No modifica filas existentes.
CREATE TABLE IF NOT EXISTS `programActionBaselines` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `programId` INT NOT NULL,
  `legacyPlannedActions` INT NOT NULL DEFAULT 0,
  `legacyCompletedActions` INT NOT NULL DEFAULT 0,
  `capturedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `program_action_baseline_scope` (`companyId`, `programId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
