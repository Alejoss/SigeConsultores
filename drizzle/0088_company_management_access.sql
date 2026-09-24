-- Coordinador de empresa: autorización reversible y exclusivamente aditiva.
-- No modifica roles existentes, procesos, empresas ni datos operativos.
CREATE TABLE IF NOT EXISTS `companyManagementAccess` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `accountId` int NOT NULL,
  `accessLevel` enum('standard','coordinator') NOT NULL DEFAULT 'standard',
  `grantedByAccountId` int NULL,
  `grantedAt` timestamp NULL,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_management_access_scope` (`companyId`,`accountId`),
  KEY `company_management_access_company_level_idx` (`companyId`,`accessLevel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conserva todos los eventos históricos y añade dos eventos de trazabilidad.
ALTER TABLE `accessAuditLog`
  MODIFY COLUMN `eventType` enum(
    'company_request_created','company_approved','company_rejected',
    'company_manager_password_set','company_manager_password_changed','company_manager_password_reset',
    'process_key_created','process_key_deactivated','process_key_modified',
    'process_leader_invited','process_leader_pin_set','process_leader_pin_changed',
    'process_leader_pin_reset_requested','process_leader_pin_reset','process_leader_deactivated',
    'process_leader_reactivated','process_leader_login_success','process_leader_login_failed',
    'company_manager_deactivated','company_manager_reactivated','company_access_invitation_created',
    'company_access_invitation_used','company_access_invitation_revoked','access_request_approved',
    'access_request_rejected','manager_invitation_created','manager_invitation_accepted',
    'manager_invitation_revoked','login_attempt','login_success','login_failed',
    'company_management_access_granted','company_management_access_revoked'
  ) NOT NULL;
