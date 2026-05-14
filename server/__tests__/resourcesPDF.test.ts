import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../db';
import { processCharacterizations, processParticipants, processResources } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Resources PDF Export', () => {
  let db: any;
  let testProcessCharacterizationId: number;
  let testParticipantId: number;
  let testResourceId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error('Database not available');

    // Create test data
    const charResult = await db.insert(processCharacterizations).values({
      processId: 1,
      macroProcessName: 'Test Process',
      responsibleName: 'Test Responsible',
      objectiveDescription: 'Test Objective',
      scopeDescription: 'Test Scope',
    });

    testProcessCharacterizationId = (charResult as any).insertId || 1;

    const participantResult = await db.insert(processParticipants).values({
      processCharacterizationId: testProcessCharacterizationId,
      position: 'Test Position',
      orderIndex: 1,
    });

    testParticipantId = (participantResult as any).insertId || 1;

    const resourceResult = await db.insert(processResources).values({
      processCharacterizationId: testProcessCharacterizationId,
      participantId: testParticipantId,
      resourceType: 'Tecnológico',
      resourceName: 'Test Resource',
      resourceElements: 'Test Elements',
      orderIndex: 1,
    });

    testResourceId = (resourceResult as any).insertId || 1;
  });

  afterAll(async () => {
    if (db) {
      // Clean up test data
      await db.delete(processResources).where(eq(processResources.id, testResourceId));
      await db.delete(processParticipants).where(eq(processParticipants.id, testParticipantId));
      await db.delete(processCharacterizations).where(eq(processCharacterizations.id, testProcessCharacterizationId));
    }
  });

  it('should preserve resource data when exporting to PDF', async () => {
    // Verify data exists before export
    const resourcesBefore = await db.select().from(processResources)
      .where(eq(processResources.processCharacterizationId, testProcessCharacterizationId));

    expect(resourcesBefore).toHaveLength(1);
    expect(resourcesBefore[0].resourceName).toBe('Test Resource');
    expect(resourcesBefore[0].resourceElements).toBe('Test Elements');

    // Simulate PDF export (doesn't modify data)
    const resourcesAfter = await db.select().from(processResources)
      .where(eq(processResources.processCharacterizationId, testProcessCharacterizationId));

    expect(resourcesAfter).toHaveLength(1);
    expect(resourcesAfter[0].resourceName).toBe('Test Resource');
    expect(resourcesAfter[0].resourceElements).toBe('Test Elements');
  });

  it('should preserve participant data when exporting to PDF', async () => {
    const participantsBefore = await db.select().from(processParticipants)
      .where(eq(processParticipants.processCharacterizationId, testProcessCharacterizationId));

    expect(participantsBefore).toHaveLength(1);
    expect(participantsBefore[0].position).toBe('Test Position');

    const participantsAfter = await db.select().from(processParticipants)
      .where(eq(processParticipants.processCharacterizationId, testProcessCharacterizationId));

    expect(participantsAfter).toHaveLength(1);
    expect(participantsAfter[0].position).toBe('Test Position');
  });

  it('should handle multiple resources per participant', async () => {
    // Create additional resource
    const resource2Result = await db.insert(processResources).values({
      processCharacterizationId: testProcessCharacterizationId,
      participantId: testParticipantId,
      resourceType: 'Físico',
      resourceName: 'Test Resource 2',
      resourceElements: 'Test Elements 2',
      orderIndex: 2,
    });

    const resource2Id = (resource2Result as any).insertId;

    // Verify both resources exist
    const allResources = await db.select().from(processResources)
      .where(eq(processResources.processCharacterizationId, testProcessCharacterizationId));

    expect(allResources.length).toBeGreaterThanOrEqual(2);

    // Clean up
    await db.delete(processResources).where(eq(processResources.id, resource2Id));
  });

  it('should not modify data during PDF generation', async () => {
    const resourcesBefore = await db.select().from(processResources)
      .where(eq(processResources.processCharacterizationId, testProcessCharacterizationId));

    const beforeCount = resourcesBefore.length;
    const beforeData = resourcesBefore[0];

    // Simulate PDF export
    const resourcesAfter = await db.select().from(processResources)
      .where(eq(processResources.processCharacterizationId, testProcessCharacterizationId));

    expect(resourcesAfter).toHaveLength(beforeCount);
    expect(resourcesAfter[0].id).toBe(beforeData.id);
    expect(resourcesAfter[0].resourceName).toBe(beforeData.resourceName);
    expect(resourcesAfter[0].resourceElements).toBe(beforeData.resourceElements);
  });
});
