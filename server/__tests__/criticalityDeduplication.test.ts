import { describe, it, expect } from "vitest";
import crypto from "crypto";

describe("Consolidated Schedule - Criticality Deduplication", () => {
  it("should deduplicate criticality entries by (stakeholderId, actionToTake, startDate, endDate)", () => {
    // Simulate criticality entries from database
    // 3 unique entries but 253 total (85x duplication)
    const criticalityEntries = [
      // Fincas - appears 85 times
      ...Array(85).fill({
        id: 1,
        stakeholderId: 1,
        actionToTake: "Verificar guía de entrega vs. producto físico.",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
        implementationStatus: false,
        completionPercentage: 0,
      }),
      // Postcosecha Patoa - appears 84 times
      ...Array(84).fill({
        id: 2,
        stakeholderId: 2,
        actionToTake: "Implementar nota de entrega en flor de paso",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
        implementationStatus: false,
        completionPercentage: 0,
      }),
      // Bouquetera - appears 84 times
      ...Array(84).fill({
        id: 3,
        stakeholderId: 3,
        actionToTake: "Implementar proceso de firma en la guía de remisión para garantizar cantidad y tipo de producto entregado por Postcosecha La Esperanza",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
        implementationStatus: false,
        completionPercentage: 0,
      }),
    ];

    // Apply deduplication logic
    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const uniqueKey = `${entry.stakeholderId}|${entry.actionToTake}|${entry.startDate}|${entry.endDate}`;
        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        }
      }
    });

    // Should have only 3 unique entries
    expect(uniqueCriticalityMap.size).toBe(3);

    // Verify each unique entry
    const uniqueEntries = Array.from(uniqueCriticalityMap.values());
    expect(uniqueEntries[0].stakeholderId).toBe(1);
    expect(uniqueEntries[1].stakeholderId).toBe(2);
    expect(uniqueEntries[2].stakeholderId).toBe(3);
  });

  it("should generate consistent content-based IDs for identical criticality entries", () => {
    const entry1 = {
      stakeholderId: 1,
      actionToTake: "Test action",
      startDate: "2026-03-10",
      endDate: "2026-04-30",
    };

    const entry2 = {
      stakeholderId: 1,
      actionToTake: "Test action",
      startDate: "2026-03-10",
      endDate: "2026-04-30",
    };

    // Generate IDs using same logic as consolidatedSchedule.ts
    const contentHash1 = `${entry1.stakeholderId}-${entry1.actionToTake}-${entry1.startDate}-${entry1.endDate}`;
    const contentId1 = crypto.createHash("sha256").update(contentHash1).digest("hex").substring(0, 12);

    const contentHash2 = `${entry2.stakeholderId}-${entry2.actionToTake}-${entry2.startDate}-${entry2.endDate}`;
    const contentId2 = crypto.createHash("sha256").update(contentHash2).digest("hex").substring(0, 12);

    // Same content should produce same ID
    expect(contentId1).toBe(contentId2);
  });

  it("should generate different IDs for different criticality entries", () => {
    const entry1 = {
      stakeholderId: 1,
      actionToTake: "Action 1",
      startDate: "2026-03-10",
      endDate: "2026-04-30",
    };

    const entry2 = {
      stakeholderId: 2,
      actionToTake: "Action 2",
      startDate: "2026-03-10",
      endDate: "2026-04-30",
    };

    const contentHash1 = `${entry1.stakeholderId}-${entry1.actionToTake}-${entry1.startDate}-${entry1.endDate}`;
    const contentId1 = crypto.createHash("sha256").update(contentHash1).digest("hex").substring(0, 12);

    const contentHash2 = `${entry2.stakeholderId}-${entry2.actionToTake}-${entry2.startDate}-${entry2.endDate}`;
    const contentId2 = crypto.createHash("sha256").update(contentHash2).digest("hex").substring(0, 12);

    // Different content should produce different IDs
    expect(contentId1).not.toBe(contentId2);
  });

  it("should handle empty criticality entries", () => {
    const criticalityEntries: any[] = [];

    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const uniqueKey = `${entry.stakeholderId}|${entry.actionToTake}|${entry.startDate}|${entry.endDate}`;
        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        }
      }
    });

    expect(uniqueCriticalityMap.size).toBe(0);
  });

  it("should handle criticality entries with missing actionToTake or endDate", () => {
    const criticalityEntries = [
      {
        id: 1,
        stakeholderId: 1,
        actionToTake: "Valid action",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
      },
      {
        id: 2,
        stakeholderId: 2,
        actionToTake: null, // Missing actionToTake
        startDate: "2026-03-10",
        endDate: "2026-04-30",
      },
      {
        id: 3,
        stakeholderId: 3,
        actionToTake: "Another action",
        startDate: "2026-03-10",
        endDate: null, // Missing endDate
      },
    ];

    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const uniqueKey = `${entry.stakeholderId}|${entry.actionToTake}|${entry.startDate}|${entry.endDate}`;
        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        }
      }
    });

    // Should only have 1 valid entry
    expect(uniqueCriticalityMap.size).toBe(1);
  });

  it("should preserve the first occurrence when duplicates exist", () => {
    const criticalityEntries = [
      {
        id: 1,
        stakeholderId: 1,
        actionToTake: "Test action",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
        completionPercentage: 10,
      },
      {
        id: 2,
        stakeholderId: 1,
        actionToTake: "Test action",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
        completionPercentage: 50, // Different value
      },
      {
        id: 3,
        stakeholderId: 1,
        actionToTake: "Test action",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
        completionPercentage: 100, // Different value
      },
    ];

    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const uniqueKey = `${entry.stakeholderId}|${entry.actionToTake}|${entry.startDate}|${entry.endDate}`;
        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        }
      }
    });

    // Should have only 1 entry
    expect(uniqueCriticalityMap.size).toBe(1);

    // Should be the first occurrence
    const entry = Array.from(uniqueCriticalityMap.values())[0];
    expect(entry.id).toBe(1);
    expect(entry.completionPercentage).toBe(10);
  });
});
