-- Importación incremental de acciones de Programas.
-- Agrega una clave opcional para reconocer filas de Excel sin modificar las
-- acciones manuales, documentos ni contadores históricos existentes.

ALTER TABLE `programActions`
  ADD COLUMN IF NOT EXISTS `importKey` VARCHAR(512) NULL AFTER `companyId`;

CREATE UNIQUE INDEX `program_action_import_scope`
  ON `programActions` (`companyId`, `programId`, `importKey`);
