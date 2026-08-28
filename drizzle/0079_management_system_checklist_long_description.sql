-- Permite conservar íntegramente cláusulas extensas de normas y checklists externos.
-- LONGTEXT amplía la capacidad de almacenamiento sin eliminar ni transformar registros existentes.
ALTER TABLE `managementSystemChecklistItems`
  MODIFY COLUMN `description` LONGTEXT NULL;
