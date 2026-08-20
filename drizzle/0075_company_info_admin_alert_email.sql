-- Campo adicional para alertas del Gerente/Administrador.
-- Esta migración es aditiva y conserva íntegramente Propósito, Misión y Visión ya existentes.
ALTER TABLE `companyInfo`
  ADD COLUMN `adminAlertEmail` varchar(255) NULL AFTER `vision`;
