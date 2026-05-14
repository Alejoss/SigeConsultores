CREATE TABLE `companyManagers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyManagers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processOwnerInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`accessCode` varchar(4) NOT NULL,
	`invitationToken` varchar(255) NOT NULL,
	`status` enum('pending','accepted','expired') NOT NULL DEFAULT 'pending',
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processOwnerInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `processOwnerInvitations_invitationToken_unique` UNIQUE(`invitationToken`)
);
--> statement-breakpoint
CREATE TABLE `processOwners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processId` int NOT NULL,
	`userId` int NOT NULL,
	`accessCode` varchar(4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processOwners_id` PRIMARY KEY(`id`)
);
