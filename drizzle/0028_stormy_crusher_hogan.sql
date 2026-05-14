CREATE TABLE `processLeaderCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`leaderEmail` varchar(320) NOT NULL,
	`leaderName` varchar(255) NOT NULL,
	`pinHash` varchar(255) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastPINChangeAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processLeaderCredentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processLeaderInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`companyId` int NOT NULL,
	`invitationToken` varchar(255) NOT NULL,
	`leaderEmail` varchar(320) NOT NULL,
	`leaderName` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processLeaderInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `processLeaderInvitations_invitationToken_unique` UNIQUE(`invitationToken`)
);
--> statement-breakpoint
CREATE TABLE `processLeaderPINResetTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processLeaderCredentialId` int NOT NULL,
	`resetToken` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processLeaderPINResetTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `processLeaderPINResetTokens_resetToken_unique` UNIQUE(`resetToken`)
);
