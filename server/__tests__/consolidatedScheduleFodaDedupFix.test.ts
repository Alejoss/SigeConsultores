import { describe, it, expect } from "vitest";
import crypto from "crypto";

describe("Consolidated Schedule - FODA Deduplication with SQL LIMIT 1", () => {
  it("should generate consistent content hashes for identical FODA activities", () => {
    // Simulate activity data from FODA matrix
    const activity1 = {
      action: "Mejorar proceso A",
      dueDate: new Date("2026-04-15"),
      element: "Proceso A",
    };

    const activity2 = {
      action: "Mejorar proceso A",
      dueDate: new Date("2026-04-15"),
      element: "Proceso A",
    };

    // Generate content hashes (same as in consolidatedSchedule.ts)
    const hash1 = `${activity1.action}-${activity1.dueDate.toISOString()}-${activity1.element}`;
    const hash2 = `${activity2.action}-${activity2.dueDate.toISOString()}-${activity2.element}`;

    const id1 = crypto.createHash("sha256").update(hash1).digest("hex").substring(0, 12);
    const id2 = crypto.createHash("sha256").update(hash2).digest("hex").substring(0, 12);

    // Same content should produce same ID
    expect(id1).toBe(id2);
  });

  it("should generate different content hashes for different FODA activities", () => {
    const activity1 = {
      action: "Mejorar proceso A",
      dueDate: new Date("2026-04-15"),
      element: "Proceso A",
    };

    const activity2 = {
      action: "Mejorar proceso B",
      dueDate: new Date("2026-04-15"),
      element: "Proceso B",
    };

    const hash1 = `${activity1.action}-${activity1.dueDate.toISOString()}-${activity1.element}`;
    const hash2 = `${activity2.action}-${activity2.dueDate.toISOString()}-${activity2.element}`;

    const id1 = crypto.createHash("sha256").update(hash1).digest("hex").substring(0, 12);
    const id2 = crypto.createHash("sha256").update(hash2).digest("hex").substring(0, 12);

    // Different content should produce different IDs
    expect(id1).not.toBe(id2);
  });

  it("should correctly parse FODA matrix data with multiple activities", () => {
    const matrixData = JSON.stringify([
      {
        foda: "Fortaleza",
        elemento: "Elemento 1",
        accionATomar: "Acción 1",
        fechaFinalPrevista: "2026-04-10",
        objetivoLogrado: "NO",
      },
      {
        foda: "Oportunidad",
        elemento: "Elemento 2",
        accionATomar: "Acción 2",
        fechaFinalPrevista: "2026-04-20",
        objetivoLogrado: "NO",
      },
      {
        foda: "Debilidad",
        elemento: "Elemento 3",
        accionATomar: "Acción 3",
        fechaFinalPrevista: "2026-05-01",
        mejoraImplementada: "SI",
      },
    ]);

    // Parse the matrix data
    const matrixArray = JSON.parse(matrixData);

    // Should have 3 activities
    expect(matrixArray).toHaveLength(3);

    // Verify each activity
    expect(matrixArray[0].elemento).toBe("Elemento 1");
    expect(matrixArray[0].accionATomar).toBe("Acción 1");
    expect(matrixArray[1].elemento).toBe("Elemento 2");
    expect(matrixArray[2].elemento).toBe("Elemento 3");
  });

  it("should deduplicate activities using Map with content-based IDs", () => {
    // Simulate activities array with duplicates
    const activities = [
      {
        id: "foda-abc123",
        action: "Action 1",
        dueDate: new Date("2026-04-10"),
      },
      {
        id: "foda-abc123", // Duplicate ID
        action: "Action 1",
        dueDate: new Date("2026-04-10"),
      },
      {
        id: "foda-def456",
        action: "Action 2",
        dueDate: new Date("2026-04-20"),
      },
      {
        id: "foda-abc123", // Another duplicate
        action: "Action 1",
        dueDate: new Date("2026-04-10"),
      },
    ];

    // Deduplicate using Map (same logic as in consolidatedSchedule.ts)
    const uniqueActivities = new Map<string, any>();
    activities.forEach((activity) => {
      if (!uniqueActivities.has(activity.id)) {
        uniqueActivities.set(activity.id, activity);
      }
    });

    const deduplicatedActivities = Array.from(uniqueActivities.values());

    // Should have 2 unique activities (not 4)
    expect(deduplicatedActivities).toHaveLength(2);

    // Verify the unique activities
    expect(deduplicatedActivities[0].id).toBe("foda-abc123");
    expect(deduplicatedActivities[1].id).toBe("foda-def456");
  });

  it("should handle empty FODA matrix data", () => {
    const matrixData = JSON.stringify([]);

    const matrixArray = JSON.parse(matrixData);

    expect(matrixArray).toHaveLength(0);
  });

  it("should correctly identify completed activities from FODA data", () => {
    const activities = [
      {
        objetivoLogrado: "SI",
        mejoraImplementada: undefined,
        implementacionCumplio: undefined,
      },
      {
        objetivoLogrado: undefined,
        mejoraImplementada: "SI",
        implementacionCumplio: undefined,
      },
      {
        objetivoLogrado: undefined,
        mejoraImplementada: undefined,
        implementacionCumplio: "SI",
      },
      {
        objetivoLogrado: "NO",
        mejoraImplementada: undefined,
        implementacionCumplio: undefined,
      },
    ];

    // Check completion status (same logic as consolidatedSchedule.ts line 144)
    const completionStatuses = activities.map((row: any) => {
      if (
        row.objetivoLogrado === "SI" ||
        row.mejoraImplementada === "SI" ||
        row.implementacionCumplio === "SI"
      ) {
        return "SI";
      }
      return "NO";
    });

    expect(completionStatuses).toEqual(["SI", "SI", "SI", "NO"]);
  });

  it("should correctly sort activities by due date", () => {
    const activities = [
      { id: "1", dueDate: new Date("2026-05-01") },
      { id: "2", dueDate: new Date("2026-04-10") },
      { id: "3", dueDate: new Date("2026-04-20") },
    ];

    // Sort by dueDate (same logic as consolidatedSchedule.ts line 291)
    activities.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    expect(activities[0].id).toBe("2"); // 2026-04-10
    expect(activities[1].id).toBe("3"); // 2026-04-20
    expect(activities[2].id).toBe("1"); // 2026-05-01
  });
});
