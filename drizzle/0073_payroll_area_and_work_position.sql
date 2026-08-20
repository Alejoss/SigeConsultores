-- Área de Nómina asociada a cada proceso caracterizado.
ALTER TABLE `processCharacterizations`
  ADD COLUMN `payrollArea` varchar(255) NULL AFTER `resources`;

-- Puesto funcional activo del trabajador, distinto de su cargo contractual de RR.HH.
ALTER TABLE `payrollEmployees`
  ADD COLUMN `currentProcessParticipantId` int NULL AFTER `position`;

-- Adopta de forma conservadora los vínculos históricos no ambiguos.
-- Si un trabajador tiene más de un vínculo previo, se conserva todo su historial
-- y el puesto actual queda vacío hasta que el Jefe lo asigne explícitamente.
UPDATE `payrollEmployees` AS employee
INNER JOIN (
  SELECT `payrollEmployeeId`, MAX(`processParticipantId`) AS `processParticipantId`
  FROM `participantWorkerAssignments`
  GROUP BY `payrollEmployeeId`
  HAVING COUNT(*) = 1
) AS only_assignment
  ON only_assignment.`payrollEmployeeId` = employee.`id`
SET employee.`currentProcessParticipantId` = only_assignment.`processParticipantId`
WHERE employee.`currentProcessParticipantId` IS NULL;
