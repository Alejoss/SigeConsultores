import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createCompanyManager,
  getCompanyManager,
  getCompanyManagersByCompany,
  deleteCompanyManager,
  createProcessOwnerInvitation,
  getProcessOwnerInvitation,
  getProcessOwnerInvitationsByCompany,
  acceptProcessOwnerInvitation,
  deleteProcessOwnerInvitation,
  createProcessOwner,
  getProcessOwner,
  getProcessOwnersByProcess,
  getProcessOwnersByUser,
  deleteProcessOwner,
} from "../db";

/**
 * Tests for hierarchical access management system
 * Tests company managers, process owner invitations, and process owners
 */
describe("Hierarchical Access Management", () => {
  const TEST_COMPANY_ID = 999;
  const TEST_PROCESS_ID = 888;
  const TEST_USER_ID = 777;
  const TEST_USER_ID_2 = 776;

  // ============================================================================
  // COMPANY MANAGERS TESTS
  // ============================================================================

  describe("Company Managers", () => {
    afterAll(async () => {
      // Clean up
      await deleteCompanyManager(TEST_COMPANY_ID, TEST_USER_ID).catch(() => {});
    });

    it("should create a company manager", async () => {
      const manager = await createCompanyManager(TEST_COMPANY_ID, TEST_USER_ID);

      expect(manager).toBeDefined();
      expect(manager.companyId).toBe(TEST_COMPANY_ID);
      expect(manager.userId).toBe(TEST_USER_ID);
      expect(manager.createdAt).toBeDefined();
    });

    it("should get a company manager", async () => {
      const manager = await getCompanyManager(TEST_COMPANY_ID, TEST_USER_ID);

      expect(manager).toBeDefined();
      expect(manager?.companyId).toBe(TEST_COMPANY_ID);
      expect(manager?.userId).toBe(TEST_USER_ID);
    });

    it("should get all managers for a company", async () => {
      const managers = await getCompanyManagersByCompany(TEST_COMPANY_ID);

      expect(managers).toBeDefined();
      expect(managers.length).toBeGreaterThan(0);
      expect(managers[0].companyId).toBe(TEST_COMPANY_ID);
    });

    it("should delete a company manager", async () => {
      await deleteCompanyManager(TEST_COMPANY_ID, TEST_USER_ID);

      const manager = await getCompanyManager(TEST_COMPANY_ID, TEST_USER_ID);
      expect(manager).toBeUndefined();
    });
  });

  // ============================================================================
  // PROCESS OWNER INVITATIONS TESTS
  // ============================================================================

  describe("Process Owner Invitations", () => {
    let invitationToken: string;
    const accessCode = "1234";

    beforeAll(async () => {
      // Create an invitation for testing
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await createProcessOwnerInvitation(
        TEST_COMPANY_ID,
        TEST_PROCESS_ID,
        "test@example.com",
        accessCode,
        "test-token-" + Date.now(),
        expiresAt
      );

      invitationToken = invitation.invitationToken;
    });

    afterAll(async () => {
      // Clean up
      await deleteProcessOwnerInvitation(invitationToken).catch(() => {});
    });

    it("should create a process owner invitation", async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await createProcessOwnerInvitation(
        TEST_COMPANY_ID,
        TEST_PROCESS_ID,
        "newtest@example.com",
        "4321",
        "new-token-" + Date.now(),
        expiresAt
      );

      expect(invitation).toBeDefined();
      expect(invitation.companyId).toBe(TEST_COMPANY_ID);
      expect(invitation.processId).toBe(TEST_PROCESS_ID);
      expect(invitation.email).toBe("newtest@example.com");
      expect(invitation.accessCode).toBe("4321");
      expect(invitation.status).toBe("pending");

      // Clean up
      await deleteProcessOwnerInvitation(invitation.invitationToken);
    });

    it("should get a process owner invitation by token", async () => {
      const invitation = await getProcessOwnerInvitation(invitationToken);

      expect(invitation).toBeDefined();
      expect(invitation?.invitationToken).toBe(invitationToken);
      expect(invitation?.status).toBe("pending");
    });

    it("should get all invitations for a company", async () => {
      const invitations = await getProcessOwnerInvitationsByCompany(TEST_COMPANY_ID);

      expect(invitations).toBeDefined();
      expect(invitations.length).toBeGreaterThan(0);
      expect(invitations[0].companyId).toBe(TEST_COMPANY_ID);
    });

    it("should accept a process owner invitation", async () => {
      const accepted = await acceptProcessOwnerInvitation(invitationToken);

      expect(accepted).toBeDefined();
      expect(accepted.status).toBe("accepted");
      expect(accepted.acceptedAt).toBeDefined();
    });

    it("should not accept an already accepted invitation", async () => {
      try {
        await acceptProcessOwnerInvitation(invitationToken);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).toContain("no longer valid");
      }
    });
  });

  // ============================================================================
  // PROCESS OWNERS TESTS
  // ============================================================================

  describe("Process Owners", () => {
    const accessCode = "5678";

    afterAll(async () => {
      // Clean up
      await deleteProcessOwner(TEST_PROCESS_ID, TEST_USER_ID_2).catch(() => {});
    });

    it("should create a process owner", async () => {
      const owner = await createProcessOwner(
        TEST_COMPANY_ID,
        TEST_PROCESS_ID,
        TEST_USER_ID_2,
        accessCode
      );

      expect(owner).toBeDefined();
      expect(owner.companyId).toBe(TEST_COMPANY_ID);
      expect(owner.processId).toBe(TEST_PROCESS_ID);
      expect(owner.userId).toBe(TEST_USER_ID_2);
      expect(owner.accessCode).toBe(accessCode);
    });

    it("should get a process owner", async () => {
      const owner = await getProcessOwner(TEST_PROCESS_ID, TEST_USER_ID_2);

      expect(owner).toBeDefined();
      expect(owner?.processId).toBe(TEST_PROCESS_ID);
      expect(owner?.userId).toBe(TEST_USER_ID_2);
    });

    it("should get all owners for a process", async () => {
      const owners = await getProcessOwnersByProcess(TEST_PROCESS_ID);

      expect(owners).toBeDefined();
      expect(owners.length).toBeGreaterThan(0);
      expect(owners[0].processId).toBe(TEST_PROCESS_ID);
    });

    it("should get all processes owned by a user", async () => {
      const processes = await getProcessOwnersByUser(TEST_USER_ID_2);

      expect(processes).toBeDefined();
      expect(processes.length).toBeGreaterThan(0);
      expect(processes[0].userId).toBe(TEST_USER_ID_2);
    });

    it("should delete a process owner", async () => {
      await deleteProcessOwner(TEST_PROCESS_ID, TEST_USER_ID_2);

      const owner = await getProcessOwner(TEST_PROCESS_ID, TEST_USER_ID_2);
      expect(owner).toBeUndefined();
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe("Hierarchical Access Integration", () => {
    it("should complete the full invitation flow", async () => {
      // Step 1: Create a company manager
      const manager = await createCompanyManager(TEST_COMPANY_ID, TEST_USER_ID);
      expect(manager).toBeDefined();

      // Step 2: Create an invitation for a process owner
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await createProcessOwnerInvitation(
        TEST_COMPANY_ID,
        TEST_PROCESS_ID,
        "dolores@example.com",
        "4321",
        "integration-test-" + Date.now(),
        expiresAt
      );
      expect(invitation.status).toBe("pending");

      // Step 3: Accept the invitation
      const accepted = await acceptProcessOwnerInvitation(invitation.invitationToken);
      expect(accepted.status).toBe("accepted");

      // Step 4: Create the process owner record
      const owner = await createProcessOwner(
        TEST_COMPANY_ID,
        TEST_PROCESS_ID,
        TEST_USER_ID,
        "4321"
      );
      expect(owner).toBeDefined();

      // Step 5: Verify the process owner can access their process
      const retrievedOwner = await getProcessOwner(TEST_PROCESS_ID, TEST_USER_ID);
      expect(retrievedOwner).toBeDefined();
      expect(retrievedOwner?.userId).toBe(TEST_USER_ID);

      // Clean up
      await deleteProcessOwner(TEST_PROCESS_ID, TEST_USER_ID);
      await deleteCompanyManager(TEST_COMPANY_ID, TEST_USER_ID);
      await deleteProcessOwnerInvitation(invitation.invitationToken);
    });
  });
});
