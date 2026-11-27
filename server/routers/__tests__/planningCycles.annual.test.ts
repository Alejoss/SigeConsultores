import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';

vi.mock('../../annual/requestScope', () => ({ runInAnnualRequestScope: vi.fn(async (_options, op) => op()) }));
vi.mock('../../_core/companyPermissions', () => ({
  assertCompanyReadAccess: vi.fn(), assertProcessAccessById: vi.fn(async () => ({ id: 3, companyId: 1 })),
  assertCompanyReadFromRawInput: vi.fn(), assertCompanyManagementFromRawInput: vi.fn(),
  assertCompanyPersonnelManagementFromRawInput: vi.fn(),
}));
vi.mock('../../db', () => ({ getDb: vi.fn(), getBaseDb: vi.fn() }));
vi.mock('../../annual/store', () => ({ getWorkspaceForScope: vi.fn(), getProcessWorkspaceStatus: vi.fn(), incorporateApprovedProcess: vi.fn(), listWorkspaces: vi.fn() }));
vi.mock('../../lib/consolidatedScheduleActivities', () => ({ getConsolidatedScheduleActivities: vi.fn(async () => []) }));
import { getDb, getBaseDb } from '../../db';
import { getWorkspaceForScope, getProcessWorkspaceStatus, incorporateApprovedProcess, listWorkspaces } from '../../annual/store';
import { planningCyclesRouter } from '../planningCycles';
const ctx = { req: { headers: {} }, res: {}, user: { id: 7, role: 'admin' }, manager: null, processLeader: null } as any;
const source = { id: 1, companyId: 1, year: 2026, sourceYear: null, status: 'open', storage: 'base', strategy: { purpose: true, mission: true, vision: true, policy: true, values: true, strategicObjectives: true } } as any;
function fakeDb(rows: any[][]) {
  const pending = [...rows];
  const writes: any[] = [];
  const chain = (result: any = []) => {
    const q: any = {};
    for (const key of ['where', 'orderBy', 'limit']) q[key] = vi.fn(() => q);
    q.then = (resolve: any, reject: any) => Promise.resolve(typeof result === 'function' ? result() : result).then(resolve, reject);
    return q;
  };
  const db: any = {
    select: vi.fn(() => { const q = chain(() => pending.shift() || []); q.from = vi.fn(() => q); return q; }),
    insert: vi.fn((table) => ({ values: vi.fn((data) => { writes.push({ type: 'insert', table: getTableName(table), data }); return chain(); }) })),
    update: vi.fn((table) => ({ set: vi.fn((data) => { writes.push({ type: 'update', table: getTableName(table), data }); return chain(); }) })),
  };
  db.transaction = vi.fn(async (operation) => operation(db));
  return { db, writes };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWorkspaceForScope).mockResolvedValue(source);
  vi.mocked(getProcessWorkspaceStatus).mockResolvedValue('incorporated');
});
describe('planningCycles annual safety', () => {
  it('permits a prepared cycle with no activities to become ready', async () => {
    const { db } = fakeDb([[], [{ id: 11, sourceCycleId: 10, status: 'in_review' }], [], [], []]);
    vi.mocked(getBaseDb).mockResolvedValue(db);
    const result = await planningCyclesRouter.createCaller(ctx).overview({ companyId: 1, processId: 3, targetYear: 2027 });
    expect(result.ready).toBe(true); expect(result.pendingCount).toBe(0);
  });
  it('refuses to prepare 2028 from a process still pending in 2027 before creating drafts', async () => {
    const { db } = fakeDb([[]]);
    vi.mocked(getBaseDb).mockResolvedValue(db);
    vi.mocked(getWorkspaceForScope).mockResolvedValue({ ...source, id: 2, year: 2027, storage: 'namespace' });
    vi.mocked(getProcessWorkspaceStatus).mockResolvedValue('pending');
    await expect(planningCyclesRouter.createCaller(ctx).prepareDraft({ companyId: 1, processId: 3, targetYear: 2028 })).rejects.toThrow(/Primero debe incorporarse/);
    expect(db.insert).not.toHaveBeenCalled(); expect(getDb).not.toHaveBeenCalled();
  });
  it('reads candidates from the actual source namespace, never the selected destination', async () => {
    const { db } = fakeDb([[], [{ id: 4 }], [{ id: 10 }], [{ id: 11 }]]);
    const { db: scoped } = fakeDb([[{ id: 3, companyId: 1 }], []]);
    vi.mocked(getBaseDb).mockResolvedValue(db); vi.mocked(getDb).mockResolvedValue(scoped);
    const result = await planningCyclesRouter.createCaller(ctx).prepareDraft({ companyId: 1, processId: 3, targetYear: 2027 });
    expect(getWorkspaceForScope).toHaveBeenCalledWith(1, 2026);
    expect(getProcessWorkspaceStatus).toHaveBeenCalledWith(1, 3);
    expect(result).toMatchObject({ created: true, itemCount: 0 });
    expect(scoped.select).toHaveBeenCalledTimes(2);
  });
  it('invalidates the reviewed approval before changing a decision in one transaction', async () => {
    const { db, writes } = fakeDb([[{ id: 9, targetCycleId: 11 }], [{ id: 11, processId: 3, companyId: 1, status: 'ready', managerApprovalStatus: 'approved' }]]);
    vi.mocked(getBaseDb).mockResolvedValue(db);
    expect(await planningCyclesRouter.createCaller(ctx).updateDecision({ companyId: 1, decisionId: 9, decision: 'close' })).toEqual({ success: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(writes.map(w => w.table)).toEqual(['planningCycles', 'planningCycleDecisions']);
    expect(writes[0].data).toMatchObject({ status: 'in_review', managerApprovalStatus: 'pending', managerReviewedAt: null });
  });
  it('annual activation incorporates approved processes without source closure or legacy KPI copies', async () => {
    const { db } = fakeDb([[{ id: 4, status: 'draft' }], [{ id: 11, processId: 3, status: 'ready', managerApprovalStatus: 'approved' }, { id: 12, processId: 5, status: 'in_review', managerApprovalStatus: 'pending' }]]);
    vi.mocked(getBaseDb).mockResolvedValue(db);
    vi.mocked(listWorkspaces).mockResolvedValue([{ ...source, id: 2, year: 2027, storage: 'namespace' }]);
    const result = await planningCyclesRouter.createCaller(ctx).activateCompanyCycle({ companyId: 1, targetYear: 2027 });
    expect(result).toMatchObject({ activatedCycles: 1, annualWorkspace: true });
    expect(incorporateApprovedProcess).toHaveBeenCalledWith(expect.objectContaining({ companyId: 1, processId: 3, year: 2027 }));
    expect(db.insert).not.toHaveBeenCalled(); expect(db.update).not.toHaveBeenCalled();
  });
  it('refuses legacy activation of 2027 if Gerencia has not created its workspace', async () => {
    const { db } = fakeDb([[{ id: 4, status: 'draft' }], []]);
    vi.mocked(getBaseDb).mockResolvedValue(db); vi.mocked(listWorkspaces).mockResolvedValue([source]);
    await expect(planningCyclesRouter.createCaller(ctx).activateCompanyCycle({ companyId: 1, targetYear: 2027 })).rejects.toThrow(/crear primero el espacio anual/);
    expect(db.insert).not.toHaveBeenCalled(); expect(db.update).not.toHaveBeenCalled();
  });
});
