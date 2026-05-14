ALTER TABLE `stakeholderCriticalities` ADD `accionATomar` text;--> statement-breakpoint
ALTER TABLE `stakeholderCriticalities` ADD `fechaInicio` timestamp;--> statement-breakpoint
ALTER TABLE `stakeholderCriticalities` ADD `fechaFin` timestamp;--> statement-breakpoint
ALTER TABLE `stakeholderCriticalities` ADD `realizado` varchar(2) DEFAULT 'NO';