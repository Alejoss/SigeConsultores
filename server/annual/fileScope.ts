import { randomUUID } from "node:crypto";

export type AnnualFileWorkspace = {
  id: number;
  companyId: number;
  year: number;
  status: "open" | "closed";
};

/** Existing keys remain readable; only NEW uploads receive an immutable key. */
export function annualUploadKey(
  relKey: string,
  workspace?: AnnualFileWorkspace,
  nonce: string = randomUUID()
): string {
  const clean = relKey.replace(/^\/+/, "").replace(/^uploads\//, "");
  if (!workspace) return `uploads/${clean}`;
  if (workspace.status !== "open") {
    throw new Error(`El año ${workspace.year} está cerrado y es de solo lectura.`);
  }
  for (const value of [workspace.id, workspace.companyId, workspace.year]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Ámbito anual inválido para el archivo.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(nonce)) throw new Error("Identificador de archivo inválido.");
  return `uploads/annual/${workspace.companyId}/${workspace.year}/${workspace.id}/${nonce}/${clean}`;
}
