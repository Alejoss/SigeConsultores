CREATE TABLE `managerCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyManagerId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastPasswordChange` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `managerCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `managerCredentials_companyManagerId_unique` UNIQUE(`companyManagerId`),
	CONSTRAINT `managerCredentials_email_unique` UNIQUE(`email`)
);
