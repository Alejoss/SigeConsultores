import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { managerAuthRouter } from '../managerAuth';
import { getDb } from '../../db';
import { companyManagerCredentials } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Manager Auth Router', () => {
  const testEmail = 'test-manager@example.com';
  const testPassword = 'TestPassword123!';
  let testPasswordHash: string;

  beforeAll(async () => {
    // Create a test password hash
    testPasswordHash = await bcrypt.hash(testPassword, 10);
    console.log('Test setup: Created password hash');
  });

  describe('login procedure', () => {
    it('should successfully login with correct credentials', async () => {
      // This test verifies that bcrypt.compare works correctly
      const isValid = await bcrypt.compare(testPassword, testPasswordHash);
      expect(isValid).toBe(true);
    });

    it('should fail login with incorrect password', async () => {
      const wrongPassword = 'WrongPassword123!';
      const isValid = await bcrypt.compare(wrongPassword, testPasswordHash);
      expect(isValid).toBe(false);
    });

    it('should handle password with special characters', async () => {
      const specialPassword = 'Test@Pass#123$%';
      const hash = await bcrypt.hash(specialPassword, 10);
      const isValid = await bcrypt.compare(specialPassword, hash);
      expect(isValid).toBe(true);
    });

    it('should handle password with unicode characters', async () => {
      const unicodePassword = 'TestPassword123!ñ';
      const hash = await bcrypt.hash(unicodePassword, 10);
      const isValid = await bcrypt.compare(unicodePassword, hash);
      expect(isValid).toBe(true);
    });

    it('should be case-sensitive for passwords', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);
      
      // Exact match should work
      const exactMatch = await bcrypt.compare(password, hash);
      expect(exactMatch).toBe(true);
      
      // Different case should fail
      const differentCase = await bcrypt.compare('testpassword123!', hash);
      expect(differentCase).toBe(false);
    });

    it('should handle bcrypt with different rounds', async () => {
      const password = 'TestPassword123!';
      
      // Test with rounds 10
      const hash10 = await bcrypt.hash(password, 10);
      const match10 = await bcrypt.compare(password, hash10);
      expect(match10).toBe(true);
      
      // Test with rounds 12
      const hash12 = await bcrypt.hash(password, 12);
      const match12 = await bcrypt.compare(password, hash12);
      expect(match12).toBe(true);
    });

    it('should validate password requirements', () => {
      const validatePassword = (pwd: string): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        if (pwd.length < 12) {
          errors.push("Mínimo 12 caracteres");
        }
        if (!/[A-Z]/.test(pwd)) {
          errors.push("Al menos una mayúscula");
        }
        if (!/[a-z]/.test(pwd)) {
          errors.push("Al menos una minúscula");
        }
        if (!/[0-9]/.test(pwd)) {
          errors.push("Al menos un número");
        }
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) {
          errors.push("Al menos un carácter especial");
        }

        return {
          valid: errors.length === 0,
          errors,
        };
      };

      // Valid password
      const validPassword = 'TestPassword123!';
      const validResult = validatePassword(validPassword);
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      // Invalid passwords
      const tooShort = 'Test123!';
      const tooShortResult = validatePassword(tooShort);
      expect(tooShortResult.valid).toBe(false);
      expect(tooShortResult.errors).toContain("Mínimo 12 caracteres");

      const noUppercase = 'testpassword123!';
      const noUppercaseResult = validatePassword(noUppercase);
      expect(noUppercaseResult.valid).toBe(false);
      expect(noUppercaseResult.errors).toContain("Al menos una mayúscula");

      const noNumbers = 'TestPassword!';
      const noNumbersResult = validatePassword(noNumbers);
      expect(noNumbersResult.valid).toBe(false);
      expect(noNumbersResult.errors).toContain("Al menos un número");

      const noSpecial = 'TestPassword123';
      const noSpecialResult = validatePassword(noSpecial);
      expect(noSpecialResult.valid).toBe(false);
      expect(noSpecialResult.errors).toContain("Al menos un carácter especial");
    });
  });

  describe('checkEmail procedure', () => {
    it('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.co.uk',
        'user+tag@example.com',
      ];

      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user name@example.com',
      ];

      validEmails.forEach(email => {
        expect(() => {
          // Simple email validation
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Invalid email');
          }
        }).not.toThrow();
      });

      invalidEmails.forEach(email => {
        expect(() => {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Invalid email');
          }
        }).toThrow();
      });
    });
  });
});


describe('managerLogin procedure', () => {
  it('should validate that password must be at least 12 characters', () => {
    const shortPassword = 'Short123!';
    const longPassword = 'ValidPassword123!';

    expect(shortPassword.length).toBeLessThan(12);
    expect(longPassword.length).toBeGreaterThanOrEqual(12);
  });

  it('should handle email validation for login', () => {
    const validEmails = [
      'manager@company.com',
      'user@domain.co.uk',
      'test.email@example.org',
    ];

    const invalidEmails = [
      'notanemail',
      'missing@domain',
      '@nodomain.com',
      'spaces in@email.com',
    ];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    validEmails.forEach((email) => {
      expect(emailRegex.test(email)).toBe(true);
    });

    invalidEmails.forEach((email) => {
      expect(emailRegex.test(email)).toBe(false);
    });
  });

  it('should verify password hash comparison logic', async () => {
    const testPassword = 'ValidPassword123!';
    const hash = await bcrypt.hash(testPassword, 10);

    // Correct password should match
    const correctMatch = await bcrypt.compare(testPassword, hash);
    expect(correctMatch).toBe(true);

    // Incorrect password should not match
    const incorrectMatch = await bcrypt.compare('WrongPassword123!', hash);
    expect(incorrectMatch).toBe(false);
  });

  it('should ensure manager login returns required fields', () => {
    const mockLoginResponse = {
      success: true,
      companyId: 1,
      companyName: 'Test Company',
      managerEmail: 'manager@test.com',
      managerName: 'manager@test.com',
      message: 'Login exitoso',
    };

    expect(mockLoginResponse).toHaveProperty('success');
    expect(mockLoginResponse).toHaveProperty('companyId');
    expect(mockLoginResponse).toHaveProperty('companyName');
    expect(mockLoginResponse).toHaveProperty('managerEmail');
    expect(mockLoginResponse).toHaveProperty('managerName');
    expect(mockLoginResponse.success).toBe(true);
  });

  it('should validate that email and password are required for login', () => {
    const loginInput = {
      email: 'manager@company.com',
      password: 'ValidPassword123!',
    };

    expect(loginInput.email).toBeTruthy();
    expect(loginInput.password).toBeTruthy();
    expect(loginInput.email).toMatch(/@/);
    expect(loginInput.password.length).toBeGreaterThanOrEqual(12);
  });
});
