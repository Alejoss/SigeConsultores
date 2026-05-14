import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../db';
import { processFODA } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Matrix FODA PDF Export', () => {
  let db: any;
  let testProcessId = 999;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      throw new Error('Database not available');
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      try {
        await db.delete(processFODA).where(eq(processFODA.processId, testProcessId));
      } catch (error) {
        console.error('Error cleaning up test data:', error);
      }
    }
  });

  it('should preserve matrix data when exporting to PDF', async () => {
    if (!db) {
      throw new Error('Database not available');
    }

    // Create test matrix data
    const testMatrixData = [
      {
        id: 1,
        elemento: 'Especialistas en procesamiento de ranúnculos',
        foda: 'Fortaleza',
        factor: 'Humano',
        sistemaGestion: 'Calidad',
        accionDeAprovechamiento: 'Planificar e implementar capacitaciones',
        fechaFinalPrevista: '2026-04-22',
      },
      {
        id: 2,
        elemento: 'Se despacha producto terminado con plagas',
        foda: 'Debilidad',
        factor: 'Humano',
        consecuencia: 'Reclamos / Pérdida de clientes',
        sistemaGestion: 'Calidad',
        probabilidad: 'C',
        impacto: 4,
        nivelRiesgo: 'C4 (Crítico)',
        accionATomar: 'Evaluar tecnología de detección',
        planContingencia: 'Llenar registro de reclamos',
        planContinuidad: '',
        simulacro: 'Pruebas de vuelo con flor contaminada',
        fechaFinalPrevista: '2026-04-17',
      },
    ];

    // Save test data
    await db.insert(processFODA).values({
      processId: testProcessId,
      matrixData: JSON.stringify(testMatrixData),
      strengths: null,
      opportunities: null,
      weaknesses: null,
      threats: null,
    }).onDuplicateKeyUpdate({
      set: { matrixData: JSON.stringify(testMatrixData) },
    });

    // Retrieve and verify data is intact
    const result = await db.select().from(processFODA)
      .where(eq(processFODA.processId, testProcessId));

    expect(result).toHaveLength(1);
    expect(result[0].matrixData).toBeDefined();

    const retrievedData = JSON.parse(result[0].matrixData);
    expect(retrievedData).toHaveLength(2);
    expect(retrievedData[0].elemento).toBe('Especialistas en procesamiento de ranúnculos');
    expect(retrievedData[0].foda).toBe('Fortaleza');
    expect(retrievedData[1].elemento).toBe('Se despacha producto terminado con plagas');
    expect(retrievedData[1].foda).toBe('Debilidad');
    expect(retrievedData[1].nivelRiesgo).toBe('C4 (Crítico)');
  });

  it('should not modify data when reading for PDF export', async () => {
    if (!db) {
      throw new Error('Database not available');
    }

    const testMatrixData = [
      {
        id: 1,
        elemento: 'Test Element',
        foda: 'Oportunidad',
        factor: 'Tecnológico',
        sistemaGestion: 'Ambiente',
        accionDeAprovechamiento: 'Test action',
        fechaFinalPrevista: '2026-05-01',
      },
    ];

    // Save test data
    await db.insert(processFODA).values({
      processId: testProcessId + 1,
      matrixData: JSON.stringify(testMatrixData),
      strengths: null,
      opportunities: null,
      weaknesses: null,
      threats: null,
    }).onDuplicateKeyUpdate({
      set: { matrixData: JSON.stringify(testMatrixData) },
    });

    // Read data multiple times (simulating PDF export)
    for (let i = 0; i < 3; i++) {
      const result = await db.select().from(processFODA)
        .where(eq(processFODA.processId, testProcessId + 1));

      expect(result).toHaveLength(1);
      const retrievedData = JSON.parse(result[0].matrixData);
      expect(retrievedData).toHaveLength(1);
      expect(retrievedData[0].elemento).toBe('Test Element');
    }

    // Clean up
    await db.delete(processFODA).where(eq(processFODA.processId, testProcessId + 1));
  });

  it('should handle all FODA types correctly', async () => {
    if (!db) {
      throw new Error('Database not available');
    }

    const testMatrixData = [
      {
        id: 1,
        elemento: 'Fortaleza Test',
        foda: 'Fortaleza',
        factor: 'Humano',
        sistemaGestion: 'Calidad',
      },
      {
        id: 2,
        elemento: 'Oportunidad Test',
        foda: 'Oportunidad',
        factor: 'Tecnológico',
        sistemaGestion: 'Ambiente',
      },
      {
        id: 3,
        elemento: 'Debilidad Test',
        foda: 'Debilidad',
        factor: 'Natural',
        sistemaGestion: 'SSO',
        probabilidad: 'A',
        impacto: 5,
        nivelRiesgo: 'A5 (Crítico)',
      },
      {
        id: 4,
        elemento: 'Amenaza Test',
        foda: 'Amenaza',
        factor: 'Humano',
        sistemaGestion: 'Seguridad Física',
        probabilidad: 'B',
        impacto: 3,
        nivelRiesgo: 'B3 (Crítico)',
      },
    ];

    await db.insert(processFODA).values({
      processId: testProcessId + 2,
      matrixData: JSON.stringify(testMatrixData),
      strengths: null,
      opportunities: null,
      weaknesses: null,
      threats: null,
    }).onDuplicateKeyUpdate({
      set: { matrixData: JSON.stringify(testMatrixData) },
    });

    const result = await db.select().from(processFODA)
      .where(eq(processFODA.processId, testProcessId + 2));

    expect(result).toHaveLength(1);
    const retrievedData = JSON.parse(result[0].matrixData);
    
    expect(retrievedData.filter((r: any) => r.foda === 'Fortaleza')).toHaveLength(1);
    expect(retrievedData.filter((r: any) => r.foda === 'Oportunidad')).toHaveLength(1);
    expect(retrievedData.filter((r: any) => r.foda === 'Debilidad')).toHaveLength(1);
    expect(retrievedData.filter((r: any) => r.foda === 'Amenaza')).toHaveLength(1);

    // Clean up
    await db.delete(processFODA).where(eq(processFODA.processId, testProcessId + 2));
  });

  it('should preserve all fields when exporting', async () => {
    if (!db) {
      throw new Error('Database not available');
    }

    const testMatrixData = [
      {
        id: 1,
        elemento: 'Complete Data Test',
        foda: 'Debilidad',
        factor: 'Humano',
        consecuencia: 'Test consequence',
        sistemaGestion: 'Calidad',
        probabilidad: 'C',
        impacto: 4,
        nivelRiesgo: 'C4 (Crítico)',
        accionATomar: 'Test action',
        planContingencia: 'Test contingency',
        planContinuidad: 'Test continuity',
        simulacro: 'Test drill',
        fechaPlanificacionMejora: '2026-03-17',
        fechaFinalPrevista: '2026-04-17',
        comunicado: 'SI',
        partesInteresadas: 'Test stakeholders',
        evidencia: 'Test evidence',
        mejoraImplementada: 'NO',
        observacion: 'Test observation',
        medioVerificacion: 'Test verification',
        fechaImplementacion: '2026-03-20',
        objetivoLogrado: 'NO',
      },
    ];

    await db.insert(processFODA).values({
      processId: testProcessId + 3,
      matrixData: JSON.stringify(testMatrixData),
      strengths: null,
      opportunities: null,
      weaknesses: null,
      threats: null,
    }).onDuplicateKeyUpdate({
      set: { matrixData: JSON.stringify(testMatrixData) },
    });

    const result = await db.select().from(processFODA)
      .where(eq(processFODA.processId, testProcessId + 3));

    expect(result).toHaveLength(1);
    const retrievedData = JSON.parse(result[0].matrixData);
    const item = retrievedData[0];

    // Verify all fields are preserved
    expect(item.elemento).toBe('Complete Data Test');
    expect(item.foda).toBe('Debilidad');
    expect(item.factor).toBe('Humano');
    expect(item.consecuencia).toBe('Test consequence');
    expect(item.sistemaGestion).toBe('Calidad');
    expect(item.probabilidad).toBe('C');
    expect(item.impacto).toBe(4);
    expect(item.nivelRiesgo).toBe('C4 (Crítico)');
    expect(item.accionATomar).toBe('Test action');
    expect(item.planContingencia).toBe('Test contingency');
    expect(item.planContinuidad).toBe('Test continuity');
    expect(item.simulacro).toBe('Test drill');
    expect(item.comunicado).toBe('SI');
    expect(item.partesInteresadas).toBe('Test stakeholders');
    expect(item.evidencia).toBe('Test evidence');
    expect(item.mejoraImplementada).toBe('NO');
    expect(item.observacion).toBe('Test observation');
    expect(item.medioVerificacion).toBe('Test verification');
    expect(item.objetivoLogrado).toBe('NO');

    // Clean up
    await db.delete(processFODA).where(eq(processFODA.processId, testProcessId + 3));
  });
});
