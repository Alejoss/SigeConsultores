-- Título opcional para ordenar e identificar reuniones importadas o manuales.
-- Migración aditiva: las reuniones históricas conservan su objetivo como título
-- visible cuando este campo está vacío.

ALTER TABLE `processMeetings`
  ADD COLUMN `title` varchar(500) NULL AFTER `origin`;
