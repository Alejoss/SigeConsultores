import { drizzle } from "drizzle-orm/mysql2";
import { sql, eq, and, or, desc, asc, inArray } from "drizzle-orm";
import {
  InsertAccount,
  accounts,
  accountRoles,
  roles,
  companies,
  companyAccessRequests,
  companyInfo,
  companyValues,
  companyModuleCustomization,
  policies,
  policyObjectives,
  strategicObjectives,
  processes,
  processUsers,
  subprocesses,
  stakeholders,
  criticalityMatrix,
  fodaAnalysis,
  riskMatrix,
  tacticalObjectives,
  operationalObjectives,
  compliances,
  trainings,
  documents,
  indicators,
  processCharacterizations,
  subprocessMaps,
  subprocessMapEntries,
  subprocessMapSubprocesses,
  subprocessMapOutputs,
  stakeholderCriticalities,
  processFODA,
  processRiskMatrices,
  processTacticalObjectives,
  processCompliances,
  processTrainings,
  processScheduleActivities,
  processIndicators,
  companyManagers,
  processOwnerInvitations,
  processOwners,
  userCompanyAccess,
  organizationChart,
  organizationChartNodes,
  organizationChartFiles,
  type Company,
  type CompanyInfo,
  type Process,
  type ProcessUser,
  type CompanyManager,
  type ProcessOwnerInvitation,
  type ProcessOwner,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function assignPlatformRoleIfMissing(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  accountId: number,
  slug: "platform_admin" | "platform_user"
) {
  const roleRow = await db.select().from(roles).where(eq(roles.slug, slug)).limit(1);
  if (!roleRow[0]) {
    console.warn(`[assignPlatformRoleIfMissing] Role slug missing: ${slug}`);
    return;
  }
  const existing = await db
    .select()
    .from(accountRoles)
    .where(
      and(
        eq(accountRoles.accountId, accountId),
        eq(accountRoles.roleId, roleRow[0].id),
        eq(accountRoles.companyId, 0),
        eq(accountRoles.processId, 0)
      )
    )
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(accountRoles).values({
    accountId,
    roleId: roleRow[0].id,
    companyId: 0,
    processId: 0,
  });
}

export async function upsertUser(user: InsertAccount): Promise<void> {
  await upsertAccount(user);
}

export async function upsertAccount(user: InsertAccount): Promise<void> {
  if (!user.openId) {
    throw new Error("Account openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert account: database not available");
    return;
  }

  try {
    let existing = await db.select().from(accounts).where(eq(accounts.openId, user.openId)).limit(1);

    if (!existing || existing.length === 0) {
      if (user.email) {
        existing = await db.select().from(accounts).where(eq(accounts.email, user.email)).limit(1);
      }
    }

    const exists = existing && existing.length > 0;

    if (exists && existing && existing.length > 0) {
      const updateData: Record<string, unknown> = {};
      if (user.lastSignedIn !== undefined) {
        updateData.lastSignedIn = user.lastSignedIn;
      } else {
        updateData.lastSignedIn = new Date();
      }
      if (user.openId !== existing[0].openId) {
        updateData.openId = user.openId;
      }
      for (const field of ["name", "email", "loginMethod"] as const) {
        if (user[field] !== undefined) {
          updateData[field] = user[field] ?? null;
        }
      }
      await db.update(accounts).set(updateData).where(eq(accounts.id, existing[0].id));
    } else {
      const newAccount: InsertAccount = {
        openId: user.openId,
        email: user.email ?? null,
        name: user.name ?? null,
        loginMethod: user.loginMethod ?? null,
        lastSignedIn: user.lastSignedIn ?? new Date(),
        status: "active",
      };
      await db.insert(accounts).values(newAccount);
      const created = await db.select().from(accounts).where(eq(accounts.openId, user.openId)).limit(1);
      const acc = created[0];
      if (!acc) throw new Error("Account insert failed");

      const slug: "platform_admin" | "platform_user" =
        user.openId === ENV.ownerOpenId ? "platform_admin" : "platform_user";
      await assignPlatformRoleIfMissing(db, acc.id, slug);

      if (slug === "platform_user" && user.email) {
        const accessRequest = await db
          .select()
          .from(companyAccessRequests)
          .where(eq(companyAccessRequests.email, user.email))
          .limit(1);
        if (accessRequest.length === 0 || accessRequest[0].status !== "approved") {
          /* keep default platform_user from above */
        }
      }
    }
  } catch (error) {
    console.error("[Database] Failed to upsert account:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  return getAccountByOpenId(openId);
}

export async function getAccountByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get account: database not available");
    return undefined;
  }

  const result = await db.select().from(accounts).where(eq(accounts.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Company queries
export async function createCompany(name: string, description: string, ownerAccountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(companies).values({
    name,
    description,
    ownerAccountId,
  });

  return result;
}

export async function getCompanyById(companyId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserCompanies(accountId: number, userRole?: string) {
  const db = await getDb();
  if (!db) return [];

  // If user is admin, return all companies
  if (userRole === 'admin') {
    return await db.select().from(companies);
  }

  // Get companies where user is owner
  const ownedCompanies = await db.select().from(companies).where(eq(companies.ownerAccountId, accountId));
  
  // Get companies where user has access via userCompanyAccess
  const accessCompanies = await db
    .select({ id: companies.id, name: companies.name, description: companies.description, ownerAccountId: companies.ownerAccountId, createdAt: companies.createdAt, updatedAt: companies.updatedAt })
    .from(userCompanyAccess)
    .innerJoin(companies, eq(userCompanyAccess.companyId, companies.id))
    .where(eq(userCompanyAccess.accountId, accountId));
  
  // Combine and deduplicate by company id
  const allCompanies = [...ownedCompanies, ...accessCompanies];
  const uniqueCompanies = Array.from(
    new Map(allCompanies.map((c: any) => [c.id, c])).values()
  );
  
  return uniqueCompanies;
}

// Company Info queries
export async function upsertCompanyInfo(companyId: number, proposito: string, mision: string, vision: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(companyInfo).where(eq(companyInfo.companyId, companyId)).limit(1);

  if (existing.length > 0) {
    await db.update(companyInfo).set({ proposito, mision, vision }).where(eq(companyInfo.companyId, companyId));
    return existing[0];
  } else {
    await db.insert(companyInfo).values({ companyId, proposito, mision, vision });
    const result = await db.select().from(companyInfo).where(eq(companyInfo.companyId, companyId)).limit(1);
    return result.length > 0 ? result[0] : { id: 0, companyId, proposito, mision, vision, createdAt: new Date(), updatedAt: new Date() };
  }
}

export async function getCompanyInfo(companyId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(companyInfo).where(eq(companyInfo.companyId, companyId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Company Values queries
export async function addCompanyValue(companyId: number, value: string, orderIndex: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(companyValues).values({ companyId, value, orderIndex });
}

export async function getCompanyValues(companyId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(companyValues).where(eq(companyValues.companyId, companyId));
}

export async function deleteCompanyValue(valueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.delete(companyValues).where(eq(companyValues.id, valueId));
}

// Process queries
export async function createProcess(companyId: number, name: string, processType: "estrategico" | "misional" | "soporte", description?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(processes).values({ companyId, name, processType, description });
}

export async function getCompanyProcesses(companyId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(processes).where(eq(processes.companyId, companyId));
}

export async function getProcessById(processId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(processes).where(eq(processes.id, processId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Process User queries
export async function createProcessUser(processId: number, accountId: number, approverEmail?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(processUsers).values({
    processId,
    accountId,
    approverEmail,
    isApproved: false,
  });
}

export async function getProcessUser(processId: number, accountId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(processUsers)
    .where(and(eq(processUsers.processId, processId), eq(processUsers.accountId, accountId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function approveProcessUser(processUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.update(processUsers).set({ isApproved: true }).where(eq(processUsers.id, processUserId));
}

// Policy queries
export async function createPolicy(companyId: number, policyText: string, versionNo: string, versionDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(policies).values({ companyId, policyText, versionNo, versionDate });
}

export async function getCompanyPolicy(companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(policies).where(eq(policies.companyId, companyId)).orderBy(desc(policies.createdAt)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePolicy(policyId: number, policyText: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(policies).set({ policyText }).where(eq(policies.id, policyId));
}

// Strategic Objectives queries
export async function createStrategicObjective(companyId: number, objective: string, startYear: number, endYear: number, orderIndex: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(strategicObjectives).values({ companyId, objective, startYear, endYear, orderIndex });
}

export async function getCompanyStrategicObjectives(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(strategicObjectives).where(eq(strategicObjectives.companyId, companyId)).orderBy(asc(strategicObjectives.orderIndex));
}

export async function deleteStrategicObjective(objectiveId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(strategicObjectives).where(eq(strategicObjectives.id, objectiveId));
}

// Compliance queries
export async function createCompliance(processId: number, obligationName: string, month: number, year: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(compliances).values({ processId, obligationName, month, year });
}

export async function getProcessCompliances(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(compliances).where(eq(compliances.processId, processId));
}

export async function updateComplianceStatus(complianceId: number, completed: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(compliances).set({ completed }).where(eq(compliances.id, complianceId));
}

export async function deleteCompliance(complianceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(compliances).where(eq(compliances.id, complianceId));
}

// Training queries
export async function createTraining(processId: number, trainingName: string, month: number, year: number, isMandatory?: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(trainings).values({ processId, trainingName, month, year, isMandatory });
}

export async function getProcessTrainings(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trainings).where(eq(trainings.processId, processId));
}

export async function deleteTraining(trainingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(trainings).where(eq(trainings.id, trainingId));
}

// Document queries
export async function createDocument(processId: number, documentName: string, documentType: "Politica" | "Programa" | "Procedimiento" | "Varios", status: "Obsoleto" | "Vigente" | "Registro", fileUrl?: string, fileKey?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(documents).values({ processId, documentName, documentType, status, fileUrl, fileKey });
}

export async function getProcessDocuments(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.processId, processId));
}

export async function getDocumentById(documentId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return rows[0] ?? null;
}

export async function deleteDocument(documentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(documents).where(eq(documents.id, documentId));
}

// Indicator queries
export async function createIndicator(companyId: number, indicatorType: "strategicObjectives" | "tacticalObjectives" | "matrices" | "compliances" | "trainings", value: number, month: number, year: number, processId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(indicators).values({ companyId, processId, indicatorType, value: value.toString(), month, year });
}

export async function getCompanyIndicators(companyId: number, month?: number, year?: number) {
  const db = await getDb();
  if (!db) return [];
  let conditions = [eq(indicators.companyId, companyId)];
  if (month !== undefined) conditions.push(eq(indicators.month, month));
  if (year !== undefined) conditions.push(eq(indicators.year, year));
  return db.select().from(indicators).where(and(...conditions));
}

// Criticality Matrix queries
export async function createCriticalityEntry(processId: number, stakeholderId: number, incidence: "1" | "2" | "3", risk: "A" | "B" | "C", criticality: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(criticalityMatrix).values({ processId, stakeholderId, incidence, risk, criticality });
}

export async function getProcessCriticalityMatrix(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(criticalityMatrix).where(eq(criticalityMatrix.processId, processId));
}

export async function deleteCriticalityEntry(entryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(criticalityMatrix).where(eq(criticalityMatrix.id, entryId));
}

// FODA Analysis queries
export async function createFODAEntry(processId: number, strengths?: string, opportunities?: string, weaknesses?: string, threats?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(fodaAnalysis).values({ processId, strengths, opportunities, weaknesses, threats });
}

export async function getProcessFODA(processId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(fodaAnalysis).where(eq(fodaAnalysis.processId, processId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateFODAEntry(fodaId: number, strengths?: string, opportunities?: string, weaknesses?: string, threats?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(fodaAnalysis).set({ strengths, opportunities, weaknesses, threats }).where(eq(fodaAnalysis.id, fodaId));
}

// Risk Matrix queries
export async function createRiskEntry(processId: number, riskDescription: string, probability: "1" | "2" | "3" | "4" | "5", impact: "A" | "B" | "C" | "D" | "E", riskLevel: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(riskMatrix).values({ processId, riskDescription, probability, impact, riskLevel });
}

export async function getProcessRisks(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(riskMatrix).where(eq(riskMatrix.processId, processId));
}

export async function deleteRiskEntry(riskId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(riskMatrix).where(eq(riskMatrix.id, riskId));
}

// TODO: add more feature queries here as your schema grows.


// Process Characterization queries
export async function upsertProcessCharacterization(processId: number, data: {
  macroProcess?: string;
  responsible?: string;
  participants?: string;
  objective?: string;
  scope?: string;
  resources?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(processCharacterizations).where(eq(processCharacterizations.processId, processId)).limit(1);
  
  if (existing.length > 0) {
    return db.update(processCharacterizations).set(data).where(eq(processCharacterizations.processId, processId));
  } else {
    return db.insert(processCharacterizations).values({ processId, ...data });
  }
}

export async function getProcessCharacterization(processId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(processCharacterizations).where(eq(processCharacterizations.processId, processId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Subprocess Map queries
export async function upsertSubprocessMap(processId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(subprocessMaps).where(eq(subprocessMaps.processId, processId)).limit(1);
  
  if (existing.length > 0) {
    return existing[0].id;
  } else {
    await db.insert(subprocessMaps).values({ processId });
    const created = await db.select().from(subprocessMaps).where(eq(subprocessMaps.processId, processId)).limit(1);
    return created.length > 0 ? created[0].id : 0;
  }
}

export async function getSubprocessMap(processId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(subprocessMaps).where(eq(subprocessMaps.processId, processId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Subprocess Map Entries queries
export async function createSubprocessMapEntry(subprocessMapId: number, data: {
  partesInteresadas?: string;
  internoExterno?: string;
  clienteProveedor?: string;
  necesidades?: string;
  orderIndex: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(subprocessMapEntries).values({ subprocessMapId, ...data });
}

export async function getSubprocessMapEntries(subprocessMapId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subprocessMapEntries).where(eq(subprocessMapEntries.subprocessMapId, subprocessMapId)).orderBy(asc(subprocessMapEntries.orderIndex));
}

export async function deleteSubprocessMapEntry(entryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(subprocessMapEntries).where(eq(subprocessMapEntries.id, entryId));
}

// Subprocess Map Subprocesses queries
export async function createSubprocessMapSubprocess(subprocessMapId: number, data: {
  acciones?: string;
  subproceso?: string;
  orderIndex: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(subprocessMapSubprocesses).values({ subprocessMapId, ...data });
}

export async function getSubprocessMapSubprocesses(subprocessMapId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subprocessMapSubprocesses).where(eq(subprocessMapSubprocesses.subprocessMapId, subprocessMapId)).orderBy(asc(subprocessMapSubprocesses.orderIndex));
}

export async function deleteSubprocessMapSubprocess(subprocessId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(subprocessMapSubprocesses).where(eq(subprocessMapSubprocesses.id, subprocessId));
}

// Subprocess Map Outputs queries
export async function createSubprocessMapOutput(subprocessMapId: number, data: {
  salidas?: string;
  doc?: string;
  orderIndex: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(subprocessMapOutputs).values({ subprocessMapId, ...data });
}

export async function getSubprocessMapOutputs(subprocessMapId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subprocessMapOutputs).where(eq(subprocessMapOutputs.subprocessMapId, subprocessMapId)).orderBy(asc(subprocessMapOutputs.orderIndex));
}

export async function deleteSubprocessMapOutput(outputId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(subprocessMapOutputs).where(eq(subprocessMapOutputs.id, outputId));
}

// Stakeholder Criticality queries
export async function createStakeholderCriticality(processId: number, data: {
  name: string;
  type?: string;
  influence?: number;
  dependence?: number;
  criticality?: number;
  actionToTake?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  completed?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(stakeholderCriticalities).values({ processId, ...data });
}

export async function getProcessStakeholderCriticalities(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stakeholderCriticalities).where(eq(stakeholderCriticalities.processId, processId));
}

export async function deleteStakeholderCriticality(criticalityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(stakeholderCriticalities).where(eq(stakeholderCriticalities.id, criticalityId));
}

export async function updateStakeholderCriticality(criticalityId: number, data: {
  name?: string;
  type?: string;
  influence?: number;
  dependence?: number;
  criticality?: number;
  actionToTake?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  completed?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(stakeholderCriticalities).set(data).where(eq(stakeholderCriticalities.id, criticalityId));
}

// Process FODA queries
export async function upsertProcessFODA(processId: number, data: {
  strengths?: string;
  opportunities?: string;
  weaknesses?: string;
  threats?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(processFODA).where(eq(processFODA.processId, processId)).limit(1);
  
  if (existing.length > 0) {
    return db.update(processFODA).set(data).where(eq(processFODA.processId, processId));
  } else {
    return db.insert(processFODA).values({ processId, ...data });
  }
}

export async function getProcessFODAAnalysis(processId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(processFODA).where(eq(processFODA.processId, processId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Process Risk Matrix queries
export async function createProcessRisk(processId: number, data: {
  description: string;
  probability?: number;
  impact?: number;
  riskLevel?: number;
  mitigation?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(processRiskMatrices).values({ processId, ...data });
}

export async function getProcessRiskMatrices(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processRiskMatrices).where(eq(processRiskMatrices.processId, processId));
}

export async function deleteProcessRisk(riskId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(processRiskMatrices).where(eq(processRiskMatrices.id, riskId));
}

export async function updateProcessRisk(riskId: number, data: {
  description?: string;
  probability?: number;
  impact?: number;
  riskLevel?: number;
  mitigation?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(processRiskMatrices).set(data).where(eq(processRiskMatrices.id, riskId));
}

// Process Tactical Objectives queries
export async function createProcessTacticalObjective(processId: number, data: {
  name?: string;  // Made optional to allow saving empty objectives
  description?: string;
  target?: string;
  responsible?: string;
  deadline?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Provide default name if not provided
  const values = {
    processId,
    name: data.name || "Sin enunciado",  // Default name if empty
    ...data
  };
  return db.insert(processTacticalObjectives).values(values);
}

export async function getProcessTacticalObjectives(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processTacticalObjectives).where(eq(processTacticalObjectives.processId, processId));
}

export async function deleteProcessTacticalObjective(objectiveId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(processTacticalObjectives).where(eq(processTacticalObjectives.id, objectiveId));
}

export async function updateProcessTacticalObjective(objectiveId: number, data: {
  name?: string;
  description?: string;
  target?: string;
  responsible?: string;
  deadline?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(processTacticalObjectives).set(data).where(eq(processTacticalObjectives.id, objectiveId));
}

// Process Compliances queries
export async function createProcessCompliance(processId: number, data: {
  tacticalObjectiveId?: number;
  requirement: string;
  description?: string | null;
  obligationType: "Legal" | "Reglamentaria" | "Concesion" | "Sistema de Gestion" | "Otros";
  otherObligationType?: string | null;
  regulation?: string;
  status?: "Planificado" | "En Progreso" | "Completado";
  dueDate?: Date;
  responsible?: string;
  completed?: "SI" | "NO";
  plannedMonths?: string | null;
  completedMonths?: string | null;
  observations?: string | null;
  evidence?: string;
  completionPercentage?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(processCompliances).values({ processId, ...data });
}

export async function getProcessCompliancesList(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processCompliances).where(eq(processCompliances.processId, processId));
}

export async function deleteProcessCompliance(complianceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(processCompliances).where(eq(processCompliances.id, complianceId));
}

export async function updateProcessCompliance(complianceId: number, data: {
  tacticalObjectiveId?: number;
  requirement?: string;
  description?: string | null;
  obligationType?: "Legal" | "Reglamentaria" | "Concesion" | "Sistema de Gestion" | "Otros";
  otherObligationType?: string | null;
  regulation?: string;
  status?: "Planificado" | "En Progreso" | "Completado";
  dueDate?: Date;
  responsible?: string;
  completed?: "SI" | "NO";
  plannedMonths?: string | null;
  completedMonths?: string | null;
  observations?: string | null;
  evidence?: string;
  completionPercentage?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(processCompliances).set(data).where(eq(processCompliances.id, complianceId));
}

// Process Trainings queries
export async function createProcessTraining(processId: number, data: {
  name: string;
  objective?: string;
  type?: "Mandatoria" | "Reglamentaria" | "Sugerida";
  audience?: string;
  plannedAttendees?: number;
  modality?: "Presencial" | "Online" | "Externa";
  plannedDate?: Date;
  conductedDate?: Date;
  actualAttendees?: number;
  attendancePercentage?: number;
  responsible?: string;
  completed?: "SI" | "NO";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(processTrainings).values({ processId, ...data });
}

export async function getProcessTrainingsList(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processTrainings).where(eq(processTrainings.processId, processId));
}

export async function deleteProcessTraining(trainingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(processTrainings).where(eq(processTrainings.id, trainingId));
}

export async function updateProcessTraining(trainingId: number, data: {
  name?: string;
  objective?: string;
  type?: "Mandatoria" | "Reglamentaria" | "Sugerida";
  audience?: string;
  plannedAttendees?: number;
  modality?: "Presencial" | "Online" | "Externa";
  plannedDate?: Date;
  conductedDate?: Date;
  actualAttendees?: number;
  attendancePercentage?: number;
  responsible?: string;
  completed?: "SI" | "NO";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(processTrainings).set(data).where(eq(processTrainings.id, trainingId));
}

// Process Schedule Activities queries
export async function createProcessScheduleActivity(processId: number, data: {
  tacticalObjectiveId?: number;
  name: string;
  type?: string;
  status?: "Planificado" | "En Progreso" | "Completado";
  startDate?: Date;
  endDate?: Date;
  responsible?: string;
  priority?: "Baja" | "Media" | "Alta";
  progress?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(processScheduleActivities).values({ processId, ...data });
}

export async function getProcessScheduleActivities(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processScheduleActivities).where(eq(processScheduleActivities.processId, processId));
}

export async function deleteProcessScheduleActivity(activityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(processScheduleActivities).where(eq(processScheduleActivities.id, activityId));
}

export async function updateProcessScheduleActivity(activityId: number, data: {
  tacticalObjectiveId?: number;
  name?: string;
  type?: string;
  status?: "Planificado" | "En Progreso" | "Completado";
  startDate?: Date;
  endDate?: Date;
  responsible?: string;
  priority?: "Baja" | "Media" | "Alta";
  progress?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(processScheduleActivities).set(data).where(eq(processScheduleActivities.id, activityId));
}

// Process Indicators queries
export async function createProcessIndicator(processId: number, data: {
  tacticalObjectiveId?: number;
  name: string;
  formula?: string;
  unit?: string;
  target?: string;
  currentValue?: string;
  frequency?: string;
  responsible?: string;
  performance?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values: any = { processId, ...data };
  return db.insert(processIndicators).values(values);
}

export async function getProcessIndicatorsList(processId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processIndicators).where(eq(processIndicators.processId, processId));
}

export async function deleteProcessIndicator(indicatorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(processIndicators).where(eq(processIndicators.id, indicatorId));
}

export async function updateProcessIndicator(indicatorId: number, data: {
  tacticalObjectiveId?: number;
  name?: string;
  formula?: string;
  unit?: string;
  target?: string;
  currentValue?: string;
  frequency?: string;
  responsible?: string;
  performance?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values: any = data;
  return db.update(processIndicators).set(values).where(eq(processIndicators.id, indicatorId));
}



// Company Module Customization queries
export async function getModuleCustomization(companyId: number, moduleName: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(companyModuleCustomization)
    .where(and(eq(companyModuleCustomization.companyId, companyId), eq(companyModuleCustomization.moduleName, moduleName)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function upsertModuleCustomization(
  companyId: number,
  moduleName: string,
  payload: { label?: string | null }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getModuleCustomization(companyId, moduleName);

  if (payload.label === undefined) {
    return existing;
  }

  const customLabel =
    payload.label === null || String(payload.label).trim() === ""
      ? null
      : String(payload.label).trim();

  if (existing) {
    await db
      .update(companyModuleCustomization)
      .set({ customLabel })
      .where(and(eq(companyModuleCustomization.companyId, companyId), eq(companyModuleCustomization.moduleName, moduleName)));
    return { ...existing, customLabel };
  }

  await db.insert(companyModuleCustomization).values({
    companyId,
    moduleName,
    customLabel,
  });
  return {
    id: 0,
    companyId,
    moduleName,
    customLabel,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function deleteModuleCustomization(companyId: number, moduleName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .delete(companyModuleCustomization)
    .where(and(eq(companyModuleCustomization.companyId, companyId), eq(companyModuleCustomization.moduleName, moduleName)));
}

export async function getAllModuleCustomizations(companyId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(companyModuleCustomization).where(eq(companyModuleCustomization.companyId, companyId));
}


// ============================================================================
// COMPANY MANAGERS - Functions for managing company managers/gerentes
// ============================================================================

export async function createCompanyManager(companyId: number, accountId: number): Promise<CompanyManager> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(companyManagers).values({
    companyId,
    accountId,
  });

  // Fetch and return the created record
  const created = await db
    .select()
    .from(companyManagers)
    .where(and(eq(companyManagers.companyId, companyId), eq(companyManagers.accountId, accountId)))
    .limit(1);

  if (!created || created.length === 0) {
    throw new Error("Failed to create company manager");
  }

  return created[0];
}

export async function getCompanyManager(companyId: number, accountId: number): Promise<CompanyManager | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(companyManagers)
    .where(and(eq(companyManagers.companyId, companyId), eq(companyManagers.accountId, accountId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getCompanyManagersByCompany(companyId: number): Promise<CompanyManager[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(companyManagers).where(eq(companyManagers.companyId, companyId));
}

export async function getAllCompanyManagers(): Promise<CompanyManager[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(companyManagers).orderBy(desc(companyManagers.createdAt));
}

export async function deleteCompanyManager(companyId: number, accountId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(companyManagers)
    .where(and(eq(companyManagers.companyId, companyId), eq(companyManagers.accountId, accountId)));
}

// ============================================================================
// PROCESS OWNER INVITATIONS - Functions for managing process owner invitations
// ============================================================================

export async function createProcessOwnerInvitation(
  companyId: number,
  processId: number,
  email: string,
  accessCode: string,
  invitationToken: string,
  expiresAt: Date
): Promise<ProcessOwnerInvitation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(processOwnerInvitations).values({
    companyId,
    processId,
    email,
    accessCode,
    invitationToken,
    expiresAt,
    status: "pending",
  });

  // Fetch and return the created record
  const created = await db
    .select()
    .from(processOwnerInvitations)
    .where(eq(processOwnerInvitations.invitationToken, invitationToken))
    .limit(1);

  if (!created || created.length === 0) {
    throw new Error("Failed to create process owner invitation");
  }

  return created[0];
}

export async function getProcessOwnerInvitation(invitationToken: string): Promise<ProcessOwnerInvitation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(processOwnerInvitations)
    .where(eq(processOwnerInvitations.invitationToken, invitationToken))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getProcessOwnerInvitationsByCompany(companyId: number): Promise<ProcessOwnerInvitation[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(processOwnerInvitations)
    .where(eq(processOwnerInvitations.companyId, companyId))
    .orderBy(desc(processOwnerInvitations.createdAt));
}

export async function getProcessOwnerInvitationsByProcess(processId: number): Promise<ProcessOwnerInvitation[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(processOwnerInvitations)
    .where(eq(processOwnerInvitations.processId, processId))
    .orderBy(desc(processOwnerInvitations.createdAt));
}

export async function getProcessOwnerInvitationsByEmail(email: string): Promise<ProcessOwnerInvitation[]> {
  const db = await getDb();
  if (!db) return [];

  // Use case-insensitive search by converting both to lowercase
  const normalizedEmail = email.toLowerCase().trim();
  
  return db
    .select()
    .from(processOwnerInvitations)
    .where(sql`LOWER(TRIM(${processOwnerInvitations.email})) = ${normalizedEmail}`)
    .orderBy(desc(processOwnerInvitations.createdAt));
}

export async function acceptProcessOwnerInvitation(invitationToken: string): Promise<ProcessOwnerInvitation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  await db
    .update(processOwnerInvitations)
    .set({
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    })
    .where(eq(processOwnerInvitations.invitationToken, invitationToken));

  const updated = await db
    .select()
    .from(processOwnerInvitations)
    .where(eq(processOwnerInvitations.invitationToken, invitationToken))
    .limit(1);

  if (!updated || updated.length === 0) {
    throw new Error("Failed to accept process owner invitation");
  }

  return updated[0];
}

export async function deleteProcessOwnerInvitation(invitationToken: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(processOwnerInvitations)
    .where(eq(processOwnerInvitations.invitationToken, invitationToken));
}

// ============================================================================
// PROCESS OWNERS - Functions for managing process owners/jefes de proceso
// ============================================================================

export async function createProcessOwner(
  companyId: number,
  processId: number,
  accountId: number,
  accessCode: string | null
): Promise<ProcessOwner> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(processOwners).values({
    companyId,
    processId,
    accountId,
    accessCode: accessCode || '',  // Use empty string if null
  });

  // Fetch and return the created record
  const created = await db
    .select()
    .from(processOwners)
    .where(and(eq(processOwners.processId, processId), eq(processOwners.accountId, accountId)))
    .limit(1);

  if (!created || created.length === 0) {
    throw new Error("Failed to create process owner");
  }

  return created[0];
}

export async function getProcessOwner(processId: number, accountId: number): Promise<ProcessOwner | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(processOwners)
    .where(and(eq(processOwners.processId, processId), eq(processOwners.accountId, accountId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getProcessOwnersByProcess(processId: number): Promise<ProcessOwner[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(processOwners).where(eq(processOwners.processId, processId));
}

export async function getProcessOwnersByUser(accountId: number): Promise<ProcessOwner[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(processOwners).where(eq(processOwners.accountId, accountId));
}

export async function getProcessOwnersByCompany(companyId: number): Promise<ProcessOwner[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(processOwners)
    .where(eq(processOwners.companyId, companyId))
    .orderBy(desc(processOwners.createdAt));
}

export async function getAllProcessOwners(): Promise<ProcessOwner[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(processOwners).orderBy(desc(processOwners.createdAt));
}

export async function deleteProcessOwner(processId: number, accountId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(processOwners)
    .where(and(eq(processOwners.processId, processId), eq(processOwners.accountId, accountId)));
}


// Helper function to map frontend document types to database document types
function mapDocumentType(frontendType: string): string {
  const typeMap: Record<string, string> = {
    'Policy': 'Politica',
    'Values': 'Varios',
    'StrategicObjectives': 'Varios',
  };
  return typeMap[frontendType] || frontendType; // Return original if not in map
}

// Company-level document queries (for policies, etc.)
export async function getDocumentsByCompanyAndType(companyId: number, documentType: string) {
  const db = await getDb();
  if (!db) return [];
  
  // Map frontend document type to database document type
  const dbDocumentType = mapDocumentType(documentType);
  
  // Get all processes for this company, then get documents with matching type
  const companyProcesses = await db.select({ id: processes.id }).from(processes).where(eq(processes.companyId, companyId));
  const processIds = companyProcesses.map(p => p.id);
  
  if (processIds.length === 0) return [];
  
  return db.select().from(documents)
    .where(
      sql`${documents.processId} IN (${sql.raw(processIds.join(','))}) AND ${documents.documentType} = ${dbDocumentType}`
    );
}

export async function createCompanyDocument(companyId: number, documentName: string, documentType: "Politica" | "Programa" | "Procedimiento" | "Varios", status: "Obsoleto" | "Vigente" | "Registro", fileUrl?: string, fileKey?: string, fileSizeBytes?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get or create a default process for company-level documents
  const existingProcess = await db.select({ id: processes.id })
    .from(processes)
    .where(sql`${processes.companyId} = ${companyId} AND ${processes.name} = 'Documentos Generales'`)
    .limit(1);
  
  let processId: number;
  if (existingProcess.length > 0) {
    processId = existingProcess[0].id;
  } else {
    // Create a default process for storing company-level documents
    await db.insert(processes).values({
      companyId,
      name: 'Documentos Generales',
      processType: 'soporte',
      description: 'Proceso virtual para almacenar documentos a nivel de empresa',
    });
    // Get the inserted ID from the result
    const result = await db.select({ id: processes.id })
      .from(processes)
      .where(sql`${processes.companyId} = ${companyId} AND ${processes.name} = 'Documentos Generales'`)
      .limit(1);
    processId = result[0].id;
  }
  
  return await db.insert(documents).values({ processId, documentName, documentType, status, fileUrl, fileKey, fileSizeBytes: fileSizeBytes ?? 0 });
}

/** Fixed document name for the company-level process map image file. */
export const PROCESS_MAP_IMAGE_DOC_NAME = "Mapa de Procesos - Imagen";

export async function getProcessMapImageDocument(companyId: number) {
  const db = await getDb();
  if (!db) return null;

  const companyProcesses = await db
    .select({ id: processes.id })
    .from(processes)
    .where(eq(processes.companyId, companyId));

  const processIds = companyProcesses.map((p) => p.id);
  if (processIds.length === 0) return null;

  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        inArray(documents.processId, processIds),
        eq(documents.documentName, PROCESS_MAP_IMAGE_DOC_NAME),
        eq(documents.documentType, "Varios")
      )
    )
    .orderBy(desc(documents.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function deleteProcessMapImageDocument(companyId: number): Promise<{ id: number; fileKey: string | null } | null> {
  const doc = await getProcessMapImageDocument(companyId);
  if (!doc) return null;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(documents).where(eq(documents.id, doc.id));
  return { id: doc.id, fileKey: doc.fileKey ?? null };
}


/**
 * @deprecated Legacy API — updates `accounts` linked to `companyManagers.id`.
 */
export async function createOrUpdateManagerCredentials(
  companyManagerId: number,
  email: string,
  passwordHash: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const cm = await db.select().from(companyManagers).where(eq(companyManagers.id, companyManagerId)).limit(1);
  if (!cm[0]) throw new Error("Company manager not found");
  await db
    .update(accounts)
    .set({ email, passwordHash, updatedAt: new Date() })
    .where(eq(accounts.id, cm[0].accountId));
}

/** @deprecated — use `accounts` + login; kept for callers expecting a row shape */
export async function getManagerCredentialsByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const e = email.trim().toLowerCase();
  const row = await db
    .select()
    .from(accounts)
    .where(sql`LOWER(${accounts.email}) = ${e}`)
    .limit(1);
  return row[0];
}

/** @deprecated */
export async function getManagerCredentialsById(companyManagerId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const cm = await db.select().from(companyManagers).where(eq(companyManagers.id, companyManagerId)).limit(1);
  if (!cm[0]) return undefined;
  const row = await db.select().from(accounts).where(eq(accounts.id, cm[0].accountId)).limit(1);
  return row[0];
}

export async function deactivateManagerCredentials(companyManagerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const cm = await db.select().from(companyManagers).where(eq(companyManagers.id, companyManagerId)).limit(1);
  if (!cm[0]) return;
  await db
    .update(accounts)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(eq(accounts.id, cm[0].accountId));
}

export async function getManagerCompanyByEmail(email: string): Promise<number | undefined> {
  const info = await getManagerCompanyInfo(email);
  return info?.companyId;
}

export async function getManagerCompanyInfo(
  email: string
): Promise<{ companyId: number; companyName: string } | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const cmRole = await db.select().from(roles).where(eq(roles.slug, "company_manager")).limit(1);
  if (!cmRole[0]) return undefined;
  const e = email.trim().toLowerCase();
  const result = await db
    .select({
      companyId: accountRoles.companyId,
      companyName: companies.name,
    })
    .from(accounts)
    .innerJoin(accountRoles, eq(accounts.id, accountRoles.accountId))
    .innerJoin(companies, eq(accountRoles.companyId, companies.id))
    .where(
      and(
        sql`LOWER(${accounts.email}) = ${e}`,
        eq(accountRoles.roleId, cmRole[0].id),
        sql`${accountRoles.companyId} > 0`
      )
    )
    .limit(1);
  return result[0];
}


// ============================================================================
// ORGANIZATION CHART - Functions for managing organization charts
// ============================================================================

export async function createOrganizationChart(
  companyId: number,
  name: string,
  description?: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.insert(organizationChart).values({
      companyId,
      name,
      description,
    });

    // Get the inserted chart
    const charts = await db
      .select()
      .from(organizationChart)
      .where(
        and(
          eq(organizationChart.companyId, companyId),
          eq(organizationChart.name, name)
        )
      )
      .limit(1);

    return charts[0] || { companyId, name, description };
  } catch (error) {
    console.error("[Database] Failed to create organization chart:", error);
    throw error;
  }
}

export async function getOrganizationChart(chartId: number): Promise<any> {
  const db = await getDb();
  if (!db) return undefined;

  try {
    const result = await db
      .select()
      .from(organizationChart)
      .where(eq(organizationChart.id, chartId))
      .limit(1);

    return result[0];
  } catch (error) {
    console.error("[Database] Failed to get organization chart:", error);
    return undefined;
  }
}

export async function getCompanyOrganizationChart(companyId: number): Promise<any> {
  const db = await getDb();
  if (!db) return undefined;

  try {
    const result = await db
      .select()
      .from(organizationChart)
      .where(eq(organizationChart.companyId, companyId))
      .limit(1);

    return result[0];
  } catch (error) {
    console.error("[Database] Failed to get company organization chart:", error);
    return undefined;
  }
}

export async function getOrganizationChartNodes(chartId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(organizationChartNodes)
      .where(eq(organizationChartNodes.chartId, chartId))
      .orderBy(asc(organizationChartNodes.level), asc(organizationChartNodes.order));
  } catch (error) {
    console.error("[Database] Failed to get organization chart nodes:", error);
    return [];
  }
}

export async function createOrganizationChartNode(
  chartId: number,
  nodeData: {
    nodeId: string;
    parentNodeId?: string | null;
    position: string;
    department?: string;
    personName?: string;
    email?: string;
    phone?: string;
    responsibilities?: string;
    salary?: number;
    level: number;
    order: number;
  }
): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Prepare node data with proper types
    const insertData: any = {
      chartId: chartId,
      nodeId: nodeData.nodeId,
      parentNodeId: nodeData.parentNodeId || null,
      position: nodeData.position,
      department: nodeData.department || null,
      personName: nodeData.personName || null,
      email: nodeData.email || null,
      phone: nodeData.phone || null,
      responsibilities: nodeData.responsibilities || null,
      salary: nodeData.salary ? nodeData.salary.toString() : null,
      level: nodeData.level,
      order: nodeData.order,
    };
    
    await db.insert(organizationChartNodes).values(insertData);

    // Get the inserted node
    const nodes = await db
      .select()
      .from(organizationChartNodes)
      .where(
        and(
          eq(organizationChartNodes.chartId, chartId as any),
          eq(organizationChartNodes.nodeId, nodeData.nodeId)
        )
      )
      .limit(1);

    return nodes[0];
  } catch (error) {
    console.error("[Database] Failed to create organization chart node:", error);
    throw error;
  }
}

export async function updateOrganizationChartNode(
  nodeId: number,
  updates: Partial<{
    position: string;
    department: string;
    personName: string;
    email: string;
    phone: string;
    responsibilities: string;
    salary: number;
  }>
): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Convert salary to string for decimal type
    const cleanUpdates: any = { ...updates };
    if (cleanUpdates.salary !== undefined) {
      cleanUpdates.salary = cleanUpdates.salary?.toString();
    }
    
    await db
      .update(organizationChartNodes)
      .set(cleanUpdates)
      .where(eq(organizationChartNodes.id, nodeId));

    const nodes = await db
      .select()
      .from(organizationChartNodes)
      .where(eq(organizationChartNodes.id, nodeId))
      .limit(1);

    return nodes[0];
  } catch (error) {
    console.error("[Database] Failed to update organization chart node:", error);
    throw error;
  }
}

export async function deleteOrganizationChartNode(nodeId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db
      .delete(organizationChartNodes)
      .where(eq(organizationChartNodes.id, nodeId));
  } catch (error) {
    console.error("[Database] Failed to delete organization chart node:", error);
    throw error;
  }
}

export async function uploadOrganizationChartFile(
  chartId: number,
  fileName: string,
  fileUrl: string,
  fileKey: string,
  uploadedByUserId: number,
  uploadedByName: string,
  fileSizeBytes?: number
): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.insert(organizationChartFiles).values({
      chartId,
      fileName,
      fileUrl,
      fileKey,
      uploadedByUserId,
      uploadedByName,
      fileSizeBytes: fileSizeBytes ?? 0,
    });

    // Get the inserted file
    const files = await db
      .select()
      .from(organizationChartFiles)
      .where(
        and(
          eq(organizationChartFiles.chartId, chartId),
          eq(organizationChartFiles.fileKey, fileKey)
        )
      )
      .limit(1);

    return files[0];
  } catch (error) {
    console.error("[Database] Failed to upload organization chart file:", error);
    throw error;
  }
}

export async function getOrganizationChartFiles(chartId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(organizationChartFiles)
      .where(eq(organizationChartFiles.chartId, chartId))
      .orderBy(desc(organizationChartFiles.uploadedAt));
  } catch (error) {
    console.error("[Database] Failed to get organization chart files:", error);
    return [];
  }
}

export async function deleteOrganizationChartFile(fileId: number): Promise<{ fileKey: string } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const rows = await db
      .select({ fileKey: organizationChartFiles.fileKey })
      .from(organizationChartFiles)
      .where(eq(organizationChartFiles.id, fileId))
      .limit(1);

    if (rows.length === 0) return null;

    await db.delete(organizationChartFiles).where(eq(organizationChartFiles.id, fileId));
    return rows[0];
  } catch (error) {
    console.error("[Database] Failed to delete organization chart file:", error);
    throw error;
  }
}
