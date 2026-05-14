ALTER TABLE `processResources` MODIFY COLUMN `resourceName` varchar(255);--> statement-breakpoint
ALTER TABLE `processResources` ADD `resourceType` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `processResources` ADD `description` text;