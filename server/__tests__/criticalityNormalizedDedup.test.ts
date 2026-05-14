import { describe, it, expect } from "vitest";
import crypto from "crypto";

describe("Consolidated Schedule - Normalized Criticality Deduplication", () => {
  it("should normalize actionToTake with different spacing and case", () => {
    const actions = [
      "Solicitar a cada finca que firme en la hoja de entrega la cantidad y tipo de flor que deja en Pos cosecha La Esperanza",
      "solicitar a cada finca que firme en la hoja de entrega la cantidad y tipo de flor que deja en pos cosecha la esperanza",
      "Solicitar  a  cada  finca  que  firme  en  la  hoja  de  entrega  la  cantidad  y  tipo  de  flor  que  deja  en  Pos  cosecha  La  Esperanza",
      "SOLICITAR A CADA FINCA QUE FIRME EN LA HOJA DE ENTREGA LA CANTIDAD Y TIPO DE FLOR QUE DEJA EN POS COSECHA LA ESPERANZA",
    ];

    const normalized = actions.map((action) =>
      action.trim().toLowerCase().replace(/\s+/g, ' ')
    );

    // All should normalize to the same value
    expect(normalized[0]).toBe(normalized[1]);
    expect(normalized[1]).toBe(normalized[2]);
    expect(normalized[2]).toBe(normalized[3]);
  });

  it("should deduplicate entries with different startDate but same endDate", () => {
    const criticalityEntries = [
      {
        id: 1,
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme en la hoja de entrega la cantidad y tipo de flor",
        startDate: "2026-03-01",
        endDate: "2026-04-30",
      },
      {
        id: 2,
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme en la hoja de entrega la cantidad y tipo de flor",
        startDate: "2026-03-15", // Different startDate
        endDate: "2026-04-30", // Same endDate
      },
      {
        id: 3,
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme en la hoja de entrega la cantidad y tipo de flor",
        startDate: "2026-04-01", // Different startDate
        endDate: "2026-04-30", // Same endDate
      },
    ];

    // Apply deduplication with normalized action and endDate only
    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const normalizedAction = entry.actionToTake
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');

        // Key: stakeholderId | normalizedAction | endDate (NO startDate)
        const uniqueKey = `${entry.stakeholderId}|${normalizedAction}|${entry.endDate}`;

        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        }
      }
    });

    // Should have only 1 unique entry (all have same stakeholder, action, and endDate)
    expect(uniqueCriticalityMap.size).toBe(1);

    // Should be the first occurrence
    const entry = Array.from(uniqueCriticalityMap.values())[0];
    expect(entry.id).toBe(1);
  });

  it("should generate consistent IDs for normalized actions", () => {
    const entry1 = {
      stakeholderId: 1,
      actionToTake: "Solicitar a cada finca que firme en la hoja de entrega",
      endDate: "2026-04-30",
    };

    const entry2 = {
      stakeholderId: 1,
      actionToTake: "solicitar  a  cada  finca  que  firme  en  la  hoja  de  entrega", // Different case and spacing
      endDate: "2026-04-30",
    };

    // Normalize both
    const normalize = (action: string) =>
      action.trim().toLowerCase().replace(/\s+/g, ' ');

    const normalizedAction1 = normalize(entry1.actionToTake);
    const normalizedAction2 = normalize(entry2.actionToTake);

    // Generate IDs
    const contentHash1 = `${entry1.stakeholderId}-${normalizedAction1}-${entry1.endDate}`;
    const contentId1 = crypto.createHash("sha256").update(contentHash1).digest("hex").substring(0, 12);

    const contentHash2 = `${entry2.stakeholderId}-${normalizedAction2}-${entry2.endDate}`;
    const contentId2 = crypto.createHash("sha256").update(contentHash2).digest("hex").substring(0, 12);

    // Should generate the same ID
    expect(contentId1).toBe(contentId2);
  });

  it("should handle 3 unique stakeholders with multiple duplicates each", () => {
    // Simulate 3 unique stakeholders with ~23 duplicates each = 70 total
    const criticalityEntries = [
      // Fincas - 23 duplicates
      ...Array(23).fill({
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme en la hoja de entrega la cantidad y tipo de flor",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
      }),
      // Postcosecha Patoa - 24 duplicates
      ...Array(24).fill({
        stakeholderId: 2,
        actionToTake: "Implementar nota de entrega en flor de paso",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
      }),
      // Bouquetera - 23 duplicates
      ...Array(23).fill({
        stakeholderId: 3,
        actionToTake: "Implementar proceso de firma en la guía de remisión para garantizar cantidad y tipo de producto",
        startDate: "2026-03-10",
        endDate: "2026-04-30",
      }),
    ];

    // Apply deduplication
    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const normalizedAction = entry.actionToTake
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');

        const uniqueKey = `${entry.stakeholderId}|${normalizedAction}|${entry.endDate}`;

        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        }
      }
    });

    // Should have only 3 unique entries (one per stakeholder)
    expect(uniqueCriticalityMap.size).toBe(3);

    // Verify each stakeholder is present
    const entries = Array.from(uniqueCriticalityMap.values());
    const stakeholderIds = entries.map((e) => e.stakeholderId).sort();
    expect(stakeholderIds).toEqual([1, 2, 3]);
  });

  it("should preserve original actionToTake in output while using normalized for deduplication", () => {
    const criticalityEntries = [
      {
        id: 1,
        stakeholderId: 1,
        actionToTake: "Solicitar  a  cada  finca  que  firme", // Original with extra spaces
        startDate: "2026-03-10",
        endDate: "2026-04-30",
      },
      {
        id: 2,
        stakeholderId: 1,
        actionToTake: "Solicitar a cada finca que firme", // Normalized version
        startDate: "2026-03-15",
        endDate: "2026-04-30",
      },
    ];

    const uniqueCriticalityMap = new Map<string, any>();

    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const normalizedAction = entry.actionToTake
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');

        const uniqueKey = `${entry.stakeholderId}|${normalizedAction}|${entry.endDate}`;

        if (!uniqueCriticalityMap.has(uniqueKey)) {
          uniqueCriticalityMap.set(uniqueKey, entry);
        }
      }
    });

    // Should have 1 unique entry
    expect(uniqueCriticalityMap.size).toBe(1);

    // The stored entry should preserve original actionToTake
    const entry = Array.from(uniqueCriticalityMap.values())[0];
    expect(entry.actionToTake).toBe("Solicitar  a  cada  finca  que  firme"); // Original preserved
  });
});
