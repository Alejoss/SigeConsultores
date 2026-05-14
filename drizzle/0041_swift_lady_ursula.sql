CREATE TABLE `companyCustomizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`hideGoldenCircleGuides` boolean NOT NULL DEFAULT false,
	`goldenCircleExplanation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyCustomizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `companyCustomizations_companyId_unique` UNIQUE(`companyId`)
);
--> statement-breakpoint
ALTER TABLE `companyInfo` DROP COLUMN `hideGoldenCircleGuides`;--> statement-breakpoint
ALTER TABLE `companyInfo` DROP COLUMN `goldenCircleExplanation`;