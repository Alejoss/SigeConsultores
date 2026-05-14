CREATE TABLE `companyManagerCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`managerEmail` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastPasswordChangeAt` timestamp,
	`lastLoginAt` timestamp,
	CONSTRAINT `companyManagerCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `companyManagerCredentials_companyId_unique` UNIQUE(`companyId`)
);
--> statement-breakpoint
CREATE TABLE `companySetupInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyAccessRequestId` int NOT NULL,
	`invitationToken` varchar(255) NOT NULL,
	`managerEmail` varchar(320) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companySetupInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `companySetupInvitations_invitationToken_unique` UNIQUE(`invitationToken`)
);
--> statement-breakpoint
CREATE TABLE `passwordResetTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`token` varchar(255) NOT NULL,
	`tokenType` enum('password_reset','password_change','initial_setup') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passwordResetTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `passwordResetTokens_token_unique` UNIQUE(`token`)
);
