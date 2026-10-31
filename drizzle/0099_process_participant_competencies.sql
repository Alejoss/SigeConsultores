-- Competencias del puesto funcional definido en Participantes.
-- Migración exclusivamente aditiva: no modifica puestos, descriptivos, Nómina ni datos existentes.
CREATE TABLE `processParticipantCompetencies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processParticipantId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `competencyType` enum('transversal','tecnica','liderazgo') NOT NULL,
  `competencyLevel` enum('basico','intermedio','avanzado','experto') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `process_participant_competencies_participant_fk`
    FOREIGN KEY (`processParticipantId`)
    REFERENCES `processParticipants` (`id`)
    ON DELETE CASCADE,
  INDEX `process_participant_competencies_participant_idx`
    (`processParticipantId`, `id`)
);
