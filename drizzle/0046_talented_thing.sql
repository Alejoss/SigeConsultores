CREATE TABLE `managerInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`managerEmail` varchar(320) NOT NULL,
	`invitationToken` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `managerInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `managerInvitations_invitationToken_unique` UNIQUE(`invitationToken`)
);
--> statement-breakpoint
ALTER TABLE `accessAuditLog` MODIFY COLUMN `eventType` enum('company_request_created','company_approved','company_rejected','company_manager_password_set','company_manager_password_changed','company_manager_password_reset','process_key_created','process_key_deactivated','process_key_modified','process_leader_invited','process_leader_pin_set','process_leader_pin_changed','process_leader_pin_reset_requested','process_leader_pin_reset','process_leader_deactivated','process_leader_reactivated','process_leader_login_success','process_leader_login_failed','company_manager_deactivated','company_manager_reactivated','company_access_invitation_created','company_access_invitation_used','company_access_invitation_revoked','access_request_approved','access_request_rejected','manager_invitation_created','manager_invitation_accepted','manager_invitation_revoked','login_attempt','login_success','login_failed') NOT NULL;