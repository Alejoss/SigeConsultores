ALTER TABLE `passwordResetTokens` MODIFY COLUMN `companyId` int;--> statement-breakpoint
ALTER TABLE `passwordResetTokens` ADD `email` varchar(320);--> statement-breakpoint
ALTER TABLE `passwordResetTokens` ADD `otp` varchar(6);--> statement-breakpoint
ALTER TABLE `passwordResetTokens` ADD `isVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `passwordResetTokens` ADD `attempts` int DEFAULT 0 NOT NULL;