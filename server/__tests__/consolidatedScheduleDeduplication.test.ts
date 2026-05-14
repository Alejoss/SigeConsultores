import { describe, it, expect } from "vitest";
import crypto from "crypto";

// Helper function to generate content-based ID (same as in consolidatedSchedule router)
function generateContentId(action: string, dueDate: Date, element: string): string {
  const contentHash = `${action}-${dueDate.toISOString()}-${element}`;
  return `foda-${crypto.createHash('sha256').update(contentHash).digest('hex').substring(0, 12)}`;
}

describe("Consolidated Schedule Deduplication", () => {
  it("should generate same ID for identical content", () => {
    const date = new Date("2026-04-12");
    const action = "Implementar proceso de firmas";
    const element = "Bouquetería";

    // Generate ID twice with same content
    const id1 = generateContentId(action, date, element);
    const id2 = generateContentId(action, date, element);

    // Should be identical
    expect(id1).toBe(id2);
  });

  it("should generate different IDs for different content", () => {
    const date = new Date("2026-04-12");
    const id1 = generateContentId("Action 1", date, "Element 1");
    const id2 = generateContentId("Action 2", date, "Element 1");
    const id3 = generateContentId("Action 1", new Date("2026-04-13"), "Element 1");
    const id4 = generateContentId("Action 1", date, "Element 2");

    // All should be different
    expect(new Set([id1, id2, id3, id4]).size).toBe(4);
  });

  it("should deduplicate activities with same ID", () => {
    // Simulate the deduplication logic with content-based IDs
    interface Activity {
      id: string;
      name: string;
      date: Date;
    }

    const contentId1 = generateContentId("Action 1", new Date("2026-04-12"), "Element 1");
    const contentId2 = generateContentId("Action 2", new Date("2026-04-13"), "Element 2");
    const contentId3 = generateContentId("Action 3", new Date("2026-04-14"), "Element 3");

    const activities: Activity[] = [
      { id: contentId1, name: "Element 1", date: new Date("2026-04-12") },
      { id: contentId2, name: "Element 2", date: new Date("2026-04-13") },
      { id: contentId1, name: "Element 1 (duplicate)", date: new Date("2026-04-12") }, // Same ID
      { id: contentId3, name: "Element 3", date: new Date("2026-04-14") },
      { id: contentId2, name: "Element 2 (duplicate)", date: new Date("2026-04-13") }, // Same ID
    ];

    // Apply deduplication logic (keep first occurrence)
    const uniqueActivities = new Map<string, Activity>();
    activities.forEach(activity => {
      if (!uniqueActivities.has(activity.id)) {
        uniqueActivities.set(activity.id, activity);
      }
    });

    const deduplicatedActivities = Array.from(uniqueActivities.values());

    // Verify results - should have 3 unique activities
    expect(deduplicatedActivities.length).toBe(3);
    expect(deduplicatedActivities.map(a => a.id)).toEqual(
      expect.arrayContaining([contentId1, contentId2, contentId3])
    );
  });

  it("should preserve first occurrence when deduplicating", () => {
    interface Activity {
      id: string;
      name: string;
      priority: number;
    }

    const contentId = generateContentId("Action", new Date("2026-04-12"), "Element");
    const activities: Activity[] = [
      { id: contentId, name: "Task A", priority: 1 },
      { id: contentId, name: "Task A (modified)", priority: 2 },
    ];

    const uniqueActivities = new Map<string, Activity>();
    activities.forEach(activity => {
      if (!uniqueActivities.has(activity.id)) {
        uniqueActivities.set(activity.id, activity);
      }
    });

    const deduplicatedActivities = Array.from(uniqueActivities.values());

    // Should keep the first occurrence
    expect(deduplicatedActivities.length).toBe(1);
    expect(deduplicatedActivities[0].priority).toBe(1);
  });

  it("should handle empty activity list", () => {
    const activities: any[] = [];

    const uniqueActivities = new Map<string, any>();
    activities.forEach(activity => {
      uniqueActivities.set(activity.id, activity);
    });

    const deduplicatedActivities = Array.from(uniqueActivities.values());

    expect(deduplicatedActivities.length).toBe(0);
  });

  it("should handle list with no duplicates", () => {
    interface Activity {
      id: string;
      name: string;
    }

    const id1 = generateContentId("Action 1", new Date("2026-04-12"), "Element 1");
    const id2 = generateContentId("Action 2", new Date("2026-04-13"), "Element 2");
    const id3 = generateContentId("Action 3", new Date("2026-04-14"), "Element 3");

    const activities: Activity[] = [
      { id: id1, name: "Activity 1" },
      { id: id2, name: "Activity 2" },
      { id: id3, name: "Activity 3" },
    ];

    const uniqueActivities = new Map<string, Activity>();
    activities.forEach(activity => {
      if (!uniqueActivities.has(activity.id)) {
        uniqueActivities.set(activity.id, activity);
      }
    });

    const deduplicatedActivities = Array.from(uniqueActivities.values());

    expect(deduplicatedActivities.length).toBe(3);
    expect(deduplicatedActivities).toEqual(activities);
  });

  it("should sort activities by date after deduplication", () => {
    interface Activity {
      id: string;
      date: Date;
    }

    const id1 = generateContentId("Action 1", new Date("2026-04-12"), "Element 1");
    const id2 = generateContentId("Action 2", new Date("2026-04-13"), "Element 2");
    const id3 = generateContentId("Action 3", new Date("2026-04-14"), "Element 3");

    const activities: Activity[] = [
      { id: id3, date: new Date("2026-04-14") },
      { id: id1, date: new Date("2026-04-12") },
      { id: id2, date: new Date("2026-04-13") },
    ];

    const uniqueActivities = new Map<string, Activity>();
    activities.forEach(activity => {
      if (!uniqueActivities.has(activity.id)) {
        uniqueActivities.set(activity.id, activity);
      }
    });

    const deduplicatedActivities = Array.from(uniqueActivities.values());
    deduplicatedActivities.sort((a, b) => a.date.getTime() - b.date.getTime());

    expect(deduplicatedActivities[0].id).toBe(id1);
    expect(deduplicatedActivities[1].id).toBe(id2);
    expect(deduplicatedActivities[2].id).toBe(id3);
  });
});
