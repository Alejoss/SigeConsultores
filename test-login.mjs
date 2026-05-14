import bcrypt from 'bcryptjs';

// Test password
const password = 'TestPassword123!';

// Create a hash like the system would
const hash = await bcrypt.hash(password, 10);
console.log('Created hash:', hash);

// Try to compare
const match = await bcrypt.compare(password, hash);
console.log('Password matches:', match);

// Test with wrong password
const wrongMatch = await bcrypt.compare('WrongPassword123!', hash);
console.log('Wrong password matches:', wrongMatch);

// Test with different bcrypt rounds
const hash2 = await bcrypt.hash(password, 12);
console.log('Hash with rounds 12:', hash2);
const match2 = await bcrypt.compare(password, hash2);
console.log('Password matches (rounds 12):', match2);
