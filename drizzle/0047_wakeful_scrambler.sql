ALTER TABLE `processOwnerInvitations` MODIFY COLUMN `accessCode` varchar(12) NOT NULL;--> statement-breakpoint
ALTER TABLE `processOwners` MODIFY COLUMN `accessCode` varchar(12) NOT NULL;