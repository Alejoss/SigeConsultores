-- Selección opcional de áreas de Nómina para Participantes.
-- NULL conserva la configuración histórica de payrollArea sin reescribir datos existentes.
ALTER TABLE `processCharacterizations`
  ADD COLUMN `payrollAreaSelection` TEXT NULL AFTER `payrollArea`;
