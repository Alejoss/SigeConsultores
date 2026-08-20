ALTER TABLE `account_roles`
  ADD COLUMN `status` enum('active','suspended') NOT NULL DEFAULT 'active' AFTER `processId`,
  ADD COLUMN `suspendedAt` timestamp NULL AFTER `status`;
