CREATE TABLE `accessLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`linkToken` varchar(64) NOT NULL,
	`type` enum('manager','process_owner') NOT NULL,
	`companyId` int,
	`processId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `accessLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `accessLinks_linkToken_unique` UNIQUE(`linkToken`)
);
