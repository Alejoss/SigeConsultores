import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../../db';
import { processTacticalObjectives } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Tactical Planning Data Persistence', () => {
  let db: any;
  let testObjectiveId: number;

  beforeEach(async () => {
    db = await getDb();
    if (!db) {
      throw new Error('Database not available for testing');
    }

    // Create a test objective
    const result = await db.insert(processTacticalObjectives).values({
      processId: 999,
      name: 'Test Objective',
      description: 'Test Description',
      subprocess: 'Test Subprocess',
      strategicObjective: 'Test Strategic Objective',
      strategicObjectiveDescription: 'Test Strategic Description',
      responsible: 'Test Responsible',
      completed: 'NO',
    });

    // Get the inserted ID
    const objectives = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, 999));
    
    if (objectives.length > 0) {
      testObjectiveId = objectives[0].id;
    }
  });

  afterEach(async () => {
    if (db && testObjectiveId) {
      await db.delete(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, testObjectiveId));
    }
  });

  it('should save planning data to planningData column without overwriting strategicObjectiveDescription', async () => {
    const planningData = {
      category: 'Test Category',
      goal: 100,
      resultKeys: ['Key1', 'Key2', 'Key3'],
    };

    // Save planning data
    await db.update(processTacticalObjectives)
      .set({
        planningData: JSON.stringify(planningData),
        updatedAt: new Date(),
      })
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    // Retrieve and verify
    const updated = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    expect(updated).toHaveLength(1);
    const objective = updated[0];

    // Verify planningData was saved
    expect(objective.planningData).toBeDefined();
    const savedPlanning = JSON.parse(objective.planningData);
    expect(savedPlanning.category).toBe('Test Category');
    expect(savedPlanning.goal).toBe(100);
    expect(savedPlanning.resultKeys).toEqual(['Key1', 'Key2', 'Key3']);

    // Verify strategicObjectiveDescription was NOT overwritten
    expect(objective.strategicObjectiveDescription).toBe('Test Strategic Description');
  });

  it('should load planning data from planningData column correctly', async () => {
    const planningData = {
      category: 'Planning Category',
      goal: 250,
      resultKeys: ['Result1', 'Result2'],
    };

    // Save planning data
    await db.update(processTacticalObjectives)
      .set({
        planningData: JSON.stringify(planningData),
      })
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    // Load and verify
    const objectives = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, 999));

    expect(objectives).toHaveLength(1);
    const objective = objectives[0];

    // Parse planning data
    const loadedPlanning = objective.planningData 
      ? JSON.parse(objective.planningData)
      : { category: '', goal: 0, resultKeys: [] };

    expect(loadedPlanning.category).toBe('Planning Category');
    expect(loadedPlanning.goal).toBe(250);
    expect(loadedPlanning.resultKeys).toEqual(['Result1', 'Result2']);
  });

  it('should handle empty planningData gracefully', async () => {
    // Don't set planningData, leave it null
    const objectives = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    expect(objectives).toHaveLength(1);
    const objective = objectives[0];

    // Should handle null planningData
    const loadedPlanning = objective.planningData 
      ? JSON.parse(objective.planningData)
      : { category: '', goal: 0, resultKeys: [] };

    expect(loadedPlanning.category).toBe('');
    expect(loadedPlanning.goal).toBe(0);
    expect(loadedPlanning.resultKeys).toEqual([]);
  });

  it('should preserve both strategicObjectiveDescription and planningData independently', async () => {
    const strategicDesc = 'Original Strategic Description';
    const planningData = {
      category: 'Independent Category',
      goal: 500,
      resultKeys: ['Independent1'],
    };

    // Update both fields
    await db.update(processTacticalObjectives)
      .set({
        strategicObjectiveDescription: strategicDesc,
        planningData: JSON.stringify(planningData),
      })
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    // Retrieve and verify both are preserved
    const updated = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    expect(updated).toHaveLength(1);
    const objective = updated[0];

    expect(objective.strategicObjectiveDescription).toBe(strategicDesc);
    const savedPlanning = JSON.parse(objective.planningData);
    expect(savedPlanning.category).toBe('Independent Category');
    expect(savedPlanning.goal).toBe(500);
  });
});
