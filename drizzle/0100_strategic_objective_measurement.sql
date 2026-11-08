-- Medición real de Objetivos Estratégicos, separada de OE/OTE históricos.
-- Exclusivamente aditiva e idempotente: no transforma ni carga datos existentes.
CREATE TABLE IF NOT EXISTS `strategicObjectiveMeasurementConfigs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `objectiveId` int NOT NULL,
  `initialSituation` text NOT NULL,
  `expectedResult` text NOT NULL,
  `indicator` text NOT NULL,
  `weight` double NULL,
  `baseline` double NULL,
  `goal` double NULL,
  `unit` varchar(255) NOT NULL,
  `deadline` varchar(10) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `strategic_objective_measurement_config_objective_unique` UNIQUE (`objectiveId`),
  CONSTRAINT `soe_measurement_config_objective_fk` FOREIGN KEY (`objectiveId`)
    REFERENCES `strategicObjectives` (`id`) ON DELETE CASCADE,
  INDEX `strategic_objective_measurement_config_company_idx` (`companyId`)
);

CREATE TABLE IF NOT EXISTS `strategicObjectiveMeasurements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `objectiveId` int NOT NULL,
  `measurementDate` date NOT NULL,
  `value` double NOT NULL,
  `observation` text NOT NULL,
  `evidence` varchar(2000) NOT NULL,
  `percent` double NOT NULL,
  `definitionSnapshot` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `strategic_objective_measurement_objective_date_unique` UNIQUE (`objectiveId`, `measurementDate`),
  CONSTRAINT `soe_measurement_objective_fk` FOREIGN KEY (`objectiveId`)
    REFERENCES `strategicObjectives` (`id`) ON DELETE CASCADE,
  INDEX `strategic_objective_measurement_company_idx` (`companyId`)
);
