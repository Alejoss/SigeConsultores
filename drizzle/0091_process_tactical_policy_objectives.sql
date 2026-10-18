-- OTE: vínculo explícito con Objetivos de la Política.
-- Migración exclusivamente aditiva: mantiene los OTE históricos, incluyendo
-- el campo subprocess y todos los datos de planificación existentes.
ALTER TABLE `processTacticalObjectives`
  ADD COLUMN `policyObjectiveId` int NULL AFTER `subprocess`,
  ADD COLUMN `policyObjective` text NULL AFTER `policyObjectiveId`,
  ADD COLUMN `policyObjectiveDescription` text NULL AFTER `policyObjective`;

CREATE INDEX `process_tactical_policy_objective_idx`
  ON `processTacticalObjectives` (`policyObjectiveId`);
