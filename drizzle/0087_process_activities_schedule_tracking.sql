-- Actividades del proceso: programación y seguimiento independientes.
-- Migración exclusivamente aditiva. Conserva todos los Cumplimientos históricos
-- y sólo añade campos para que puedan usarse como Actividades planificadas.

ALTER TABLE `processCompliances`
  ADD COLUMN `scheduleType` enum('once','weekly','monthly') NOT NULL DEFAULT 'once' AFTER `validUntil`,
  ADD COLUMN `scheduleStartDate` date NULL AFTER `scheduleType`,
  ADD COLUMN `scheduleEndDate` date NULL AFTER `scheduleStartDate`,
  ADD COLUMN `scheduleWeekday` tinyint NULL AFTER `scheduleEndDate`,
  ADD COLUMN `scheduleDayOfMonth` tinyint NULL AFTER `scheduleWeekday`,
  ADD COLUMN `trackingType` enum('puntual','mensual_sumatoria','mensual_promedio','mensual_checklist') NULL AFTER `scheduleDayOfMonth`,
  ADD COLUMN `trackingStartValue` decimal(12,2) NULL AFTER `trackingType`,
  ADD COLUMN `trackingTargetValue` decimal(12,2) NULL AFTER `trackingStartValue`,
  ADD COLUMN `trackingCurrentValue` decimal(12,2) NULL AFTER `trackingTargetValue`,
  ADD COLUMN `trackingUnit` varchar(100) NULL AFTER `trackingCurrentValue`,
  ADD COLUMN `monthlyTrackingValues` longtext NULL AFTER `trackingUnit`,
  ADD COLUMN `monthlyChecklistValues` longtext NULL AFTER `monthlyTrackingValues`,
  ADD COLUMN `completedOccurrenceDates` longtext NULL AFTER `monthlyChecklistValues`,
  ADD KEY `process_activities_schedule_idx` (`processId`, `scheduleType`, `dueDate`);

-- Compatibilidad: los registros existentes conservan su fecha puntual cuando ya
-- existía, sin cambiar su porcentaje ni estado de cumplimiento.
UPDATE `processCompliances`
SET `scheduleStartDate` = `dueDate`
WHERE `scheduleStartDate` IS NULL AND `dueDate` IS NOT NULL;
