import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb } from '../../db';
import { criticalityMatrix, stakeholders } from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

describe('Criticality Matrix - getWithStakeholders', () => {
  let db: any;
  const testProcessId = 60001; // Using Agrogana test process
  let testStakeholderIds: number[] = [];

  beforeEach(async () => {
    db = await getDb();
    if (!db) {
      throw new Error('Database not available');
    }

    // Clean up any existing test data first
    await db.delete(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, testProcessId));
    
    await db.delete(stakeholders)
      .where(eq(stakeholders.processId, testProcessId));

    // Create test stakeholders
    const stakeholderNames = ['Stakeholder A', 'Stakeholder B', 'Stakeholder C'];
    
    for (let i = 0; i < stakeholderNames.length; i++) {
      await db.insert(stakeholders).values({
        processId: testProcessId,
        name: stakeholderNames[i],
        type: i % 2 === 0 ? 'cliente' : 'proveedor',
        isInternal: i === 0,
        orderIndex: i,
      });
    }

    // Get the inserted stakeholder IDs
    const stakeholderRecords = await db.select().from(stakeholders)
      .where(eq(stakeholders.processId, testProcessId));
    
    testStakeholderIds = stakeholderRecords.map((s: any) => s.id);
  });

  afterEach(async () => {
    if (!db) return;

    // Clean up test data
    await db.delete(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, testProcessId));
    
    await db.delete(stakeholders)
      .where(eq(stakeholders.processId, testProcessId));
  });

  it('should retrieve criticality data with stakeholder information via JOIN', async () => {
    if (testStakeholderIds.length === 0) {
      throw new Error('No test stakeholders created');
    }

    // Insert criticality data for first stakeholder
    await db.insert(criticalityMatrix).values({
      processId: testProcessId,
      stakeholderId: testStakeholderIds[0],
      incidence: '2',
      risk: 'A',
      criticality: '2A',
      existingDefenses: 'Test defenses',
      actionToTake: 'Test action',
      observations: 'Test observations',
    });

    // Insert criticality data for second stakeholder
    await db.insert(criticalityMatrix).values({
      processId: testProcessId,
      stakeholderId: testStakeholderIds[1],
      incidence: '3',
      risk: 'B',
      criticality: '3B',
      existingDefenses: 'Test defenses 2',
      actionToTake: 'Test action 2',
      observations: 'Test observations 2',
    });

    // Retrieve with JOIN (simulating getWithStakeholders procedure)
    const result = await db.select({
      id: criticalityMatrix.id,
      processId: criticalityMatrix.processId,
      stakeholderId: criticalityMatrix.stakeholderId,
      incidence: criticalityMatrix.incidence,
      risk: criticalityMatrix.risk,
      criticality: criticalityMatrix.criticality,
      existingDefenses: criticalityMatrix.existingDefenses,
      actionToTake: criticalityMatrix.actionToTake,
      observations: criticalityMatrix.observations,
      startDate: criticalityMatrix.startDate,
      endDate: criticalityMatrix.endDate,
      implementationStatus: criticalityMatrix.implementationStatus,
      completionPercentage: criticalityMatrix.completionPercentage,
      stakeholderName: stakeholders.name,
      stakeholderType: stakeholders.type,
      stakeholderIsInternal: stakeholders.isInternal,
    })
      .from(criticalityMatrix)
      .leftJoin(stakeholders, eq(criticalityMatrix.stakeholderId, stakeholders.id))
      .where(eq(criticalityMatrix.processId, testProcessId));

    expect(result).toHaveLength(2);
    
    // Verify first record
    expect(result[0].incidence).toBe('2');
    expect(result[0].risk).toBe('A');
    expect(result[0].criticality).toBe('2A');
    expect(result[0].stakeholderName).toBe('Stakeholder A');
    expect(result[0].stakeholderType).toBe('cliente');
    expect(result[0].existingDefenses).toBe('Test defenses');

    // Verify second record
    expect(result[1].incidence).toBe('3');
    expect(result[1].risk).toBe('B');
    expect(result[1].criticality).toBe('3B');
    expect(result[1].stakeholderName).toBe('Stakeholder B');
    expect(result[1].stakeholderType).toBe('proveedor');
    expect(result[1].existingDefenses).toBe('Test defenses 2');
  });

  it('should handle empty criticality data gracefully', async () => {
    // Query without any criticality data inserted
    const result = await db.select({
      id: criticalityMatrix.id,
      processId: criticalityMatrix.processId,
      stakeholderId: criticalityMatrix.stakeholderId,
      incidence: criticalityMatrix.incidence,
      risk: criticalityMatrix.risk,
      criticality: criticalityMatrix.criticality,
      stakeholderName: stakeholders.name,
      stakeholderType: stakeholders.type,
      stakeholderIsInternal: stakeholders.isInternal,
    })
      .from(criticalityMatrix)
      .leftJoin(stakeholders, eq(criticalityMatrix.stakeholderId, stakeholders.id))
      .where(eq(criticalityMatrix.processId, testProcessId));

    expect(result).toHaveLength(0);
  });

  it('should preserve all criticality fields when joining with stakeholders', async () => {
    if (testStakeholderIds.length === 0) {
      throw new Error('No test stakeholders created');
    }

    const startDate = new Date('2026-04-01');
    const endDate = new Date('2026-04-30');

    // Insert criticality data with all fields
    await db.insert(criticalityMatrix).values({
      processId: testProcessId,
      stakeholderId: testStakeholderIds[0],
      incidence: '1',
      risk: 'C',
      criticality: '1C',
      existingDefenses: 'Full defenses',
      actionToTake: 'Full action',
      observations: 'Full observations',
      startDate,
      endDate,
      implementationStatus: true,
      completionPercentage: 75,
    });

    // Retrieve with all fields
    const result = await db.select({
      id: criticalityMatrix.id,
      processId: criticalityMatrix.processId,
      stakeholderId: criticalityMatrix.stakeholderId,
      incidence: criticalityMatrix.incidence,
      risk: criticalityMatrix.risk,
      criticality: criticalityMatrix.criticality,
      existingDefenses: criticalityMatrix.existingDefenses,
      actionToTake: criticalityMatrix.actionToTake,
      observations: criticalityMatrix.observations,
      startDate: criticalityMatrix.startDate,
      endDate: criticalityMatrix.endDate,
      implementationStatus: criticalityMatrix.implementationStatus,
      completionPercentage: criticalityMatrix.completionPercentage,
      stakeholderName: stakeholders.name,
      stakeholderType: stakeholders.type,
      stakeholderIsInternal: stakeholders.isInternal,
    })
      .from(criticalityMatrix)
      .leftJoin(stakeholders, eq(criticalityMatrix.stakeholderId, stakeholders.id))
      .where(eq(criticalityMatrix.processId, testProcessId));

    expect(result).toHaveLength(1);
    expect(result[0].incidence).toBe('1');
    expect(result[0].risk).toBe('C');
    expect(result[0].criticality).toBe('1C');
    expect(result[0].existingDefenses).toBe('Full defenses');
    expect(result[0].actionToTake).toBe('Full action');
    expect(result[0].observations).toBe('Full observations');
    expect(result[0].implementationStatus).toBe(true);
    expect(result[0].completionPercentage).toBe(75);
    expect(result[0].stakeholderName).toBe('Stakeholder A');
  });
});
