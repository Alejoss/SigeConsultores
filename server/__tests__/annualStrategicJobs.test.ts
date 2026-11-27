import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: undefined as any,
  companies: [{ id: 999821 }],
  workspaces: [] as any[],
  persisted: [] as any[],
  list: vi.fn(),
  run: vi.fn(),
}));
vi.mock("../annual/runtime", () => ({
  getAnnualScope: () => mocks.scope,
  runInAnnualScope: mocks.run,
}));
vi.mock("../annual/store", () => ({ listWorkspaces: mocks.list }));
vi.mock("../db", () => {
  const scopedDb = {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({ values: (value: any) => ({ onDuplicateKeyUpdate: async () => {
      mocks.persisted.push({ workspace: mocks.scope?.workspace, value });
    } }) }),
  };
  const baseDb = { select: () => ({ from: async () => mocks.companies }) };
  return { getBaseDb: async () => baseDb, getDb: async () => scopedDb };
});
import { calculateCompanyStrategicSnapshot, saveSnapshotsForAllCompanies } from "../lib/strategicSnapshots";

const workspace = (year: number, status = "open") => ({ id: year - 2000, companyId: 999821, year, status, storage: year === 2026 ? "base" : "namespace", sourceYear: year - 1, strategy: {} });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = undefined;
  mocks.companies = [{ id: 999821 }];
  mocks.workspaces = [workspace(2026), workspace(2027)];
  mocks.persisted = [];
  mocks.list.mockImplementation(async () => mocks.workspaces);
  mocks.run.mockImplementation(async (workspace: any, operation: () => any) => {
    const previous = mocks.scope;
    mocks.scope = { workspace };
    try { return await operation(); } finally { mocks.scope = previous; }
  });
});

describe("cron estratégico anual", () => {
  it("guarda solamente el año abierto que corresponde al reloj", async () => {
    await saveSnapshotsForAllCompanies(new Date("2026-11-15T12:00:00Z"));
    expect(mocks.persisted).toHaveLength(1);
    expect(mocks.persisted[0].workspace.year).toBe(2026);
    expect(mocks.persisted[0].value.year).toBe(2026);
    expect(mocks.run).toHaveBeenCalledOnce();
  });
  it("no recalcula un año cerrado aunque sea el año actual", async () => {
    mocks.workspaces = [workspace(2026, "closed"), workspace(2027)];
    await saveSnapshotsForAllCompanies(new Date("2026-11-15T12:00:00Z"));
    expect(mocks.persisted).toHaveLength(0);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("no crea 2028 ni usa2027 cuando2028 todavía no existe", async () => {
    await saveSnapshotsForAllCompanies(new Date("2028-01-01T12:00:00Z"));
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.persisted).toHaveLength(0);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("respeta la selección anual en una consulta explícita aunque difiera del reloj", async () => {
    mocks.scope = { workspace: workspace(2027) };
    const result = await calculateCompanyStrategicSnapshot(999821, new Date("2026-11-15T12:00:00Z"));
    expect(result.year).toBe(2027);
    expect(mocks.persisted).toHaveLength(0);
  });
});
