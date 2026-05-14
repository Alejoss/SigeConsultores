ALTER TABLE `companies` ADD `status` enum('En Proceso','Activa','Desactivada') DEFAULT 'En Proceso' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `cancelledAt` timestamp;