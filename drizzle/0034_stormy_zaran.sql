CREATE TABLE `userCompanyAccess` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`role` enum('manager','process_leader','viewer') NOT NULL DEFAULT 'manager',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userCompanyAccess_id` PRIMARY KEY(`id`)
);
