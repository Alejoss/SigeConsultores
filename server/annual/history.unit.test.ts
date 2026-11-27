import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./requestScope', () => ({ runInAnnualRequestScope: vi.fn(async (_options, operation) => operation()) }));
// Live canonical hydration is covered by SQL integration; this contract suite
// deliberately stubs the service and preserves the real pure policy guards.
vi.mock('../_core/teamAccessPolicy', async importOriginal => {
  const actual = await importOriginal<typeof import('../_core/teamAccessPolicy')>();
  return { ...actual, hydrateTeamAccessContext: async (ctx: any, opts: any) => {
    const leader = ctx.processLeader;
    const module = opts.path ? actual.resolveTeamAccessModule(opts.path, opts.rawInput) : undefined;
    const policy = leader ? actual.buildTeamAccessPolicy({companyId:leader.companyId,accountId:leader.processLeaderId,ownProcessId:leader.processId,companyProcessIds:[leader.processId]}) : undefined;
    const cloned = {...ctx,requestMode:opts.mode,teamAccessModule:module,teamAccessPolicy:policy};
    if(module) actual.assertModuleAccess(cloned,module,opts.mode);
    return cloned;
  }};
});
vi.mock('./history', async importOriginal => {
  const original = await importOriginal<typeof import('./history')>();
  return { ...original, listAnnualHistory: vi.fn(async input => ({ items: [], year: input.year })), resolveAnnualHistory: vi.fn(async () => ({ success: true })) };
});
import { annualHistoryRouter } from '../routers/annualHistory';
import { historicalObligationId, listAnnualHistory, resolveAnnualHistory } from './history';
import { runInAnnualScope } from './runtime';
const ctx = (extra: any = {}) => ({ req: { headers: {} }, res: {}, user: null, manager: null, processLeader: null, ...extra }) as any;
const manager = ctx({ manager: { companyId: 1, managerEmail: 'manager@example.invalid' } });
const id = historicalObligationId(1, { workspaceId: 7, table: 'linkedCommitments', id: 20 });
beforeEach(() => vi.clearAllMocks());
describe('annual history opaque identity and fixed router contract', () => {
  it('identity is stable, opaque and includes company, workspace, type and real local id', () => {
    expect(id).toMatch(/^ah1_[a-f0-9]{64}$/);
    expect(historicalObligationId(1, { workspaceId: 7, table: 'linkedCommitments', id: 20 })).toBe(id);
    for (const alternative of [historicalObligationId(2, { workspaceId: 7, table: 'linkedCommitments', id: 20 }), historicalObligationId(1, { workspaceId: 8, table: 'linkedCommitments', id: 20 }), historicalObligationId(1, { workspaceId: 7, table: 'programActions', id: 20 }), historicalObligationId(1, { workspaceId: 7, table: 'linkedCommitments', id: 21 })]) expect(alternative).not.toBe(id);
  });
  it('rejects invalid identities and non-allowlisted sources', () => {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => historicalObligationId(value, { workspaceId: 7, table: 'linkedCommitments', id: 20 })).toThrow();
    expect(() => historicalObligationId(1, { workspaceId: 7, table: 'audits' as any, id: 20 })).toThrow(/Tabla/);
    expect(() => historicalObligationId(1, { workspaceId: 0, table: 'linkedCommitments', id: 20 })).toThrow();
  });
  it('returns exactly list and resolve envelopes and only passes server context as actor source', async () => {
    const caller = annualHistoryRouter.createCaller(manager);
    expect(await caller.list({ companyId: 1, year: 2027, processId: 3 })).toEqual({ items: [], year: 2027 });
    expect(listAnnualHistory).toHaveBeenCalledWith({ companyId: 1, year: 2027, processId: 3 }, expect.objectContaining({ manager: manager.manager }));
    expect(await caller.resolve({ companyId: 1, year: 2027, id, status: 'completed', notes: 'Cerrado' })).toEqual({ success: true });
    expect(resolveAnnualHistory).toHaveBeenCalledWith({ companyId: 1, year: 2027, id, status: 'completed', notes: 'Cerrado' }, expect.objectContaining({ manager: manager.manager }));
  });
  it('uses authentic anonymous, platform-user and foreign-company read guards', async () => {
    for (const context of [ctx(), ctx({ user: { id: 2, role: 'user' } }), ctx({ manager: { companyId: 2 } }), ctx({ processLeader: { companyId: 2 } })]) await expect(annualHistoryRouter.createCaller(context).list({ companyId: 1, year: 2027 })).rejects.toThrow();
    expect(listAnnualHistory).not.toHaveBeenCalled();
  });
  it('supports own-process resolution without requiring management role', async () => {
    const leader = ctx({ processLeader: { companyId: 1, processId: 3, processLeaderId: 9 } });
    expect(await annualHistoryRouter.createCaller(leader).resolve({ companyId: 1, year: 2027, id, status: 'pending', notes: '' })).toEqual({ success: true });
  });
  it('validates strict input, enum, notes length and opaque id', async () => {
    const caller = annualHistoryRouter.createCaller(manager);
    for (const change of [{ id: '7:programActions:20' }, { status: 'cancelled' }, { notes: 'x'.repeat(2001) }, { actor: { role: 'admin' } }, { year: 2025 }, { companyId: -1 }, { sourceTable: 'audits' }]) await expect(caller.resolve({ companyId: 1, year: 2027, id, status: 'completed', notes: '', ...change } as any)).rejects.toThrow();
    await expect(caller.list({ companyId: 1, year: 2027, processId: 0 })).rejects.toThrow();
    expect(resolveAnnualHistory).not.toHaveBeenCalled();
  });
  it('rejects contradictory company header and captured workspace', async () => {
    const admin = ctx({ user: { id: 9, role: 'admin' }, req: { headers: { 'x-isge-company-id': '2' } } });
    await expect(annualHistoryRouter.createCaller(admin).list({ companyId: 1, year: 2027 })).rejects.toThrow(/distinta/);
    await runInAnnualScope({ id: 8, companyId: 2, year: 2027, sourceYear: 2026, status: 'open', storage: 'namespace', strategy: { purpose: true, mission: true, vision: true, values: true, policy: true, strategicObjectives: true } }, async () => {
      await expect(annualHistoryRouter.createCaller(manager).resolve({ companyId: 1, year: 2027, id, status: 'completed', notes: '' })).rejects.toThrow(/distinta/);
    });
    expect(resolveAnnualHistory).not.toHaveBeenCalled();
  });
});
