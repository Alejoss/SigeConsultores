CREATE TABLE `accessAuditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` enum('company_request_created','company_approved','company_rejected','company_manager_password_set','company_manager_password_changed','company_manager_password_reset','process_key_created','process_key_deactivated','process_key_modified','process_leader_invited','process_leader_pin_set','process_leader_pin_changed','process_leader_pin_reset_requested','process_leader_pin_reset','process_leader_deactivated','process_leader_reactivated','process_leader_login_success','process_leader_login_failed','company_manager_deactivated','company_manager_reactivated','company_access_invitation_created','company_access_invitation_used','company_access_invitation_revoked','access_request_approved','access_request_rejected','manager_invitation_created','manager_invitation_accepted','manager_invitation_revoked','login_attempt','login_success','login_failed') NOT NULL,
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
CREATE TABLE `accessInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invitationToken` varchar(255) NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`contactEmail` varchar(320) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`usedByRequestId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accessInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `accessInvitations_invitationToken_unique` UNIQUE(`invitationToken`)
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ownerUserId` int NOT NULL,
	`status` enum('En Proceso','Activa','Desactivada') NOT NULL DEFAULT 'En Proceso',
	`companyPassword` varchar(255),
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
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
CREATE TABLE `companyInfo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`proposito` text,
	`mision` text,
	`vision` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyInfo_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `companyManagers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyManagers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companyModuleCustomization` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`moduleName` varchar(100) NOT NULL,
	`label1` varchar(255),
	`label2` varchar(255),
	`label3` varchar(255),
	`label4` varchar(255),
	`label5` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyModuleCustomization_id` PRIMARY KEY(`id`)
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
CREATE TABLE `companyValues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companyValues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `compliances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`obligationName` varchar(255) NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`planned` boolean DEFAULT false,
	`completed` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `compliances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `criticalityMatrix` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`stakeholderId` int NOT NULL,
	`incidence` enum('1','2','3') NOT NULL,
	`risk` enum('A','B','C') NOT NULL,
	`criticality` varchar(10) NOT NULL,
	`existingDefenses` text,
	`actionToTake` text,
	`observations` text,
	`startDate` date,
	`endDate` date,
	`implementationStatus` boolean DEFAULT false,
	`completionPercentage` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `criticalityMatrix_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`documentName` varchar(255) NOT NULL,
	`documentType` enum('Politica','Programa','Procedimiento','Varios') NOT NULL,
	`status` enum('Obsoleto','Vigente','Registro') NOT NULL,
	`fileUrl` text,
	`fileKey` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fodaAnalysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`subprocessId` int,
	`policyObjectiveId` int,
	`strengths` text,
	`opportunities` text,
	`weaknesses` text,
	`threats` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fodaAnalysis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `indicators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processId` int,
	`indicatorType` enum('strategicObjectives','tacticalObjectives','matrices','compliances','trainings') NOT NULL,
	`value` decimal(5,2) NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indicators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `managerCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyManagerId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastPasswordChange` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `managerCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `managerCredentials_companyManagerId_unique` UNIQUE(`companyManagerId`),
	CONSTRAINT `managerCredentials_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
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
CREATE TABLE `operationalObjectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tacticalObjectiveId` int NOT NULL,
	`objective` text NOT NULL,
	`subAreaIndex` varchar(10) NOT NULL,
	`month` int NOT NULL,
	`plannedCompletion` int DEFAULT 0,
	`actualCompletion` int DEFAULT 0,
	`completionPercentage` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operationalObjectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `passwordResetTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`email` varchar(320),
	`token` varchar(255) NOT NULL,
	`otp` varchar(6),
	`tokenType` enum('password_reset','password_change','initial_setup') NOT NULL,
	`isVerified` boolean NOT NULL DEFAULT false,
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passwordResetTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `passwordResetTokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`versionNo` varchar(50) NOT NULL,
	`versionDate` date,
	`policyText` text NOT NULL,
	`generalManagerName` varchar(255),
	`generalManagerCI` varchar(50),
	`electronicSignature` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policyObjectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policyId` int NOT NULL,
	`objective` text NOT NULL,
	`description` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policyObjectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `procedureRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`procedureId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(50) NOT NULL,
	`version` varchar(20) NOT NULL,
	`date` varchar(10),
	`fileUrl` varchar(500),
	`fileKey` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procedureRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `procedures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`objective` text,
	`code` varchar(50) NOT NULL,
	`version` varchar(20) NOT NULL,
	`createdDate` varchar(10),
	`lastVersion` varchar(20),
	`procedureFileUrl` varchar(500),
	`procedureFileKey` varchar(500),
	`flowchartFileUrl` varchar(500),
	`flowchartFileKey` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procedures_id` PRIMARY KEY(`id`)
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
--> statement-breakpoint
CREATE TABLE `processCharacterizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`macroProcess` varchar(255),
	`responsible` varchar(255),
	`participants` text,
	`objective` text,
	`scope` text,
	`resources` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processCharacterizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processCompliances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`tacticalObjectiveId` int,
	`requirement` varchar(255) NOT NULL,
	`regulation` varchar(255),
	`obligationType` enum('Legal','Reglamentaria','Concesion','Sistema de Gestion','Otros') NOT NULL,
	`otherObligationType` varchar(255),
	`status` enum('Planificado','En Progreso','Completado') NOT NULL DEFAULT 'Planificado',
	`dueDate` date,
	`responsible` varchar(255),
	`evidence` text,
	`completed` enum('SI','NO') NOT NULL DEFAULT 'NO',
	`observations` text,
	`completionPercentage` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processCompliances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processFODA` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`strengths` text,
	`opportunities` text,
	`weaknesses` text,
	`threats` text,
	`matrixData` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processFODA_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processIndicators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`tacticalObjectiveId` int,
	`name` varchar(255) NOT NULL,
	`formula` text,
	`unit` varchar(100),
	`target` varchar(100),
	`currentValue` varchar(100),
	`frequency` varchar(100),
	`responsible` varchar(255),
	`performance` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processIndicators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `processOwnerInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`accessCode` varchar(12),
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
	`accessCode` varchar(12) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processOwners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processParticipants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processCharacterizationId` int NOT NULL,
	`position` varchar(255) NOT NULL,
	`objective` text,
	`responsibility` text,
	`authority` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processParticipants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processResources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processCharacterizationId` int NOT NULL,
	`participant` varchar(255),
	`resourceType` varchar(255) NOT NULL,
	`description` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processResources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processRiskMatrices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`description` text NOT NULL,
	`probability` int,
	`impact` int,
	`riskLevel` int,
	`mitigation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processRiskMatrices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processScheduleActivities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`tacticalObjectiveId` int,
	`name` varchar(255) NOT NULL,
	`type` varchar(100),
	`status` enum('Planificado','En Progreso','Completado') NOT NULL DEFAULT 'Planificado',
	`startDate` date,
	`endDate` date,
	`responsible` varchar(255),
	`priority` enum('Baja','Media','Alta') NOT NULL DEFAULT 'Media',
	`progress` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processScheduleActivities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processTacticalObjectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`target` varchar(255),
	`responsible` varchar(255),
	`deadline` date,
	`subprocess` varchar(255),
	`strategicObjective` varchar(255),
	`strategicObjectiveDescription` text,
	`completed` enum('SI','NO') NOT NULL DEFAULT 'NO',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processTacticalObjectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processTrainings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`objective` text,
	`type` enum('Mandatoria','Reglamentaria','Sugerida') NOT NULL DEFAULT 'Mandatoria',
	`audience` varchar(255),
	`plannedAttendees` int DEFAULT 0,
	`modality` enum('Presencial','Online','Externa') NOT NULL DEFAULT 'Presencial',
	`plannedDate` date,
	`conductedDate` date,
	`actualAttendees` int DEFAULT 0,
	`attendancePercentage` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processTrainings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(255) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`isApproved` boolean NOT NULL DEFAULT false,
	`approverEmail` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processUsers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`macroProcess` varchar(255),
	`processType` enum('estrategico','misional','soporte') NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `riskMatrix` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`riskDescription` text NOT NULL,
	`probability` enum('1','2','3','4','5') NOT NULL,
	`impact` enum('A','B','C','D','E') NOT NULL,
	`riskLevel` varchar(20) NOT NULL,
	`managementSystem` enum('Calidad','SSO','Ambiente','BASC'),
	`existingControls` text,
	`improvementImplemented` boolean DEFAULT false,
	`newProbability` enum('1','2','3','4','5'),
	`newRiskLevel` varchar(20),
	`communicatedToAreas` boolean DEFAULT false,
	`implementationPercentage` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `riskMatrix_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stakeholderCriticalities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(100),
	`influence` int,
	`dependence` int,
	`criticality` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stakeholderCriticalities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stakeholders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('cliente','proveedor') NOT NULL,
	`isInternal` boolean NOT NULL,
	`needs` text,
	`actions` text,
	`outputs` text,
	`documents` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stakeholders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `strategicObjectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`objective` text NOT NULL,
	`description` text,
	`target` text,
	`startYear` int NOT NULL,
	`endYear` int NOT NULL,
	`generalManagerName` varchar(255),
	`generalManagerCI` varchar(50),
	`electronicSignature` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `strategicObjectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subprocessMapEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subprocessMapId` int NOT NULL,
	`partesInteresadas` text,
	`internoExterno` varchar(100),
	`clienteProveedor` varchar(100),
	`necesidades` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subprocessMapEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subprocessMapOutputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subprocessMapId` int NOT NULL,
	`salidas` text,
	`doc` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subprocessMapOutputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subprocessMapSubprocesses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subprocessMapId` int NOT NULL,
	`acciones` text,
	`subproceso` text,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subprocessMapSubprocesses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subprocessMaps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`entrada` text,
	`necesidades` longtext,
	`subprocesos` text,
	`salida` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subprocessMaps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subprocesses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subprocesses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tacticalObjectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`objective` text NOT NULL,
	`year` int NOT NULL,
	`orderIndex` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tacticalObjectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trainings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processId` int NOT NULL,
	`trainingName` varchar(255) NOT NULL,
	`objective` text,
	`isMandatory` boolean DEFAULT false,
	`duration` varchar(100),
	`targetAudience` varchar(255),
	`isInternal` boolean DEFAULT true,
	`trainer` varchar(255),
	`month` int NOT NULL,
	`year` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trainings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userCompanyAccess` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`role` enum('manager','process_leader','viewer') NOT NULL DEFAULT 'manager',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userCompanyAccess_id` PRIMARY KEY(`id`)
);
