-- Borrado seguro de Capacitaciones en Línea.
-- El contenido con actividad o certificados se archiva para preservar el historial.
ALTER TABLE `courseFields` ADD COLUMN `archivedAt` timestamp NULL;
ALTER TABLE `courseModules` ADD COLUMN `archivedAt` timestamp NULL;
ALTER TABLE `courseLessons` ADD COLUMN `archivedAt` timestamp NULL;
