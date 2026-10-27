-- Trazabilidad de Objetivos de la Política: excepciones auditables por proceso.
-- Es estrictamente aditiva; no modifica ni elimina FODA, OTG, OTE o datos históricos.
CREATE TABLE `policyObjectiveProcessApplicability` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `policyObjectiveId` int NOT NULL,
  `processId` int NOT NULL,
  `status` enum('not_applicable') NOT NULL,
  `justification` text NOT NULL,
  `confirmedByName` varchar(255) DEFAULT NULL,
  `confirmedByEmail` varchar(320) DEFAULT NULL,
  `confirmedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `policy_objective_process_applicability_unique` (`policyObjectiveId`, `processId`),
  KEY `policy_objective_process_applicability_company_idx` (`companyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
