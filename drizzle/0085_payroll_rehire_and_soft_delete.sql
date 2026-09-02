-- Recontratación y retiro controlado de personal.
-- Cambios exclusivamente aditivos: no se altera ni se elimina ningún registro existente.

ALTER TABLE `payrollEmployees`
  ADD COLUMN `deletedAt` timestamp NULL;

CREATE TABLE IF NOT EXISTS `payrollEmploymentPeriods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `payrollEmployeeId` int NOT NULL,
  `companyId` int NOT NULL,
  `fullName` varchar(255) NOT NULL,
  `identityCard` varchar(20) NOT NULL,
  `hireDate` date NOT NULL,
  `terminationDate` date NOT NULL,
  `area` varchar(255) NOT NULL,
  `position` varchar(255) NOT NULL,
  `closedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
