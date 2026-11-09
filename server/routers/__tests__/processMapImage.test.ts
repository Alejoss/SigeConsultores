import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getDocument: vi.fn(),
  replaceDocument: vi.fn(),
  deleteDocument: vi.fn(),
  storagePut: vi.fn(),
  storageGet: vi.fn(),
  storageDelete: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mocks.getDb,
  getProcessMapImageDocument: mocks.getDocument,
  replaceProcessMapImageDocument: mocks.replaceDocument,
  deleteProcessMapImageDocument: mocks.deleteDocument,
}));
vi.mock("../../storage", () => ({
  storagePut: mocks.storagePut,
  storageGet: mocks.storageGet,
  storageDelete: mocks.storageDelete,
}));

import { processMapRouter } from "../processMap";

const companyId = 101;
const oldKey = "process-map/101/previous-map.png";
const newUrl = "https://storage.example.test/new-map";
const oldDocument = { id: 501, fileKey: oldKey };
const upload = {
  companyId,
  fileName: "mapa.png",
  fileData: [137, 80, 78, 71],
  fileType: "image/png",
};

function context(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: null,
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
    ...overrides,
  };
}
const manager = context({
  manager: { companyId, companyName: "Empresa sintética", managerEmail: "manager@example.test" },
});
const admin = context({
  user: { id: 1, openId: "admin-test", name: "Admin", email: "admin@example.test", role: "admin" },
});
const leader = context({
  processLeader: {
    companyId,
    companyName: "Empresa sintética",
    processId: 201,
    processLeaderId: 2,
    leaderName: "Jefe sintético",
    leaderEmail: "leader@example.test",
  },
});

let currentDocument: typeof oldDocument | null;
let files: Set<string>;
let events: string[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  currentDocument = { ...oldDocument };
  files = new Set([oldKey]);
  events = [];
  mocks.getDocument.mockImplementation(async () => currentDocument);
  mocks.storagePut.mockImplementation(async (key: string) => {
    events.push("upload");
    files.add(key);
    return { key, url: newUrl };
  });
  mocks.replaceDocument.mockImplementation(async (_companyId: number, _url: string, key: string) => {
    events.push("db:start");
    const previous = currentDocument;
    currentDocument = { id: previous?.id ?? 502, fileKey: key };
    events.push("db:commit");
    return previous;
  });
  mocks.storageGet.mockResolvedValue({ key: oldKey, url: "https://storage.example.test/fresh-map" });
  mocks.storageDelete.mockImplementation(async (key: string) => {
    events.push(key === oldKey ? "delete:old" : "delete:new");
    files.delete(key);
  });
  mocks.deleteDocument.mockResolvedValue(oldDocument);
});
afterEach(() => vi.restoreAllMocks());

function expectPreviousMapPreserved() {
  expect(currentDocument).toEqual(oldDocument);
  expect(files).toEqual(new Set([oldKey]));
  expect(mocks.storageDelete).not.toHaveBeenCalledWith(oldKey);
  expect(mocks.deleteDocument).not.toHaveBeenCalled();
}

describe("processMap.uploadMapImage: replacement safety", () => {
  it("preserves the previous document and file when upload fails", async () => {
    mocks.storagePut.mockRejectedValue(new Error("S3 upload unavailable"));
    await expect(processMapRouter.createCaller(manager).uploadMapImage(upload))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.replaceDocument).not.toHaveBeenCalled();
    expectPreviousMapPreserved();
    expect(mocks.storageDelete).toHaveBeenCalledWith(mocks.storagePut.mock.calls[0][0]);
  });

  it("cleans a new object when storagePut writes it but then fails to sign its URL", async () => {
    mocks.storagePut.mockImplementation(async (key: string) => {
      files.add(key);
      throw new Error("Signing failed after PutObject");
    });
    await expect(processMapRouter.createCaller(manager).uploadMapImage(upload)).rejects.toThrow();
    expectPreviousMapPreserved();
    expect(mocks.replaceDocument).not.toHaveBeenCalled();
  });

  it("preserves the previous map and cleans the uploaded object when persistence fails", async () => {
    mocks.replaceDocument.mockRejectedValue(new Error("Transaction rolled back"));
    await expect(processMapRouter.createCaller(manager).uploadMapImage(upload))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expectPreviousMapPreserved();
    expect(mocks.storageDelete.mock.calls).toEqual([[mocks.storagePut.mock.calls[0][0]]]);
  });

  it("keeps the original error if cleanup of an uncommitted object also fails", async () => {
    const persistenceError = new Error("DB persistence failed");
    mocks.replaceDocument.mockRejectedValue(persistenceError);
    mocks.storageDelete.mockRejectedValue(new Error("Cleanup unavailable"));
    await expect(processMapRouter.createCaller(manager).uploadMapImage(upload))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: persistenceError });
    expect(currentDocument).toEqual(oldDocument);
    expect(files.has(oldKey)).toBe(true);
    expect(mocks.storageDelete).not.toHaveBeenCalledWith(oldKey);
  });

  it.each(["manager", "admin"])("uploads, commits, then deletes the old file for %s", async (role) => {
    const result = await processMapRouter.createCaller(role === "admin" ? admin : manager).uploadMapImage(upload);
    expect(result).toEqual({ success: true, fileName: upload.fileName, fileUrl: newUrl });
    expect(events).toEqual(["upload", "db:start", "db:commit", "delete:old"]);
    const key = mocks.storagePut.mock.calls[0][0];
    expect(key).toMatch(/^process-map\/101\/[\da-f-]+-mapa\.png$/);
    expect(mocks.storagePut).toHaveBeenCalledWith(key, Buffer.from(upload.fileData), upload.fileType);
    expect(mocks.replaceDocument).toHaveBeenCalledWith(companyId, newUrl, key, upload.fileData.length);
    expect(currentDocument).toEqual({ id: oldDocument.id, fileKey: key });
    expect(files).toEqual(new Set([key]));
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it("does not delete the old object until the replacement promise confirms commit", async () => {
    let commit!: (document: typeof oldDocument) => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    mocks.replaceDocument.mockImplementation(() => {
      notifyStarted();
      return new Promise((resolve) => { commit = resolve; });
    });
    const pendingUpload = processMapRouter.createCaller(manager).uploadMapImage(upload);
    await started;
    expect(mocks.storageDelete).not.toHaveBeenCalled();
    expect(files.has(oldKey)).toBe(true);
    commit(oldDocument);
    await expect(pendingUpload).resolves.toMatchObject({ success: true });
    expect(mocks.storageDelete.mock.calls).toEqual([[oldKey]]);
  });

  it("reports success and retains the new file when old-file cleanup fails after commit", async () => {
    mocks.storageDelete.mockRejectedValue(new Error("S3 delete unavailable"));
    await expect(processMapRouter.createCaller(manager).uploadMapImage(upload))
      .resolves.toMatchObject({ success: true });
    const key = mocks.storagePut.mock.calls[0][0];
    expect(currentDocument?.fileKey).toBe(key);
    expect(files.has(key)).toBe(true);
    expect(mocks.storageDelete.mock.calls).toEqual([[oldKey]]);
  });

  it("creates the first map without deleting any previous file", async () => {
    currentDocument = null;
    files.clear();
    await expect(processMapRouter.createCaller(manager).uploadMapImage(upload))
      .resolves.toMatchObject({ success: true });
    expect(mocks.storageDelete).not.toHaveBeenCalled();
    expect(currentDocument).not.toBeNull();
  });

  it("rejects unsupported files before any storage or DB write", async () => {
    await expect(processMapRouter.createCaller(manager).uploadMapImage({
      ...upload, fileName: "mapa.txt", fileType: "text/plain",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.storageDelete).not.toHaveBeenCalled();
    expect(mocks.replaceDocument).not.toHaveBeenCalled();
  });
});

describe("processMap.getMapImage: absence versus read errors", () => {
  it("returns null only when there is no map document", async () => {
    currentDocument = null;
    await expect(processMapRouter.createCaller(manager).getMapImage({ companyId })).resolves.toBeNull();
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });

  it("returns an explicit error on DB failure", async () => {
    const error = new Error("DB read unavailable");
    mocks.getDocument.mockRejectedValue(error);
    await expect(processMapRouter.createCaller(manager).getMapImage({ companyId }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: error });
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });

  it("returns an explicit error when URL signing fails", async () => {
    mocks.storageGet.mockRejectedValue(new Error("URL signing unavailable"));
    await expect(processMapRouter.createCaller(manager).getMapImage({ companyId }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("does not present an existing document with a missing key as no map", async () => {
    mocks.getDocument.mockResolvedValue({ id: 501, fileKey: null });
    await expect(processMapRouter.createCaller(manager).getMapImage({ companyId }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });

  it.each(["manager", "admin", "leader"])("keeps read access and refreshes URLs for %s", async (role) => {
    const ctx = role === "admin" ? admin : role === "leader" ? leader : manager;
    await expect(processMapRouter.createCaller(ctx).getMapImage({ companyId })).resolves.toEqual({
      id: oldDocument.id,
      fileName: "map.png",
      fileUrl: "https://storage.example.test/fresh-map",
      mimeType: "image/png",
    });
    expect(mocks.storageGet.mock.calls).toEqual([[oldKey]]);
  });
});

describe("processMap image authorization remains unchanged", () => {
  it("rejects upload and deletion by a process leader before any I/O", async () => {
    const caller = processMapRouter.createCaller(leader);
    await expect(caller.uploadMapImage(upload)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.deleteMapImage({ companyId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.storageDelete).not.toHaveBeenCalled();
    expect(mocks.replaceDocument).not.toHaveBeenCalled();
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it.each(["manager", "leader"])("rejects another company's map for %s", async (role) => {
    const caller = processMapRouter.createCaller(role === "manager" ? manager : leader);
    await expect(caller.getMapImage({ companyId: 102 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.uploadMapImage({ ...upload, companyId: 102 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.replaceDocument).not.toHaveBeenCalled();
  });

  it.each(["anonymous", "platform-user"])("rejects read and upload by %s", async (role) => {
    const caller = processMapRouter.createCaller(role === "anonymous" ? context() : context({
      user: { ...admin.user!, role: "user" },
    }));
    const code = role === "anonymous" ? "UNAUTHORIZED" : "FORBIDDEN";
    await expect(caller.getMapImage({ companyId })).rejects.toMatchObject({ code });
    await expect(caller.uploadMapImage(upload)).rejects.toMatchObject({ code });
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });
});
