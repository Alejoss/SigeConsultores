import { getDb } from './server/db.ts';

async function createTables() {
  const db = await getDb();
  if (!db) {
    console.error('Database not available');
    process.exit(1);
  }

  try {
    // Create organizationChart table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS organizationChart (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companyId INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ organizationChart table created/verified');

    // Create organizationChartNodes table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS organizationChartNodes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chartId INT NOT NULL,
        nodeId VARCHAR(64) NOT NULL,
        parentNodeId VARCHAR(64),
        position VARCHAR(255) NOT NULL,
        department VARCHAR(255),
        personName VARCHAR(255),
        email VARCHAR(320),
        phone VARCHAR(20),
        responsibilities LONGTEXT,
        salary DECIMAL(12, 2),
        level INT NOT NULL,
        \`order\` INT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ organizationChartNodes table created/verified');

    // Create organizationChartFiles table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS organizationChartFiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chartId INT NOT NULL,
        fileName VARCHAR(255) NOT NULL,
        fileUrl VARCHAR(1024) NOT NULL,
        fileKey VARCHAR(1024) NOT NULL,
        uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        uploadedByUserId INT NOT NULL,
        uploadedByName VARCHAR(255) NOT NULL
      )
    `);
    console.log('✓ organizationChartFiles table created/verified');

    console.log('\n✓ All organization chart tables created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating tables:', error);
    process.exit(1);
  }
}

createTables();
