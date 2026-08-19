CREATE TABLE `managementProgramFiles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `programId` int NOT NULL,
  `companyId` int NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `fileUrl` varchar(1024) NOT NULL,
  `fileKey` varchar(1024) NOT NULL,
  `fileSizeBytes` int DEFAULT 0,
  `uploadedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `managementProgramFiles_id` PRIMARY KEY(`id`)
);
