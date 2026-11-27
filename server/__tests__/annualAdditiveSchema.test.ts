import { describe, expect, it, vi } from 'vitest';
// The deployed script is imported directly; no separate imitation of its logic.
// @ts-expect-error Deployment script is intentionally plain ESM JavaScript.
import { extendAnnualCommitmentSchema } from '../../scripts/annual-additive-schema.mjs';

describe('Sincronización aditiva de referencia histórica anual', () => {
  it('añade solo INT NULL a base y namespace sin DML ni DROP', async () => {
    const query = vi.fn().mockResolvedValueOnce([[{name:'linkedCommitments'},{name:'aw_7_linkedCommitments'}]])
      .mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
    expect(await extendAnnualCommitmentSchema({query},vi.fn())).toEqual({checked:2,added:2});
    const sql = query.mock.calls.map(([s])=>s as string);
    expect(sql.filter(s=>s.startsWith('ALTER'))).toEqual([
      'ALTER TABLE `linkedCommitments` ADD COLUMN `sourceWorkspaceId` INT NULL',
      'ALTER TABLE `aw_7_linkedCommitments` ADD COLUMN `sourceWorkspaceId` INT NULL',
    ]);
    expect(sql.some(s=>/\b(DROP|DELETE|INSERT|UPDATE|TRUNCATE)\b/i.test(s))).toBe(false);
  });
  it('es idempotente si la columna nullable ya existe', async () => {
    const query=vi.fn().mockResolvedValueOnce([[{name:'aw_7_linkedCommitments'}]])
      .mockResolvedValueOnce([[{DATA_TYPE:'int',IS_NULLABLE:'YES',COLUMN_DEFAULT:null,COLUMN_TYPE:'int'}]]);
    expect(await extendAnnualCommitmentSchema({query},vi.fn())).toEqual({checked:1,added:0});
    expect(query).toHaveBeenCalledTimes(2);
  });
  it.each(['aw_0_linkedCommitments','aw_7_other','linkedCommitments;DROP TABLE accounts'])('rechaza un nombre inesperado %s antes de DDL', async name => {
    const query=vi.fn().mockResolvedValueOnce([[{name}]]);
    await expect(extendAnnualCommitmentSchema({query},vi.fn())).rejects.toThrow(/Nombre inesperado/);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('rechaza una columna incompatible en vez de convertirla o borrar valores', async () => {
    const query=vi.fn().mockResolvedValueOnce([[{name:'linkedCommitments'}]])
      .mockResolvedValueOnce([[{DATA_TYPE:'varchar',IS_NULLABLE:'YES',COLUMN_DEFAULT:null,COLUMN_TYPE:'varchar(50)'}]]);
    await expect(extendAnnualCommitmentSchema({query},vi.fn())).rejects.toThrow(/incompatible/);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
