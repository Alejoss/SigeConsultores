CREATE TABLE `accessAuditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` enum('company_request_created','company_approved','company_rejected','process_key_created','process_key_deactivated','process_key_modified','login_attempt','login_success','login_failed') NOT NULL,
	`companyId` int,
	`userId` int,
	`processAccessKeyId` int,
	`description` text,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accessAuditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companyAccessRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`rucOrCI` varchar(50) NOT NULL,
	`contactName` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approvedBy` int,
	`approvalDate` timestamp,
	`rejectionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyAccessRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processAccessKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processId` int NOT NULL,
	`managerName` varchar(255) NOT NULL,
	`managerEmail` varchar(320) NOT NULL,
	`accessKey` varchar(4) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deactivatedAt` timestamp,
	`deactivatedBy` int,
	CONSTRAINT `processAccessKeys_id` PRIMARY KEY(`id`)
);
