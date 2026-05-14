ALTER TABLE `stakeholderCriticalities` ADD `actionToTake` text;--> statement-breakpoint
ALTER TABLE `stakeholderCriticalities` ADD `startDate` date;--> statement-breakpoint
ALTER TABLE `stakeholderCriticalities` ADD `endDate` date;--> statement-breakpoint
ALTER TABLE `stakeholderCriticalities` ADD `completed` enum('SI','NO') DEFAULT 'NO' NOT NULL;