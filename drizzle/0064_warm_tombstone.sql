ALTER TABLE `processResources` ADD `participantId` int;--> statement-breakpoint
ALTER TABLE `processResources` ADD `resourceName` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `processResources` ADD `resourceElements` text;--> statement-breakpoint
ALTER TABLE `processResources` DROP COLUMN `resourceType`;--> statement-breakpoint
ALTER TABLE `processResources` DROP COLUMN `description`;