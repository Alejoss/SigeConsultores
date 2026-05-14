import { describe, it, expect } from "vitest";
import crypto from "crypto";

describe("Consolidated Schedule - Final Criticality Deduplication (Action Only)", () => {
  it("should deduplicate entries with same stakeholder and action but different endDates", () => {
    const criticalityEntries = [
      {
        id: 1,
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme en la hoja de entrega",
        startDate: "2026-03-10",
        endDate: "2026-04-30", // April
      },
      {
        id: 2,
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme en la hoja de entrega",
        startDate: "2026-04-10",
        endDate: "2026-05-31", // May
      },
      {
        id: 3,
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme en la hoja de entrega",
        startDate: "2026-05-10",
        endDate: "2026-06-30", // June
      },
    ];

    // Apply deduplication with action only (no endDate in key)
    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const normalizedAction = entry.actionToTake
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');

        // Key: stakeholderId | normalizedAction (NO endDate)
        const uniqueKey = `${entry.stakeholderId}|${normalizedAction}`;

        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        } else {
          // Keep the entry with the latest endDate
          const existing = uniqueCriticalityMap.get(uniqueKey);
          const existingDate = new Date(existing.endDate).getTime();
          const currentDate = new Date(entry.endDate).getTime();
          if (currentDate > existingDate) {
            uniqueCriticalityMap.set(uniqueKey, entry);
          }
        }
      }
    });

    // Should have only 1 unique entry (all have same stakeholder and action)
    expect(uniqueCriticalityMap.size).toBe(1);

    // Should keep the entry with the latest endDate (June)
    const entry = Array.from(uniqueCriticalityMap.values())[0];
    expect(entry.id).toBe(3);
    expect(entry.endDate).toBe("2026-06-30");
  });

  it("should handle 3 unique stakeholders with multiple duplicates per month", () => {
    // Simulate 3 unique stakeholders, each with 3 duplicates (one per month)
    const criticalityEntries = [
      // Fincas - April, May, June
      {
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme",
        endDate: "2026-04-30",
      },
      {
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme",
        endDate: "2026-05-31",
      },
      {
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme",
        endDate: "2026-06-30",
      },
      // Postcosecha Patoa - April, May, June
      {
        stakeholderId: 2,
        actionToTake: "Implementar nota de entrega en flor de paso",
        endDate: "2026-04-30",
      },
      {
        stakeholderId: 2,
        actionToTake: "Implementar nota de entrega en flor de paso",
        endDate: "2026-05-31",
      },
      {
        stakeholderId: 2,
        actionToTake: "Implementar nota de entrega en flor de paso",
        endDate: "2026-06-30",
      },
      // Bouquetera - April, May, June
      {
        stakeholderId: 3,
        actionToTake: "Implementar proceso de firma en la guía de remisión",
        endDate: "2026-04-30",
      },
      {
        stakeholderId: 3,
        actionToTake: "Implementar proceso de firma en la guía de remisión",
        endDate: "2026-05-31",
      },
      {
        stakeholderId: 3,
        actionToTake: "Implementar proceso de firma en la guía de remisión",
        endDate: "2026-06-30",
      },
    ];

    // Apply deduplication
    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const normalizedAction = entry.actionToTake
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');

        const uniqueKey = `${entry.stakeholderId}|${normalizedAction}`;

        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        } else {
          const existing = uniqueCriticalityMap.get(uniqueKey);
          const existingDate = new Date(existing.endDate).getTime();
          const currentDate = new Date(entry.endDate).getTime();
          if (currentDate > existingDate) {
            uniqueCriticalityMap.set(uniqueKey, entry);
          }
        }
      }
    });

    // Should have only 3 unique entries (one per stakeholder)
    expect(uniqueCriticalityMap.size).toBe(3);

    // Each should have the latest endDate (June)
    const entries = Array.from(uniqueCriticalityMap.values());
    entries.forEach((entry) => {
      expect(entry.endDate).toBe("2026-06-30");
    });

    // Verify each stakeholder is present
    const stakeholderIds = entries.map((e) => e.stakeholderId).sort();
    expect(stakeholderIds).toEqual([1, 2, 3]);
  });

  it("should generate consistent IDs based on stakeholder and action only", () => {
    const entry1 = {
      stakeholderId: 1,
      actionToTake: "Solicitar a cada finca que firme",
      endDate: "2026-04-30",
    };

    const entry2 = {
      stakeholderId: 1,
      actionToTake: "Solicitar a cada finca que firme",
      endDate: "2026-06-30", // Different endDate
    };

    // Generate IDs (without endDate)
    const normalize = (action: string) =>
      action.trim().toLowerCase().replace(/\s+/g, ' ');

    const normalizedAction1 = normalize(entry1.actionToTake);
    const contentHash1 = `${entry1.stakeholderId}-${normalizedAction1}`;
    const contentId1 = crypto.createHash("sha256").update(contentHash1).digest("hex").substring(0, 12);

    const normalizedAction2 = normalize(entry2.actionToTake);
    const contentHash2 = `${entry2.stakeholderId}-${normalizedAction2}`;
    const contentId2 = crypto.createHash("sha256").update(contentHash2).digest("hex").substring(0, 12);

    // Should generate the same ID (endDate doesn't affect ID)
    expect(contentId1).toBe(contentId2);
  });

  it("should keep the latest endDate when multiple entries exist", () => {
    const criticalityEntries = [
      {
        id: 1,
        stakeholderId: 1,
        actionToTake: "Test action",
        endDate: "2026-04-30",
      },
      {
        id: 2,
        stakeholderId: 1,
        actionToTake: "Test action",
        endDate: "2026-05-15", // Earlier than next
      },
      {
        id: 3,
        stakeholderId: 1,
        actionToTake: "Test action",
        endDate: "2026-06-30", // Latest
      },
      {
        id: 4,
        stakeholderId: 1,
        actionToTake: "Test action",
        endDate: "2026-05-20", // Earlier than latest
      },
    ];

    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const normalizedAction = entry.actionToTake
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');

        const uniqueKey = `${entry.stakeholderId}|${normalizedAction}`;

        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        } else {
          const existing = uniqueCriticalityMap.get(uniqueKey);
          const existingDate = new Date(existing.endDate).getTime();
          const currentDate = new Date(entry.endDate).getTime();
          if (currentDate > existingDate) {
            uniqueCriticalityMap.set(uniqueKey, entry);
          }
        }
      }
    });

    // Should have 1 entry
    expect(uniqueCriticalityMap.size).toBe(1);

    // Should be the one with the latest endDate (id 3)
    const entry = Array.from(uniqueCriticalityMap.values())[0];
    expect(entry.id).toBe(3);
    expect(entry.endDate).toBe("2026-06-30");
  });

  it("should reduce 70 entries (3 stakeholders × 23 duplicates) to 3", () => {
    const criticalityEntries = [
      // Fincas - 23 duplicates with different dates
      ...Array(23).fill(null).map((_, i) => ({
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme",
        endDate: `2026-04-${String((i % 30) + 1).padStart(2, '0')}`,
      })),
      // Postcosecha Patoa - 24 duplicates with different dates
      ...Array(24).fill(null).map((_, i) => ({
        stakeholderId: 2,
        actionToTake: "Implementar nota de entrega en flor de paso",
        endDate: `2026-05-${String((i % 31) + 1).padStart(2, '0')}`,
      })),
      // Bouquetera - 23 duplicates with different dates
      ...Array(23).fill(null).map((_, i) => ({
        stakeholderId: 3,
        actionToTake: "Implementar proceso de firma en la guía de remisión",
        endDate: `2026-06-${String((i % 30) + 1).padStart(2, '0')}`,
      })),
    ];

    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const normalizedAction = entry.actionToTake
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');

        const uniqueKey = `${entry.stakeholderId}|${normalizedAction}`;

        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        } else {
          const existing = uniqueCriticalityMap.get(uniqueKey);
          const existingDate = new Date(existing.endDate).getTime();
          const currentDate = new Date(entry.endDate).getTime();
          if (currentDate > existingDate) {
            uniqueCriticalityMap.set(uniqueKey, entry);
          }
        }
      }
    });

    // Should reduce 70 to 3
    expect(criticalityEntries.length).toBe(70);
    expect(uniqueCriticalityMap.size).toBe(3);
  });
});
