import bcrypt from 'bcryptjs';

// This simulates the exact flow that happens in the backend

const testEmail = 'angess22@gmail.com';
const testPassword = 'TestPassword123!';

// Simulate what happens in the database
console.log('=== SIMULATING MANAGER INVITATION ACCEPTANCE ===');
const passwordHashFromAccept = await bcrypt.hash(testPassword, 10);
console.log('Password hash created during invitation acceptance:');
console.log('Hash:', passwordHashFromAccept);
console.log('');

// Simulate what happens during login
console.log('=== SIMULATING MANAGER LOGIN ===');
console.log('Email:', testEmail);
console.log('Password entered:', testPassword);
console.log('');

// This is what happens in the login mutation
const isPasswordValid = await bcrypt.compare(testPassword, passwordHashFromAccept);
console.log('bcrypt.compare result:', isPasswordValid);
console.log('');

if (isPasswordValid) {
  console.log('✓ LOGIN SUCCESSFUL');
} else {
  console.log('✗ LOGIN FAILED');
}
