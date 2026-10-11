-- Importación de actas provenientes de asistentes de reuniones.
-- Migración exclusivamente aditiva: las reuniones manuales e históricas se
-- conservan y se identifican como manuales de forma predeterminada.

ALTER TABLE `processMeetings`
  ADD COLUMN `origin` enum('manual', 'assistant_import') NOT NULL DEFAULT 'manual' AFTER `meetingTypeId`,
  ADD COLUMN `assistantReportText` longtext NULL AFTER `minutesText`;
