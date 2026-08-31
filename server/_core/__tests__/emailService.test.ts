import { describe, it, expect, vi, beforeEach } from "vitest";

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
  sendEmailStrict,
  sendManagerAccessInvitationEmail,
  sendManagerAccessConfirmationEmail,
  sendProcessLeaderAccessConfirmationEmail,
} from "../emailService";

describe("Email Service - Non-blocking Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendEmail", () => {
    it("should return true immediately without waiting", async () => {
      const startTime = Date.now();
      const result = sendEmail({
        to: "test@example.com",
        subject: "Test",
        htmlContent: "<p>Test</p>",
      });
      const endTime = Date.now();

      expect(result).toBe(true);
      // Should complete in less than 100ms (not waiting for retries)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should be non-blocking (return immediately)", () => {
      const result = sendEmail({
        to: "test@example.com",
        subject: "Test",
        htmlContent: "<p>Test</p>",
      });

      // Should return synchronously
      expect(typeof result).toBe("boolean");
      expect(result).toBe(true);
    });

    it("sendEmailStrict resolves to a boolean without throwing", async () => {
      const result = await sendEmailStrict({
        to: "test@example.com",
        subject: "Test",
        htmlContent: "<p>Test</p>",
      });
      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendManagerAccessInvitationEmail", () => {
    it("should return true immediately without waiting", () => {
      const startTime = Date.now();
      const result = sendManagerAccessInvitationEmail(
        "manager@example.com",
        "Test Company",
        "test-token-123",
        30,
        "https://localhost:3000"
      );
      const endTime = Date.now();

      expect(result).toBe(true);
      // Should complete in less than 100ms (not waiting for retries)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should not be async", () => {
      const result = sendManagerAccessInvitationEmail(
        "manager@example.com",
        "Test Company",
        "test-token-123",
        30
      );

      // Should return a boolean, not a Promise
      expect(result).toBe(true);
      expect(result instanceof Promise).toBe(false);
    });
  });

  describe("sendManagerAccessConfirmationEmail", () => {
    it("should return true immediately without waiting", () => {
      const startTime = Date.now();
      const result = sendManagerAccessConfirmationEmail(
        "manager@example.com",
        "Test Company",
        "https://localhost:3000"
      );
      const endTime = Date.now();

      expect(result).toBe(true);
      // Should complete in less than 100ms (not waiting for retries)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should not be async", () => {
      const result = sendManagerAccessConfirmationEmail(
        "manager@example.com",
        "Test Company"
      );

      // Should return a boolean, not a Promise
      expect(result).toBe(true);
      expect(result instanceof Promise).toBe(false);
    });
  });

  describe("sendProcessLeaderAccessConfirmationEmail", () => {
    it("should return true immediately without waiting", () => {
      const startTime = Date.now();
      const result = sendProcessLeaderAccessConfirmationEmail(
        "leader@example.com",
        "John Doe",
        "Test Company",
        "Sales Process",
        "https://localhost:3000"
      );
      const endTime = Date.now();

      expect(result).toBe(true);
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should not be async", () => {
      const result = sendProcessLeaderAccessConfirmationEmail(
        "leader@example.com",
        "John Doe",
        "Test Company",
        "Sales Process"
      );

      expect(result).toBe(true);
      expect(result instanceof Promise).toBe(false);
    });
  });
});
