-- Retiro reversible de una inscripción de Capacitaciones en Línea.
-- Las filas existentes siguen activas (NULL); no se borra ni modifica historial,
-- certificados, cuentas administrativas, nómina ni inscripciones de otras empresas.
ALTER TABLE `courseWorkers`
  ADD COLUMN `retiredAt` timestamp NULL,
  ADD COLUMN `retiredByAccountId` int NULL;
