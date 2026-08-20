-- Conserva el avance mensual de cada Objetivo Estratégico dentro de un snapshot de empresa.
-- Es aditiva: no modifica ni elimina los porcentajes históricos existentes.
ALTER TABLE `companyTrends`
  ADD COLUMN `oePercentsJson` text NULL AFTER `stakeholderMeta`;

ALTER TABLE `companyTrends`
  ADD UNIQUE KEY `company_trends_company_year_month` (`companyId`, `year`, `month`);
