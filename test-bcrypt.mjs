import bcrypt from 'bcryptjs';

const password = 'Issael@2025#';
const hash = '$2b$10$test'; // Placeholder - we'll get the real hash from DB

// First, let's hash the password and see what we get
const newHash = await bcrypt.hash(password, 10);
console.log('Password:', password);
console.log('New hash:', newHash);
console.log('Hash length:', newHash.length);

// Now test comparison
const isValid = await bcrypt.compare(password, newHash);
console.log('Comparison result:', isValid);
