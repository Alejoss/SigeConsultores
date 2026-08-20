-- Campo de correo del responsable de proceso.
-- Migración aditiva: no modifica ni elimina caracterizaciones existentes.
ALTER TABLE `processCharacterizations`
  ADD COLUMN `responsibleEmail` varchar(255) NULL AFTER `responsible`;
