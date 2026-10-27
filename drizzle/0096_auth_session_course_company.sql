-- Contexto temporal de empresa para abrir Capacitaciones en Línea.
-- Es aditivo: no cambia sesiones existentes, cuentas, roles ni datos operativos.
ALTER TABLE `auth_sessions`
  ADD COLUMN `courseCompanyId` int NULL AFTER `accountId`;
