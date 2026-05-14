import bcrypt from 'bcryptjs';

const password = 'TestPassword123!';
const hash = '$2a$10$example'; // Placeholder

// Test bcrypt comparison
console.log('Testing bcrypt...');

// Create a test hash
bcrypt.hash(password, 10).then(testHash => {
  console.log('Test hash:', testHash);
  
  // Try to compare
  bcrypt.compare(password, testHash).then(result => {
    console.log('Comparison result:', result);
  });
});
