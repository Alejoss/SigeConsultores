-- Control y liberación de salidas críticas por proceso.
-- Migración exclusivamente aditiva: no modifica Mapas de Subprocesos ni datos existentes.

CREATE TABLE `processOutputReleaseControls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processId` int NOT NULL,
  `sourceOutputKey` varchar(128) NOT NULL,
  `sourceSubprocessName` text NULL,
  `outputSnapshot` text NOT NULL,
  `deliverableSnapshot` text NOT NULL,
  `documentationSnapshot` text NULL,
  `acceptanceCriteria` text NULL,
  `verificationMethod` enum('revision_documental','muestreo','revision_datos','confirmacion_cliente','otra') NULL,
  `verificationDetail` text NULL,
  `frequency` enum('por_evento','diaria','semanal','mensual','trimestral','anual','otra') NOT NULL DEFAULT 'por_evento',
  `frequencyDetail` text NULL,
  `isActive` boolean NOT NULL DEFAULT false,
  `configuredByAccountId` int NULL,
  `revision` int NOT NULL DEFAULT 1,
  `archivedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `process_output_release_source_unique` UNIQUE (`processId`, `sourceOutputKey`)
);

CREATE TABLE `processOutputReleasePeriods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `controlId` int NOT NULL,
  `processId` int NOT NULL,
  `periodKey` varchar(100) NOT NULL,
  `scheduledDate` date NOT NULL,
  `status` enum('pending','released','exception') NOT NULL DEFAULT 'pending',
  `releasedAt` timestamp NULL,
  `releasedByAccountId` int NULL,
  `observations` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `process_output_release_control_period_unique` UNIQUE (`controlId`, `periodKey`),
  INDEX `process_output_release_period_lookup` (`processId`, `scheduledDate`, `status`)
);

CREATE TABLE `processOutputReleaseEvidence` (
  `id` int NOT NULL AUTO_INCREMENT,
  `periodId` int NOT NULL,
  `companyId` int NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `fileKey` varchar(1024) NOT NULL,
  `fileUrl` varchar(1024) NOT NULL,
  `mimeType` varchar(255) NOT NULL,
  `fileSizeBytes` int NOT NULL DEFAULT 0,
  `uploadedByAccountId` int NULL,
  `uploadedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `process_output_release_evidence_period` (`periodId`)
);
