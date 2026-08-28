-- Alineación aditiva de Cumplimientos empresariales.
-- Estas columnas ya existen en el esquema de aplicación; se agregan de manera
-- idempotente cuando una restauración local histórica todavía no las contiene.
-- No modifica ni elimina ningún cumplimiento ni respaldo existente.

ALTER TABLE `companyCompliances`
  ADD COLUMN IF NOT EXISTS `evidencePdfUrl` VARCHAR(1024) NULL,
  ADD COLUMN IF NOT EXISTS `evidencePdfName` VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `evidencePdfKey` VARCHAR(512) NULL;
