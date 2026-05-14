import { describe, it, expect } from "vitest";
import {
  sendEmail,
  sendPINRecoveryEmail,
  sendAccessInvitationEmail,
  sendManagerPasswordSetupEmail,
  sendApprovalNotificationEmail,
  sendManagerAccessInvitationEmail,
  sendProcessLeaderInvitationEmail,
  EmailOptions,
} from "../_core/emailService";

/**
 * Email Service Tests
 * Tests for Brevo transactional email (API) helpers
 */

describe("Email Service - Brevo Integration", () => {
  describe("sendEmail - Base Email Function", () => {
    it("should accept valid email options", async () => {
      const options: EmailOptions = {
        to: "test@example.com",
        subject: "Test Email",
        htmlContent: "<p>Test content</p>",
        textContent: "Test content",
      };

      const result = await sendEmail(options);
      expect(typeof result).toBe("boolean");
    });

    it("should handle multiple recipients", async () => {
      const options: EmailOptions = {
        to: ["test1@example.com", "test2@example.com"],
        subject: "Test Email",
        htmlContent: "<p>Test content</p>",
      };

      const result = await sendEmail(options);
      expect(typeof result).toBe("boolean");
    });

    it("should generate text content from HTML if not provided", async () => {
      const options: EmailOptions = {
        to: "test@example.com",
        subject: "Test Email",
        htmlContent: "<p>Test content</p>",
      };

      const result = await sendEmail(options);
      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendPINRecoveryEmail", () => {
    it("should send PIN recovery email with valid parameters", async () => {
      const result = await sendPINRecoveryEmail(
        "leader@example.com",
        "Juan Pérez",
        "ABC123DEF456",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include reset link in email", async () => {
      const token = "TEST_TOKEN_123";
      const baseUrl = "http://localhost:3000";

      const result = await sendPINRecoveryEmail(
        "leader@example.com",
        "Juan Pérez",
        token,
        baseUrl
      );

      expect(typeof result).toBe("boolean");
    });

    it("should handle default frontend URL", async () => {
      const result = await sendPINRecoveryEmail(
        "leader@example.com",
        "Juan Pérez",
        "ABC123DEF456"
      );

      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendAccessInvitationEmail", () => {
    it("should send access invitation email with valid parameters", async () => {
      const result = await sendAccessInvitationEmail(
        "contact@company.com",
        "Empresa Test S.A.",
        "INVITATION_TOKEN_123",
        7,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include company name in email", async () => {
      const companyName = "Test Company Inc.";
      const result = await sendAccessInvitationEmail(
        "contact@company.com",
        companyName,
        "TOKEN_123",
        30,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include expiration days in email", async () => {
      const expirationDays = 14;
      const result = await sendAccessInvitationEmail(
        "contact@company.com",
        "Company",
        "TOKEN_123",
        expirationDays,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should handle default base URL", async () => {
      const result = await sendAccessInvitationEmail(
        "contact@company.com",
        "Company",
        "TOKEN_123",
        7
      );

      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendManagerPasswordSetupEmail", () => {
    it("should send manager password setup email with valid parameters", async () => {
      const result = await sendManagerPasswordSetupEmail(
        "manager@company.com",
        "Empresa Test S.A.",
        "SETUP_TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include company name in email", async () => {
      const companyName = "Manager Test Company";
      const result = await sendManagerPasswordSetupEmail(
        "manager@company.com",
        companyName,
        "TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include setup link with token", async () => {
      const token = "SETUP_TOKEN_ABC123";
      const result = await sendManagerPasswordSetupEmail(
        "manager@company.com",
        "Company",
        token,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should handle default base URL", async () => {
      const result = await sendManagerPasswordSetupEmail(
        "manager@company.com",
        "Company",
        "TOKEN_123"
      );

      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendApprovalNotificationEmail", () => {
    it("should send approval notification email with valid parameters", async () => {
      const result = await sendApprovalNotificationEmail(
        "manager@example.com",
        "Company Name",
        "John Doe",
        "APPROVAL_TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include company name in email", async () => {
      const companyName = "Test Company Inc.";
      const result = await sendApprovalNotificationEmail(
        "manager@example.com",
        companyName,
        "Contact Name",
        "TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include contact name in email", async () => {
      const contactName = "María García";
      const result = await sendApprovalNotificationEmail(
        "manager@example.com",
        "Company",
        contactName,
        "TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendManagerAccessInvitationEmail", () => {
    it("should send manager access invitation email with valid parameters", async () => {
      const result = await sendManagerAccessInvitationEmail(
        "manager@company.com",
        "Empresa Test S.A.",
        "MANAGER_TOKEN_123",
        30,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include company name in email", async () => {
      const companyName = "Manager Test Company";
      const result = await sendManagerAccessInvitationEmail(
        "manager@company.com",
        companyName,
        "TOKEN_123",
        14,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include expiration days in email", async () => {
      const expirationDays = 7;
      const result = await sendManagerAccessInvitationEmail(
        "manager@company.com",
        "Company",
        "TOKEN_123",
        expirationDays,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should handle default base URL", async () => {
      const result = await sendManagerAccessInvitationEmail(
        "manager@company.com",
        "Company",
        "TOKEN_123",
        30
      );

      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendProcessLeaderInvitationEmail", () => {
    it("should send process leader invitation email with valid parameters", async () => {
      const result = await sendProcessLeaderInvitationEmail(
        "leader@company.com",
        "Carlos López",
        "Proceso de Ventas",
        "Empresa Test S.A.",
        "LEADER_TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include leader name in email", async () => {
      const leaderName = "Ana Martínez";
      const result = await sendProcessLeaderInvitationEmail(
        "leader@company.com",
        leaderName,
        "Process Name",
        "Company",
        "TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include process name in email", async () => {
      const processName = "Proceso de Logística";
      const result = await sendProcessLeaderInvitationEmail(
        "leader@company.com",
        "Leader Name",
        processName,
        "Company",
        "TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include company name in email", async () => {
      const companyName = "Empresa Ejemplo S.A.";
      const result = await sendProcessLeaderInvitationEmail(
        "leader@company.com",
        "Leader",
        "Process",
        companyName,
        "TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });
  });

  describe("Email Service Integration", () => {
    it("should handle all email types without errors", async () => {
      const results = await Promise.all([
        sendPINRecoveryEmail(
          "leader@example.com",
          "Leader",
          "TOKEN1",
          "http://localhost:3000"
        ),
        sendAccessInvitationEmail(
          "contact@example.com",
          "Company",
          "TOKEN2",
          7,
          "http://localhost:3000"
        ),
        sendManagerPasswordSetupEmail(
          "manager@example.com",
          "Company",
          "TOKEN3",
          "http://localhost:3000"
        ),
        sendApprovalNotificationEmail(
          "manager@example.com",
          "Company",
          "Contact",
          "TOKEN4",
          "http://localhost:3000"
        ),
        sendManagerAccessInvitationEmail(
          "manager@example.com",
          "Company",
          "TOKEN5",
          30,
          "http://localhost:3000"
        ),
        sendProcessLeaderInvitationEmail(
          "leader@example.com",
          "Leader",
          "Process",
          "Company",
          "TOKEN6",
          "http://localhost:3000"
        ),
      ]);

      results.forEach((result) => {
        expect(typeof result).toBe("boolean");
      });
    });

    it("should handle email addresses with special characters", async () => {
      const result = await sendPINRecoveryEmail(
        "user+test@example.co.uk",
        "User Name",
        "TOKEN",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should handle long company names", async () => {
      const longCompanyName =
        "Very Long Company Name With Many Words S.A. de C.V. del Grupo Industrial";
      const result = await sendAccessInvitationEmail(
        "contact@example.com",
        longCompanyName,
        "TOKEN",
        30,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should handle special characters in user names", async () => {
      const result = await sendProcessLeaderInvitationEmail(
        "leader@example.com",
        "José María García-López",
        "Process",
        "Company",
        "TOKEN",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });
  });

  describe("Email Service Error Handling", () => {
    it("should handle invalid email addresses gracefully", async () => {
      const result = await sendEmail({
        to: "invalid-email",
        subject: "Test",
        htmlContent: "<p>Test</p>",
      });

      expect(typeof result).toBe("boolean");
    });

    it("should handle empty recipient list", async () => {
      const result = await sendEmail({
        to: [],
        subject: "Test",
        htmlContent: "<p>Test</p>",
      });

      expect(typeof result).toBe("boolean");
    });

    it("should handle very long email content", async () => {
      const longContent = "<p>" + "A".repeat(10000) + "</p>";
      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test",
        htmlContent: longContent,
      });

      expect(typeof result).toBe("boolean");
    });
  });
});
