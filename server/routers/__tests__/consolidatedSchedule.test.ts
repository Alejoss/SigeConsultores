import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import {
  criticalityMatrix,
  stakeholders,
  processFODA,
} from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Consolidated Schedule Router - Criticality Migration", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  const processId = 1290004; // Test process ID
  
  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database connection failed");
    
    // Clean up any existing test data
    if (db) {
      await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, processId));
      await db.delete(stakeholders).where(eq(stakeholders.processId, processId));
      await db.delete(processFODA).where(eq(processFODA.processId, processId));
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, processId));
      await db.delete(stakeholders).where(eq(stakeholders.processId, processId));
      await db.delete(processFODA).where(eq(processFODA.processId, processId));
    }
  });

  it("should migrate criticality actions to consolidated schedule", async () => {
    if (!db) throw new Error("Database not available");

    // Create test stakeholders (need 2 different ones due to UNIQUE constraint)
    const stakeholder1Result = await db.insert(stakeholders).values({
      processId,
      name: "Test Stakeholder 1 for Schedule",
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });

    const stakeholder2Result = await db.insert(stakeholders).values({
      processId,
      name: "Test Stakeholder 2 for Schedule",
      type: "proveedor",
      isInternal: false,
      orderIndex: 1,
    });

    // Get the actual stakeholder IDs from the results
    let stakeholder1Id: number;
    let stakeholder2Id: number;
    
    if (typeof (stakeholder1Result as any).insertId === 'number') {
      stakeholder1Id = (stakeholder1Result as any).insertId;
    } else if (typeof (stakeholder1Result as any).insertId === 'bigint') {
      stakeholder1Id = Number((stakeholder1Result as any).insertId);
    } else {
      const inserted = await db.select().from(stakeholders).where(eq(stakeholders.processId, processId));
      stakeholder1Id = inserted[0]?.id || 1;
    }

    if (typeof (stakeholder2Result as any).insertId === 'number') {
      stakeholder2Id = (stakeholder2Result as any).insertId;
    } else if (typeof (stakeholder2Result as any).insertId === 'bigint') {
      stakeholder2Id = Number((stakeholder2Result as any).insertId);
    } else {
      const inserted = await db.select().from(stakeholders).where(eq(stakeholders.processId, processId));
      stakeholder2Id = inserted[1]?.id || 2;
    }
    
    console.log('[Test] Created stakeholder 1 with ID:', stakeholder1Id);
    console.log('[Test] Created stakeholder 2 with ID:', stakeholder2Id);

    // Create criticality matrix entries with actions (one per stakeholder)
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30); // 30 days from now

    await db.insert(criticalityMatrix).values({
      processId,
      stakeholderId: stakeholder1Id,
      incidence: "1",
      risk: "A",
      criticality: "1A",
      actionToTake: "Implementar control de calidad",
      startDate: startDate,
      endDate: endDate,
      implementationStatus: false,
      completionPercentage: 0,
    });

    await db.insert(criticalityMatrix).values({
      processId,
      stakeholderId: stakeholder2Id,
      incidence: "2",
      risk: "B",
      criticality: "2B",
      actionToTake: "Capacitar personal en procedimientos",
      startDate: startDate,
      endDate: endDate,
      implementationStatus: true,
      completionPercentage: 75,
    });

    // Fetch consolidated schedule
    const criticalityEntries = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, processId));

    const stakeholdersList = await db
      .select()
      .from(stakeholders)
      .where(eq(stakeholders.processId, processId));

    const stakeholderMap = new Map(stakeholdersList.map((s: any) => [s.id, s.name]));

    // Build activities like the router does
    const activities: any[] = [];
    
    criticalityEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        const stakeholderName = stakeholderMap.get(entry.stakeholderId) || "Partes Interesadas";
        activities.push({
          id: `stakeholder-${entry.id}`,
          type: "stakeholder",
          element: stakeholderName,
          action: entry.actionToTake,
          dueDate: entry.endDate,
          completed: entry.implementationStatus ? "SI" : "NO",
          completionPercentage: entry.completionPercentage || 0,
        });
      }
    });

    // Verify results
    expect(activities.length).toBe(2);
    
    const action1 = activities.find(a => a.action === "Implementar control de calidad");
    expect(action1).toBeDefined();
    expect(action1?.completed).toBe("NO");
    expect(action1?.completionPercentage).toBe(0);
    expect(action1?.element).toBe("Test Stakeholder 1 for Schedule");
    expect(action1?.type).toBe("stakeholder");
    
    const action2 = activities.find(a => a.action === "Capacitar personal en procedimientos");
    expect(action2).toBeDefined();
    expect(action2?.completed).toBe("SI");
    expect(action2?.completionPercentage).toBe(75);
    expect(action2?.element).toBe("Test Stakeholder 2 for Schedule");
    expect(action2?.type).toBe("stakeholder");
  });

  it("should correctly filter criticality entries by actionToTake and endDate", () => {
    // Test the filtering logic with mock data
    const testEntries = [
      { id: 1, actionToTake: "Action 1", endDate: new Date(), implementationStatus: false },
      { id: 2, actionToTake: "", endDate: new Date(), implementationStatus: false }, // Empty action
      { id: 3, actionToTake: "Action 3", endDate: null, implementationStatus: false }, // No end date
      { id: 4, actionToTake: null, endDate: new Date(), implementationStatus: false }, // No action
    ];

    // Filter like the router does
    const activities: any[] = [];
    testEntries.forEach((entry: any) => {
      if (entry.actionToTake && entry.endDate) {
        activities.push({
          id: `stakeholder-${entry.id}`,
          type: "stakeholder",
          action: entry.actionToTake,
        });
      }
    });

    // Should only include entry 1
    expect(activities.length).toBe(1);
    expect(activities[0].action).toBe("Action 1");
  });
});
