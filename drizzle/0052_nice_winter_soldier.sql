CREATE TABLE `tacticalPlannings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`objectiveId` int NOT NULL,
	`category` varchar(100),
	`goal` int DEFAULT 0,
	`planningData` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tacticalPlannings_id` PRIMARY KEY(`id`)
);
