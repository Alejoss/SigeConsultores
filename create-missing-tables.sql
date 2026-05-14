-- Create accessInvitations table
CREATE TABLE IF NOT EXISTS accessInvitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invitationToken VARCHAR(255) NOT NULL UNIQUE,
  companyName VARCHAR(255) NOT NULL,
  contactEmail VARCHAR(320) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP NULL,
  usedByRequestId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_token (invitationToken),
  INDEX idx_expires (expiresAt)
);

-- Create processLeaderCredentials table
CREATE TABLE IF NOT EXISTS processLeaderCredentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  processId INT NOT NULL,
  leaderEmail VARCHAR(320) NOT NULL,
  leaderName VARCHAR(255),
  pinHash VARCHAR(255) NOT NULL,
  isActive BOOLEAN DEFAULT TRUE,
  lastPINChangeAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_process_email (processId, leaderEmail),
  INDEX idx_active (isActive),
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
);

-- Create processLeaderInvitations table
CREATE TABLE IF NOT EXISTS processLeaderInvitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invitationToken VARCHAR(255) NOT NULL UNIQUE,
  processId INT NOT NULL,
  leaderEmail VARCHAR(320) NOT NULL,
  leaderName VARCHAR(255),
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP NULL,
  usedByLeaderId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_token (invitationToken),
  INDEX idx_expires (expiresAt),
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE,
  FOREIGN KEY (usedByLeaderId) REFERENCES processLeaderCredentials(id) ON DELETE SET NULL
);

-- Create processLeaderPINResetTokens table
CREATE TABLE IF NOT EXISTS processLeaderPINResetTokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resetToken VARCHAR(255) NOT NULL UNIQUE,
  leaderCredentialsId INT NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_token (resetToken),
  INDEX idx_expires (expiresAt),
  FOREIGN KEY (leaderCredentialsId) REFERENCES processLeaderCredentials(id) ON DELETE CASCADE
);
