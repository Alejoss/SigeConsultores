-- Gestión de Cambios: asignación de seguimiento por proceso.
-- Es aditiva y conserva intactos todos los expedientes ya registrados.

ALTER TABLE `changeManagementRecords`
  ADD COLUMN `responsibleProcessId` int NULL AFTER `responsibleAccountId`,
  ADD KEY `change_management_responsible_process_idx` (`companyId`, `responsibleProcessId`);
