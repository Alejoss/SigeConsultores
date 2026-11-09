import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  companies,
  documents,
  processes,
} from "../../drizzle/schema";
import {
  getDb,
  getProcessMapImageDocument,
  replaceProcessMapImageDocument,
} from "../db";
import { describeWithDb } from "./helpers/db";

const fixture = {
  companyId: 999081,
  otherCompanyId: 999082,
  firstLoadCompanyId: 999083,
  processId: 999181,
  otherCompanyProcessId: 999182,
  generalProcessId: 999183,
  mapDocumentId: 999281,
  ordinaryDocumentId: 999282,
  otherCompanyMapDocumentId: 999283,
};

let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;

const fixtureProcessIds = [fixture.processId, fixture.otherCompanyProcessId, fixture.generalProcessId];
const fixtureCompanyIds = [fixture.companyId, fixture.otherCompanyId, fixture.firstLoadCompanyId];
async function cleanupFixture() {
  // Include documents created dynamically by the first-upload test; never leave orphan fixture rows.
  await db.delete(documents).where(inArray(documents.processId, fixtureProcessIds));
  await db.delete(processes).where(inArray(processes.id, fixtureProcessIds));
  await db.delete(companies).where(inArray(companies.id, fixtureCompanyIds));
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("Base MySQL local no disponible para la prueba de integración.");
  await cleanupFixture();

  await db.insert(companies).values([
    {
      id: fixture.companyId,
      name: "Empresa sintética mapa 999081",
      description: "Fixture exclusivo de integración para mapas de procesos.",
      ownerAccountId: 999001,
      status: "En Proceso",
    },
    {
      id: fixture.otherCompanyId,
      name: "Empresa sintética mapa externa 999082",
      description: "Fixture externo para verificar aislamiento entre empresas.",
      ownerAccountId: 999002,
      status: "En Proceso",
    },
    {
      id: fixture.firstLoadCompanyId,
      name: "Empresa sintética primer mapa 999083",
      description: "Fixture para la primera carga en Documentos Generales.",
      ownerAccountId: 999003,
      status: "En Proceso",
    },
  ]);

  await db.insert(processes).values([
    {
      id: fixture.processId,
      companyId: fixture.companyId,
      name: "Proceso sintético principal 999181",
      processType: "misional",
    },
    {
      id: fixture.otherCompanyProcessId,
      companyId: fixture.otherCompanyId,
      name: "Proceso sintético externo 999182",
      processType: "soporte",
    },
    {
      id: fixture.generalProcessId,
      companyId: fixture.firstLoadCompanyId,
      name: "Documentos Generales",
      processType: "soporte",
    },
  ]);

  await db.insert(documents).values([
    {
      id: fixture.mapDocumentId,
      processId: fixture.processId,
      documentName: "Mapa de Procesos - Imagen",
      documentType: "Varios",
      status: "Vigente",
      fileUrl: "https://fixture.invalid/mapa-inicial.png",
      fileKey: "fixture/999081/mapa-inicial.png",
      fileSizeBytes: 101,
    },
    {
      id: fixture.ordinaryDocumentId,
      processId: fixture.processId,
      documentName: "Documento ordinario sintético",
      documentType: "Procedimiento",
      status: "Vigente",
      fileUrl: "https://fixture.invalid/procedimiento.pdf",
      fileKey: "fixture/999081/procedimiento.pdf",
      fileSizeBytes: 202,
    },
    {
      id: fixture.otherCompanyMapDocumentId,
      processId: fixture.otherCompanyProcessId,
      documentName: "Mapa de Procesos - Imagen",
      documentType: "Varios",
      status: "Vigente",
      fileUrl: "https://fixture.invalid/otra-empresa.png",
      fileKey: "fixture/999082/otra-empresa.png",
      fileSizeBytes: 303,
    },
  ]);
});

afterAll(async () => {
  if (!db) return;
  await cleanupFixture();
});

describeWithDb("helpers de documento de imagen del mapa: integración MySQL", () => {
  it("reemplaza el mismo registro conservando ID/proceso y los demás documentos", async () => {
    const before = await getProcessMapImageDocument(fixture.companyId);
    expect(before).toMatchObject({
      id: fixture.mapDocumentId,
      processId: fixture.processId,
      fileKey: "fixture/999081/mapa-inicial.png",
    });

    const result = await replaceProcessMapImageDocument(
      fixture.companyId,
      "https://fixture.invalid/mapa-reemplazado.png",
      "fixture/999081/mapa-reemplazado.png",
      404
    );

    expect(result).toEqual({
      id: fixture.mapDocumentId,
      fileKey: "fixture/999081/mapa-inicial.png",
    });
    await expect(getProcessMapImageDocument(fixture.companyId)).resolves.toMatchObject({
      id: fixture.mapDocumentId,
      processId: fixture.processId,
      fileUrl: "https://fixture.invalid/mapa-reemplazado.png",
      fileKey: "fixture/999081/mapa-reemplazado.png",
      fileSizeBytes: 404,
    });

    const ordinary = await db
      .select()
      .from(documents)
      .where(eq(documents.id, fixture.ordinaryDocumentId));
    expect(ordinary).toHaveLength(1);
    expect(ordinary[0]).toMatchObject({
      processId: fixture.processId,
      documentName: "Documento ordinario sintético",
      fileKey: "fixture/999081/procedimiento.pdf",
      fileSizeBytes: 202,
    });
  });

  it("mantiene intacto el mapa de otra empresa", async () => {
    await replaceProcessMapImageDocument(
      fixture.companyId,
      "https://fixture.invalid/mapa-segundo-reemplazo.png",
      "fixture/999081/mapa-segundo-reemplazo.png",
      505
    );

    await expect(getProcessMapImageDocument(fixture.otherCompanyId)).resolves.toMatchObject({
      id: fixture.otherCompanyMapDocumentId,
      processId: fixture.otherCompanyProcessId,
      fileUrl: "https://fixture.invalid/otra-empresa.png",
      fileKey: "fixture/999082/otra-empresa.png",
      fileSizeBytes: 303,
    });
  });

  it("crea la primera carga usando el proceso existente Documentos Generales", async () => {
    await expect(getProcessMapImageDocument(fixture.firstLoadCompanyId)).resolves.toBeNull();

    const result = await replaceProcessMapImageDocument(
      fixture.firstLoadCompanyId,
      "https://fixture.invalid/primer-mapa.png",
      "fixture/999083/primer-mapa.png",
      606
    );

    expect(result).toBeNull();
    await expect(getProcessMapImageDocument(fixture.firstLoadCompanyId)).resolves.toMatchObject({
      processId: fixture.generalProcessId,
      documentName: "Mapa de Procesos - Imagen",
      documentType: "Varios",
      fileUrl: "https://fixture.invalid/primer-mapa.png",
      fileKey: "fixture/999083/primer-mapa.png",
      fileSizeBytes: 606,
    });

    const generalProcesses = await db
      .select()
      .from(processes)
      .where(eq(processes.companyId, fixture.firstLoadCompanyId));
    expect(generalProcesses).toHaveLength(1);
    expect(generalProcesses[0].id).toBe(fixture.generalProcessId);
  });

  it("rechaza una empresa inexistente sin escrituras", async () => {
    const missingCompanyId = 999099;
    const snapshot = async () => ({
      processes: await db.select().from(processes).where(inArray(processes.companyId, [...fixtureCompanyIds, missingCompanyId])),
      documents: await db.select().from(documents).where(inArray(documents.processId, fixtureProcessIds)),
    });
    const before = await snapshot();
    expect(await db.select().from(companies).where(eq(companies.id, missingCompanyId))).toHaveLength(0);

    await expect(
      replaceProcessMapImageDocument(
        missingCompanyId,
        "https://fixture.invalid/no-debe-escribirse.png",
        "fixture/999099/no-debe-escribirse.png",
        707
      )
    ).rejects.toThrow("Company not found");

    expect(await snapshot()).toEqual(before);
    expect(await db.select().from(documents).where(eq(documents.fileKey, "fixture/999099/no-debe-escribirse.png"))).toHaveLength(0);
  });
});
