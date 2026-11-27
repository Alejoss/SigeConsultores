import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: undefined as any,
  retained: vi.fn(),
  send: vi.fn(),
  sign: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  writeAccess: vi.fn(),
  env: { isProduction: false, s3AccessKeyId: "", s3SecretAccessKey: "", s3Region: "test", s3Endpoint: "", s3PublicEndpoint: "", s3Bucket: "local-test" },
}));
vi.mock("../annual/runtime", () => ({ getAnnualScope: () => mocks.scope, validateAnnualRequestInput: async () => {}, validateAnnualWriteAccess: mocks.writeAccess }));
vi.mock("../annual/store", () => ({ isFileRetained: mocks.retained }));
vi.mock("../_core/env", () => ({ ENV: mocks.env }));
vi.mock("fs/promises", () => ({ mkdir: mocks.mkdir, writeFile: mocks.writeFile, unlink: mocks.unlink }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public input: any) {} }
  return { S3Client: class { send = mocks.send; }, PutObjectCommand: class PutObjectCommand extends Command {}, GetObjectCommand: class GetObjectCommand extends Command {}, DeleteObjectCommand: class DeleteObjectCommand extends Command {} };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }));

import { storageDelete, storageGet, storagePut } from "../storage";
const workspace = { id: 51, companyId: 999751, year: 2027, status: "open", storage: "namespace", sourceYear: 2026, strategy: {} };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = { workspace: { ...workspace } };
  mocks.retained.mockResolvedValue(false);
  mocks.send.mockResolvedValue({});
  mocks.sign.mockResolvedValue("https://signed.invalid/new");
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.unlink.mockResolvedValue(undefined);
  mocks.writeAccess.mockResolvedValue(undefined);
  mocks.env.isProduction = false;
  mocks.env.s3AccessKeyId = "";
  mocks.env.s3SecretAccessKey = "";
});

describe("retención de evidencias entre años", () => {
  it("no elimina un archivo retenido por otro año", async () => {
    mocks.retained.mockResolvedValue(true);
    await storageDelete("documents/999751/mapa2026.png");
    expect(mocks.retained).toHaveBeenCalledWith("uploads/documents/999751/mapa2026.png");
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("conserva la retención aunque no exista scope de solicitud", async () => {
    mocks.scope = undefined;
    mocks.retained.mockResolvedValue(true);
    await storageDelete("uploads/documents/999751/mapa2026.png");
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
  it("ante error del registro no intenta borrar", async () => {
    mocks.retained.mockRejectedValue(new Error("registro no disponible"));
    await expect(storageDelete("evidencia2026.pdf")).rejects.toThrow("registro no disponible");
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("bloquea eliminación en un año cerrado antes de consultar retención", async () => {
    mocks.scope.workspace.status = "closed";
    await expect(storageDelete("evidencia2026.pdf")).rejects.toThrow("solo lectura");
    expect(mocks.retained).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
  it("permite eliminar un objeto nuevo no retenido", async () => {
    await storageDelete("uploads/annual/999751/2027/51/new/evidencia.pdf");
    expect(mocks.unlink).toHaveBeenCalledOnce();
    expect(String(mocks.unlink.mock.calls[0][0])).toContain("/uploads/annual/999751/2027/51/new/evidencia.pdf");
  });
  it("mantiene una clave antigua legible sin transformarla en clave2027", async () => {
    expect(await storageGet("documents/999751/mapa2026.png")).toEqual({
      key: "uploads/documents/999751/mapa2026.png", url: "/local-storage/uploads/documents/999751/mapa2026.png",
    });
  });
});

describe("nuevas cargas", () => {
  it("rechaza carga de un job con autorización anual obsoleta antes de cualquier efecto", async () => {
    mocks.writeAccess.mockRejectedValueOnce(new Error("El año está cerrado y es de solo lectura"));
    await expect(storagePut("mapa.png", "new-data")).rejects.toThrow("solo lectura");
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rechaza borrado obsoleto antes de consultar retención o eliminar", async () => {
    mocks.writeAccess.mockRejectedValueOnce(new Error("El año está cerrado y es de solo lectura"));
    await expect(storageDelete("mapa.png")).rejects.toThrow("solo lectura");
    expect(mocks.retained).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("devuelve la clave real que el registro debe persistir", async () => {
    const result = await storagePut("documents/999751/mapa.png", "new-data", "image/png");
    expect(result.key).toMatch(/^uploads\/annual\/999751\/2027\/51\/[^/]+\/documents\/999751\/mapa.png$/);
    expect(String(mocks.writeFile.mock.calls[0][0])).toContain(result.key);
    expect(result.url).toBe(`/local-storage/${result.key}`);
  });
  it("no escribe nada en un año cerrado", async () => {
    mocks.scope.workspace.status = "closed";
    await expect(storagePut("mapa.png", "new")).rejects.toThrow("solo lectura");
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("si falla la firma limpia solo el UUID recién cargado", async () => {
    mocks.env.s3AccessKeyId = "mock-only";
    mocks.env.s3SecretAccessKey = "mock-only";
    mocks.sign.mockRejectedValue(new Error("firma fallida"));
    await expect(storagePut("documents/999751/mapa.png", "new")).rejects.toThrow("firma fallida");
    const calls = mocks.send.mock.calls.map(([command]) => command);
    expect(calls.map(c => c.constructor.name)).toEqual(["PutObjectCommand", "DeleteObjectCommand"]);
    expect(calls[1].input.Key).toBe(calls[0].input.Key);
    expect(calls[1].input.Key).toMatch(/^uploads\/annual\//);
  });
  it("no borra una clave heredada tras fallo de firma", async () => {
    mocks.scope = undefined;
    mocks.env.s3AccessKeyId = "mock-only";
    mocks.env.s3SecretAccessKey = "mock-only";
    mocks.sign.mockRejectedValue(new Error("firma fallida"));
    await expect(storagePut("documents/999751/mapa.png", "new")).rejects.toThrow("firma fallida");
    expect(mocks.send.mock.calls.map(([command]) => command.constructor.name)).toEqual(["PutObjectCommand"]);
  });
});
