import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../db';
import { processTacticalObjectives } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Tactical Objectives - Fixed Schema', () => {
  let db: any;
  const testProcessId = 999;
  const testObjectiveId = 999001;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      console.log('Database not available, skipping tests');
      return;
    }
  });

  it('should create a tactical objective with only existing fields', async () => {
    if (!db) return;

    try {
      // Insert a test objective with only fields that exist in the BD
      await db.insert(processTacticalObjectives).values({
        id: testObjectiveId,
        processId: testProcessId,
        name: 'Test Objective - Fixed',
        description: 'Test description',
        target: '100%',
        responsible: 'Manager',
        deadline: new Date(),
        subprocess: 'Test Subprocess',
        strategicObjective: 'Strategic Goal',
        strategicObjectiveDescription: 'Strategic description',
        planningData: null,
        completed: 'NO',
      });

      // Verify it was created
      const result = await db
        .select()
        .from(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, testObjectiveId))
        .limit(1);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Test Objective - Fixed');
      expect(result[0].completed).toBe('NO');
    } catch (err) {
      console.error('Error:', err);
      throw err;
    }
  });

  it('should update a tactical objective with only existing fields', async () => {
    if (!db) return;

    try {
      // Update the test objective
      await db
        .update(processTacticalObjectives)
        .set({
          name: 'Test Objective - Updated',
          description: 'Updated description',
          completed: 'SI',
        })
        .where(eq(processTacticalObjectives.id, testObjectiveId));

      // Verify it was updated
      const result = await db
        .select()
        .from(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, testObjectiveId))
        .limit(1);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Test Objective - Updated');
      expect(result[0].completed).toBe('SI');
    } catch (err) {
      console.error('Error:', err);
      throw err;
    }
  });

  afterAll(async () => {
    if (!db) return;

    try {
      // Clean up test data
      await db
        .delete(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, testObjectiveId));
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  });
});
