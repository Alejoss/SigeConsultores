CREATE TABLE `companyFODASelections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processId` int NOT NULL,
	`type` enum('Fortaleza','Oportunidad','Debilidad','Amenaza') NOT NULL,
	`originalText` text NOT NULL,
	`isSelected` boolean NOT NULL DEFAULT false,
	`companyFODAId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyFODASelections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companyFODAs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`type` enum('Fortaleza','Oportunidad','Debilidad','Amenaza') NOT NULL,
	`description` text NOT NULL,
	`processId` int,
	`isCustom` boolean NOT NULL DEFAULT false,
	`editedAt` timestamp,
	`editedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyFODAs_id` PRIMARY KEY(`id`)
);
