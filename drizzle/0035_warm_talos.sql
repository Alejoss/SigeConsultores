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
