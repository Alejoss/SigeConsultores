import bcrypt from 'bcryptjs';

// Test different scenarios
console.log('=== TESTING BCRYPT SCENARIOS ===\n');

const password = 'TestPassword123!';
const hash = await bcrypt.hash(password, 10);

console.log('1. Testing exact password:');
const result1 = await bcrypt.compare(password, hash);
console.log(`   Input: "${password}"`);
console.log(`   Result: ${result1}\n`);

console.log('2. Testing with extra space:');
const result2 = await bcrypt.compare(' TestPassword123!', hash);
console.log(`   Input: " TestPassword123!"`);
console.log(`   Result: ${result2}\n`);

console.log('3. Testing with trailing space:');
const result3 = await bcrypt.compare('TestPassword123! ', hash);
console.log(`   Input: "TestPassword123! "`);
console.log(`   Result: ${result3}\n`);

console.log('4. Testing with newline:');
const result4 = await bcrypt.compare('TestPassword123!\n', hash);
console.log(`   Input: "TestPassword123!\\n"`);
console.log(`   Result: ${result4}\n`);

console.log('5. Testing case sensitivity:');
const result5 = await bcrypt.compare('testpassword123!', hash);
console.log(`   Input: "testpassword123!"`);
console.log(`   Result: ${result5}\n`);

console.log('6. Testing with different special char:');
const result6 = await bcrypt.compare('TestPassword123@', hash);
console.log(`   Input: "TestPassword123@"`);
console.log(`   Result: ${result6}\n`);
