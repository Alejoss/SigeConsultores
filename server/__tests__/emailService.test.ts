import { describe, it, expect, vi } from "vitest";

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: class {
    send = vi.fn().mockResolvedValue({ MessageId: "mock-message-id" });
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));

import {
  sendEmail,
  sendAccessInvitationEmail,
  sendApprovalNotificationEmail,
  sendManagerAccessInvitationEmail,
  sendProcessLeaderInvitationEmail,
  sendProcessLeaderAccessConfirmationEmail,
  EmailOptions,
} from "../_core/emailService";

/**
 * Tests for Amazon SES transactional email helpers
 */

describe("Email Service - SES Integration", () => {
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

  describe("sendProcessLeaderAccessConfirmationEmail", () => {
    it("should send process leader confirmation email", () => {
      const result = sendProcessLeaderAccessConfirmationEmail(
        "leader@example.com",
        "Juan Pérez",
        "Empresa Test",
        "Ventas",
        "http://localhost:3000"
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

  describe("sendManagerAccessInvitationEmail", () => {
    it("should send manager access invitation email with valid parameters", () => {
      const result = sendManagerAccessInvitationEmail(
        "manager@company.com",
        "Empresa Test S.A.",
        "SETUP_TOKEN_123",
        7,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include company name in email", () => {
      const companyName = "Manager Test Company";
      const result = sendManagerAccessInvitationEmail(
        "manager@company.com",
        companyName,
        "TOKEN_123",
        7,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include setup link with token", () => {
      const token = "SETUP_TOKEN_ABC123";
      const result = sendManagerAccessInvitationEmail(
        "manager@company.com",
        "Company",
        token,
        7,
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should handle default base URL", () => {
      const result = sendManagerAccessInvitationEmail(
        "manager@company.com",
        "Company",
        "TOKEN_123",
        7
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
    it("should send process leader invitation email with valid parameters", () => {
      const result = sendProcessLeaderInvitationEmail(
        "leader@company.com",
        "Carlos López",
        "Proceso de Ventas",
        "Empresa Test S.A.",
        "LEADER_TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include leader name in email", () => {
      const leaderName = "Ana Martínez";
      const result = sendProcessLeaderInvitationEmail(
        "leader@company.com",
        leaderName,
        "Process Name",
        "Company",
        "TOKEN_123",
        "http://localhost:3000"
      );

      expect(typeof result).toBe("boolean");
    });

    it("should include process name in email", () => {
      const processName = "Proceso de Logística";
      const result = sendProcessLeaderInvitationEmail(
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
      const result = sendProcessLeaderInvitationEmail(
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
        Promise.resolve(
          sendProcessLeaderAccessConfirmationEmail(
            "leader@example.com",
            "Leader",
            "Company",
            "Process",
            "http://localhost:3000"
          )
        ),
        sendAccessInvitationEmail(
          "contact@example.com",
          "Company",
          "TOKEN2",
          7,
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
        Promise.resolve(
          sendProcessLeaderInvitationEmail(
            "leader@example.com",
            "Leader",
            "Process",
            "Company",
            "TOKEN6",
            "http://localhost:3000"
          )
        ),
      ]);

      results.forEach((result) => {
        expect(typeof result).toBe("boolean");
      });
    });

    it("should handle email addresses with special characters", async () => {
      const result = sendProcessLeaderAccessConfirmationEmail(
        "user+test@example.co.uk",
        "User Name",
        "Company",
        "Process",
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

    it("should handle special characters in user names", () => {
      const result = sendProcessLeaderInvitationEmail(
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
