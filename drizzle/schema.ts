import {
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  date,
  unique,
} from "drizzle-orm/mysql-core";

/**
 * Platform account — single identity for email/password, OAuth, and derived roles.
 * Passwords live only here (bcrypt). Roles are in `account_roles` via `roles`.
 */
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  /** OAuth subject from provider; stable unique when present. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  /** Normalized unique login email when using password or linking OAuth. */
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  status: mysqlEnum("status", ["active", "disabled", "pending_invitation"])
    .default("active")
    .notNull(),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

/** @deprecated name — use InsertAccount */
export type InsertUser = InsertAccount;

/** TRPC / RBAC shape: built from `accounts` + `account_roles` (platform_* only). */
export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
};

/** Canonical role slugs (rows seeded in `roles`). */
export const ROLE_SLUGS = [
  "platform_admin",
  "platform_user",
  "company_manager",
  "process_leader",
] as const;
export type RoleSlug = (typeof ROLE_SLUGS)[number];

export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;

/**
 * Scoped role assignment. Use companyId=0 and processId=0 for global platform roles.
 * company_manager: companyId set, processId 0. process_leader: both set.
 */
export const accountRoles = mysqlTable(
  "account_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    roleId: int("roleId").notNull(),
    companyId: int("companyId").notNull().default(0),
    processId: int("processId").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    accountRoleScope: unique("account_role_scope").on(
      table.accountId,
      table.roleId,
      table.companyId,
      table.processId
    ),
  })
);

export type AccountRole = typeof accountRoles.$inferSelect;
export type InsertAccountRole = typeof accountRoles.$inferInsert;

/**
 * One session row per login — always tied to `accounts.id`.
 */
export const authSessions = mysqlTable("auth_sessions", {
  id: int("id").autoincrement().primaryKey(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  accountId: int("accountId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

export type AuthSession = typeof authSessions.$inferSelect;
export type InsertAuthSession = typeof authSessions.$inferInsert;

/**
 * Companies table - Stores information about each company using the SIGE platform
 */
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerAccountId: int("ownerAccountId").notNull(),
  status: mysqlEnum("status", ["En Proceso", "Activa", "Desactivada"])
    .default("En Proceso")
    .notNull(),
  cancelledAt: timestamp("cancelledAt"),
  storageLimitMb: int("storageLimitMb").notNull().default(500),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

/**
 * Company Info - Stores Propósito, Misión, Visión, and Valores for each company
 */
export const companyInfo = mysqlTable("companyInfo", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  proposito: text("proposito"),
  mision: text("mision"),
  vision: text("vision"),
  adminAlertEmail: varchar("adminAlertEmail", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyInfo = typeof companyInfo.$inferSelect;
export type InsertCompanyInfo = typeof companyInfo.$inferInsert;

/**
 * Company Values - Stores up to 15 empresa values
 */
export const companyValues = mysqlTable("companyValues", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  value: text("value").notNull(),
  description: text("description"),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CompanyValue = typeof companyValues.$inferSelect;
export type InsertCompanyValue = typeof companyValues.$inferInsert;

/**
 * Policy - Stores the Política del Sistema Integrado de Gestión
 */
export const policies = mysqlTable("policies", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  versionNo: varchar("versionNo", { length: 50 }).notNull(),
  versionDate: date("versionDate"),
  policyText: text("policyText").notNull(),
  generalManagerName: varchar("generalManagerName", { length: 255 }),
  generalManagerCI: varchar("generalManagerCI", { length: 50 }),
  electronicSignature: text("electronicSignature"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = typeof policies.$inferInsert;

/**
 * Policy Objectives - Stores objectives of the policy
 */
export const policyObjectives = mysqlTable("policyObjectives", {
  id: int("id").autoincrement().primaryKey(),
  policyId: int("policyId").notNull(),
  objective: text("objective").notNull(),
  description: text("description"),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PolicyObjective = typeof policyObjectives.$inferSelect;
export type InsertPolicyObjective = typeof policyObjectives.$inferInsert;

/**
 * Strategic Objectives - Stores Objetivos Estratégicos
 */
export const strategicObjectives = mysqlTable("strategicObjectives", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  objective: text("objective").notNull(),
  description: text("description"),
  target: text("target"),
  startYear: int("startYear").notNull(),
  endYear: int("endYear").notNull(),
  generalManagerName: varchar("generalManagerName", { length: 255 }),
  generalManagerCI: varchar("generalManagerCI", { length: 50 }),
  electronicSignature: text("electronicSignature"),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StrategicObjective = typeof strategicObjectives.$inferSelect;
export type InsertStrategicObjective = typeof strategicObjectives.$inferInsert;

/**
 * Processes - Stores processes in the Mapa de Procesos
 */
export const processes = mysqlTable("processes", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  macroProcess: varchar("macroProcess", { length: 255 }),
  processType: mysqlEnum("processType", [
    "estrategico",
    "misional",
    "soporte",
  ]).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Process = typeof processes.$inferSelect;
export type InsertProcess = typeof processes.$inferInsert;

/**
 * Process Users - account assigned to a process (approval workflow; auth via `accounts`).
 */
export const processUsers = mysqlTable("processUsers", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  accountId: int("accountId").notNull(),
  isApproved: boolean("isApproved").default(false).notNull(),
  approverEmail: varchar("approverEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessUser = typeof processUsers.$inferSelect;
export type InsertProcessUser = typeof processUsers.$inferInsert;

/**
 * Subprocesses - Stores subprocesses for each process
 */
export const subprocesses = mysqlTable("subprocesses", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Subprocess = typeof subprocesses.$inferSelect;
export type InsertSubprocess = typeof subprocesses.$inferInsert;

/**
 * Stakeholders - Stores interested parties (clients/suppliers)
 */
export const stakeholders = mysqlTable("stakeholders", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["cliente", "proveedor"]).notNull(),
  isInternal: boolean("isInternal").notNull(),
  needs: text("needs"),
  actions: text("actions"),
  outputs: text("outputs"),
  documents: text("documents"),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Stakeholder = typeof stakeholders.$inferSelect;
export type InsertStakeholder = typeof stakeholders.$inferInsert;

/**
 * Stakeholder Criticality - Stores criticality assessment of stakeholders for processes
 */
export const criticalityMatrix = mysqlTable(
  "criticalityMatrix",
  {
    id: int("id").autoincrement().primaryKey(),
    processId: int("processId").notNull(),
    stakeholderId: int("stakeholderId").notNull(),
    incidence: mysqlEnum("incidence", ["1", "2", "3"]).notNull(),
    risk: mysqlEnum("risk", ["A", "B", "C"]).notNull(),
    criticality: varchar("criticality", { length: 10 }).notNull(),
    existingDefenses: text("existingDefenses"),
    actionToTake: text("actionToTake"),
    observations: text("observations"),
    startDate: date("startDate"),
    endDate: date("endDate"),
    implementationStatus: boolean("implementationStatus").default(false),
    completionPercentage: int("completionPercentage").default(0),
    // Fuente/origen de la acción de mejora
    actionSource: varchar("actionSource", { length: 100 }).default(
      "Iniciativa propia"
    ),
    // Referencia a encuesta que originó la acción (si aplica)
    surveyId: int("surveyId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    // Ensure only one criticality entry per (processId, stakeholderId) combination
    uniqueProcessStakeholder: unique().on(table.processId, table.stakeholderId),
  })
);

export type CriticalityEntry = typeof criticalityMatrix.$inferSelect;
export type InsertCriticalityEntry = typeof criticalityMatrix.$inferInsert;

/**
 * FODA Analysis - Stores FODA (Fortalezas, Oportunidades, Debilidades, Amenazas)
 */
export const fodaAnalysis = mysqlTable("fodaAnalysis", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  subprocessId: int("subprocessId"),
  policyObjectiveId: int("policyObjectiveId"),
  strengths: text("strengths"),
  opportunities: text("opportunities"),
  weaknesses: text("weaknesses"),
  threats: text("threats"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FODAEntry = typeof fodaAnalysis.$inferSelect;
export type InsertFODAEntry = typeof fodaAnalysis.$inferInsert;

/**
 * Risk Matrix - Stores risk assessment
 */
export const riskMatrix = mysqlTable("riskMatrix", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  riskDescription: text("riskDescription").notNull(),
  probability: mysqlEnum("probability", ["1", "2", "3", "4", "5"]).notNull(),
  impact: mysqlEnum("impact", ["A", "B", "C", "D", "E"]).notNull(),
  riskLevel: varchar("riskLevel", { length: 20 }).notNull(),
  managementSystem: mysqlEnum("managementSystem", [
    "Calidad",
    "SSO",
    "Ambiente",
    "BASC",
  ]),
  existingControls: text("existingControls"),
  improvementImplemented: boolean("improvementImplemented").default(false),
  newProbability: mysqlEnum("newProbability", ["1", "2", "3", "4", "5"]),
  newRiskLevel: varchar("newRiskLevel", { length: 20 }),
  communicatedToAreas: boolean("communicatedToAreas").default(false),
  implementationPercentage: int("implementationPercentage").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RiskEntry = typeof riskMatrix.$inferSelect;
export type InsertRiskEntry = typeof riskMatrix.$inferInsert;

/**
 * Tactical Objectives - Stores Objetivos Tácticos
 */
export const tacticalObjectives = mysqlTable("tacticalObjectives", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  objective: text("objective").notNull(),
  year: int("year").notNull(),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TacticalObjective = typeof tacticalObjectives.$inferSelect;
export type InsertTacticalObjective = typeof tacticalObjectives.$inferInsert;

/**
 * Operational Objectives - Stores Objetivos Operativos (derived from tactical)
 */
export const operationalObjectives = mysqlTable("operationalObjectives", {
  id: int("id").autoincrement().primaryKey(),
  tacticalObjectiveId: int("tacticalObjectiveId").notNull(),
  objective: text("objective").notNull(),
  subAreaIndex: varchar("subAreaIndex", { length: 10 }).notNull(),
  month: int("month").notNull(),
  plannedCompletion: int("plannedCompletion").default(0),
  actualCompletion: int("actualCompletion").default(0),
  completionPercentage: int("completionPercentage").default(0),
  ponderacion: decimal("ponderacion", { precision: 5, scale: 2 }).default(
    "0.00"
  ),
  condicionInicial: decimal("condicionInicial", { precision: 12, scale: 2 }),
  meta: decimal("meta", { precision: 12, scale: 2 }),
  condicionActual: decimal("condicionActual", { precision: 12, scale: 2 }),
  porcentajeAlcanzado: decimal("porcentajeAlcanzado", {
    precision: 5,
    scale: 2,
  }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OperationalObjective = typeof operationalObjectives.$inferSelect;
export type InsertOperationalObjective =
  typeof operationalObjectives.$inferInsert;

/**
 * Compliances - Stores compliance obligations
 */
export const compliances = mysqlTable("compliances", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  obligationName: varchar("obligationName", { length: 255 }).notNull(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  planned: boolean("planned").default(false),
  completed: boolean("completed").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Compliance = typeof compliances.$inferSelect;
export type InsertCompliance = typeof compliances.$inferInsert;

/**
 * Trainings - Stores training schedule
 */
export const trainings = mysqlTable("trainings", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  trainingName: varchar("trainingName", { length: 255 }).notNull(),
  objective: text("objective"),
  isMandatory: boolean("isMandatory").default(false),
  duration: varchar("duration", { length: 100 }),
  targetAudience: varchar("targetAudience", { length: 255 }),
  isInternal: boolean("isInternal").default(true),
  trainer: varchar("trainer", { length: 255 }),
  month: int("month").notNull(),
  year: int("year").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Training = typeof trainings.$inferSelect;
export type InsertTraining = typeof trainings.$inferInsert;

/**
 * Documents - Stores documents for processes
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  documentName: varchar("documentName", { length: 255 }).notNull(),
  documentType: mysqlEnum("documentType", [
    "Politica",
    "Programa",
    "Procedimiento",
    "Varios",
  ]).notNull(),
  status: mysqlEnum("status", ["Obsoleto", "Vigente", "Registro"]).notNull(),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  fileSizeBytes: int("fileSizeBytes").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Indicators - Stores calculated indicators
 */
export const indicators = mysqlTable("indicators", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  processId: int("processId"),
  indicatorType: mysqlEnum("indicatorType", [
    "strategicObjectives",
    "tacticalObjectives",
    "matrices",
    "compliances",
    "trainings",
  ]).notNull(),
  value: decimal("value", { precision: 5, scale: 2 }).notNull(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Indicator = typeof indicators.$inferSelect;
export type InsertIndicator = typeof indicators.$inferInsert;

/**
 * Process Characterization - Stores general characterization data for processes
 */
export const processCharacterizations = mysqlTable("processCharacterizations", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  macroProcess: varchar("macroProcess", { length: 255 }),
  responsible: varchar("responsible", { length: 255 }),
  responsibleEmail: varchar("responsibleEmail", { length: 255 }),
  participants: text("participants"),
  objective: text("objective"),
  scope: text("scope"),
  resources: text("resources"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessCharacterization =
  typeof processCharacterizations.$inferSelect;
export type InsertProcessCharacterization =
  typeof processCharacterizations.$inferInsert;

/**
 * Subprocess Map - Stores entrada, subprocesos, and salida for subprocess mapping
 */
export const subprocessMaps = mysqlTable("subprocessMaps", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  entrada: text("entrada"),
  necesidades: longtext("necesidades"),
  subprocesos: text("subprocesos"),
  salida: text("salida"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SubprocessMap = typeof subprocessMaps.$inferSelect;
export type InsertSubprocessMap = typeof subprocessMaps.$inferInsert;

/**
 * Subprocess Map Entries - Stores entrada items
 */
export const subprocessMapEntries = mysqlTable("subprocessMapEntries", {
  id: int("id").autoincrement().primaryKey(),
  subprocessMapId: int("subprocessMapId").notNull(),
  partesInteresadas: text("partesInteresadas"),
  internoExterno: varchar("internoExterno", { length: 100 }),
  clienteProveedor: varchar("clienteProveedor", { length: 100 }),
  necesidades: text("necesidades"),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SubprocessMapEntry = typeof subprocessMapEntries.$inferSelect;
export type InsertSubprocessMapEntry = typeof subprocessMapEntries.$inferInsert;

/**
 * Subprocess Map Subprocesses - Stores subproceso items
 */
export const subprocessMapSubprocesses = mysqlTable(
  "subprocessMapSubprocesses",
  {
    id: int("id").autoincrement().primaryKey(),
    subprocessMapId: int("subprocessMapId").notNull(),
    acciones: text("acciones"),
    subproceso: text("subproceso"),
    orderIndex: int("orderIndex").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

export type SubprocessMapSubprocess =
  typeof subprocessMapSubprocesses.$inferSelect;
export type InsertSubprocessMapSubprocess =
  typeof subprocessMapSubprocesses.$inferInsert;

/**
 * Subprocess Map Outputs - Stores salida items
 */
export const subprocessMapOutputs = mysqlTable("subprocessMapOutputs", {
  id: int("id").autoincrement().primaryKey(),
  subprocessMapId: int("subprocessMapId").notNull(),
  salidas: text("salidas"),
  doc: text("doc"),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SubprocessMapOutput = typeof subprocessMapOutputs.$inferSelect;
export type InsertSubprocessMapOutput =
  typeof subprocessMapOutputs.$inferInsert;

/**
 * Stakeholder Criticality - Stores criticality assessment of stakeholders for processes
 */
export const stakeholderCriticalities = mysqlTable("stakeholderCriticalities", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }),
  influence: int("influence"),
  dependence: int("dependence"),
  criticality: int("criticality"),
  accionATomar: text("accionATomar"),
  fechaInicio: timestamp("fechaInicio"),
  fechaFin: timestamp("fechaFin"),
  realizado: varchar("realizado", { length: 2 }).default("NO"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StakeholderCriticality =
  typeof stakeholderCriticalities.$inferSelect;
export type InsertStakeholderCriticality =
  typeof stakeholderCriticalities.$inferInsert;

/**
 * Process FODA - Stores FODA analysis for specific processes
 */
export const processFODA = mysqlTable("processFODA", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  strengths: text("strengths"),
  opportunities: text("opportunities"),
  weaknesses: text("weaknesses"),
  threats: text("threats"),
  matrixData: longtext("matrixData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessFODA = typeof processFODA.$inferSelect;
export type InsertProcessFODA = typeof processFODA.$inferInsert;

/**
 * Process Risk Matrix - Stores risk assessment for specific processes
 */
export const processRiskMatrices = mysqlTable("processRiskMatrices", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  description: text("description").notNull(),
  probability: int("probability"),
  impact: int("impact"),
  riskLevel: int("riskLevel"),
  mitigation: text("mitigation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessRiskMatrix = typeof processRiskMatrices.$inferSelect;
export type InsertProcessRiskMatrix = typeof processRiskMatrices.$inferInsert;

/**
 * Process Tactical Objectives - Stores tactical objectives for specific processes
 */
export const processTacticalObjectives = mysqlTable(
  "processTacticalObjectives",
  {
    id: int("id").autoincrement().primaryKey(),
    processId: int("processId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    target: varchar("target", { length: 255 }),
    responsible: varchar("responsible", { length: 255 }),
    deadline: date("deadline"),
    subprocess: varchar("subprocess", { length: 255 }),
    strategicObjective: varchar("strategicObjective", { length: 255 }),
    strategicObjectiveDescription: text("strategicObjectiveDescription"),
    planningData: longtext("planningData"),
    completed: mysqlEnum("completed", ["SI", "NO"]).default("NO").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export type ProcessTacticalObjective =
  typeof processTacticalObjectives.$inferSelect;
export type InsertProcessTacticalObjective =
  typeof processTacticalObjectives.$inferInsert;

// NOTE: The fields ponderacion, puntoPartida, metaLlegada, unidadMedida, avanceMeta
// are NOT in the actual database table. They were planned but never migrated.
// To add them in the future, create a migration with:
// ALTER TABLE processTacticalObjectives ADD COLUMN ponderacion DECIMAL(5,2) DEFAULT 0;
// ALTER TABLE processTacticalObjectives ADD COLUMN puntoPartida DECIMAL(12,2);
// ALTER TABLE processTacticalObjectives ADD COLUMN metaLlegada DECIMAL(12,2);
// ALTER TABLE processTacticalObjectives ADD COLUMN unidadMedida VARCHAR(100);
// ALTER TABLE processTacticalObjectives ADD COLUMN avanceMeta DECIMAL(5,2) DEFAULT 0;

/**
 * Process Compliances - Stores compliance tracking for specific processes
 */
export const processCompliances = mysqlTable("processCompliances", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  tacticalObjectiveId: int("tacticalObjectiveId"),
  requirement: varchar("requirement", { length: 255 }).notNull(),
  description: text("description"),
  regulation: varchar("regulation", { length: 255 }),
  obligationType: mysqlEnum("obligationType", [
    "Legal",
    "Reglamentaria",
    "Concesion",
    "Sistema de Gestion",
    "Otros",
  ]).notNull(),
  otherObligationType: varchar("otherObligationType", { length: 255 }),
  status: mysqlEnum("status", ["Planificado", "En Progreso", "Completado"])
    .default("Planificado")
    .notNull(),
  dueDate: date("dueDate"),
  responsible: varchar("responsible", { length: 255 }),
  evidence: text("evidence"),
  completed: mysqlEnum("completed", ["SI", "NO"]).default("NO").notNull(),
  plannedMonths: varchar("plannedMonths", { length: 50 }),
  completedMonths: varchar("completedMonths", { length: 50 }),
  observations: text("observations"),
  completionPercentage: int("completionPercentage").default(0),
  evaluationMode: mysqlEnum("evaluationMode", ["meses", "vigencia"])
    .default("meses")
    .notNull(),
  validFrom: date("validFrom"),
  validUntil: date("validUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessCompliance = typeof processCompliances.$inferSelect;
export type InsertProcessCompliance = typeof processCompliances.$inferInsert;

/**
 * Process Trainings - Stores training requirements for specific processes
 */
export const processTrainings = mysqlTable("processTrainings", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  objective: text("objective"),
  type: mysqlEnum("type", ["Mandatoria", "Reglamentaria", "Sugerida"])
    .default("Mandatoria")
    .notNull(),
  audience: varchar("audience", { length: 255 }),
  plannedAttendees: int("plannedAttendees").default(0),
  modality: mysqlEnum("modality", ["Presencial", "Online", "Externa"])
    .default("Presencial")
    .notNull(),
  plannedDate: date("plannedDate"),
  conductedDate: date("conductedDate"),
  actualAttendees: int("actualAttendees").default(0),
  attendancePercentage: int("attendancePercentage").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessTraining = typeof processTrainings.$inferSelect;
export type InsertProcessTraining = typeof processTrainings.$inferInsert;

/**
 * Process Schedule Activities - Stores activities for consolidated schedule
 */
export const processScheduleActivities = mysqlTable(
  "processScheduleActivities",
  {
    id: int("id").autoincrement().primaryKey(),
    processId: int("processId").notNull(),
    tacticalObjectiveId: int("tacticalObjectiveId"),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 100 }),
    status: mysqlEnum("status", ["Planificado", "En Progreso", "Completado"])
      .default("Planificado")
      .notNull(),
    startDate: date("startDate"),
    endDate: date("endDate"),
    responsible: varchar("responsible", { length: 255 }),
    priority: mysqlEnum("priority", ["Baja", "Media", "Alta"])
      .default("Media")
      .notNull(),
    progress: int("progress").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export type ProcessScheduleActivity =
  typeof processScheduleActivities.$inferSelect;
export type InsertProcessScheduleActivity =
  typeof processScheduleActivities.$inferInsert;

/**
 * Process Indicators - Stores KPI indicators for specific processes
 */
export const processIndicators = mysqlTable("processIndicators", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  tacticalObjectiveId: int("tacticalObjectiveId"),
  name: varchar("name", { length: 255 }).notNull(),
  formula: text("formula"),
  unit: varchar("unit", { length: 100 }),
  target: varchar("target", { length: 100 }),
  currentValue: varchar("currentValue", { length: 100 }),
  frequency: varchar("frequency", { length: 100 }),
  responsible: varchar("responsible", { length: 255 }),
  performance: int("performance").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessIndicator = typeof processIndicators.$inferSelect;
export type InsertProcessIndicator = typeof processIndicators.$inferInsert;

/**
 * Process Participants - Stores participants/roles in process characterization
 */
export const processParticipants = mysqlTable("processParticipants", {
  id: int("id").autoincrement().primaryKey(),
  processCharacterizationId: int("processCharacterizationId").notNull(),
  position: varchar("position", { length: 255 }).notNull(),
  objective: text("objective"),
  responsibility: text("responsibility"),
  authority: text("authority"),
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessParticipant = typeof processParticipants.$inferSelect;
export type InsertProcessParticipant = typeof processParticipants.$inferInsert;

/**
 * Participant worker assignments - Links active payroll employees to a process role.
 */
export const participantWorkerAssignments = mysqlTable(
  "participantWorkerAssignments",
  {
    id: int("id").autoincrement().primaryKey(),
    processParticipantId: int("processParticipantId").notNull(),
    payrollEmployeeId: int("payrollEmployeeId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    participantEmployeeUnique: unique(
      "participantWorkerAssignments_participant_employee_unique"
    ).on(table.processParticipantId, table.payrollEmployeeId),
  })
);

export type ParticipantWorkerAssignment =
  typeof participantWorkerAssignments.$inferSelect;
export type InsertParticipantWorkerAssignment =
  typeof participantWorkerAssignments.$inferInsert;

/**
 * Employee KPI definitions - One or more KPI can be configured for each worker-role assignment per year.
 */
export const participantWorkerKpis = mysqlTable("participantWorkerKpis", {
  id: int("id").autoincrement().primaryKey(),
  participantWorkerAssignmentId: int("participantWorkerAssignmentId").notNull(),
  year: int("year").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  monthlyTarget: decimal("monthlyTarget", {
    precision: 14,
    scale: 2,
  }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParticipantWorkerKpi = typeof participantWorkerKpis.$inferSelect;
export type InsertParticipantWorkerKpi =
  typeof participantWorkerKpis.$inferInsert;

/**
 * Monthly KPI observations - A null or absent value means the month is still pending.
 */
export const participantWorkerKpiValues = mysqlTable(
  "participantWorkerKpiValues",
  {
    id: int("id").autoincrement().primaryKey(),
    participantWorkerKpiId: int("participantWorkerKpiId").notNull(),
    month: int("month").notNull(),
    actualValue: decimal("actualValue", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    kpiMonthUnique: unique("participantWorkerKpiValues_kpi_month_unique").on(
      table.participantWorkerKpiId,
      table.month
    ),
  })
);

export type ParticipantWorkerKpiValue =
  typeof participantWorkerKpiValues.$inferSelect;
export type InsertParticipantWorkerKpiValue =
  typeof participantWorkerKpiValues.$inferInsert;

/**
 * Planning Cycle Activations - Company-level controlled activation of an annual planning cycle.
 * This table is additive and does not alter any existing operational record.
 */
export const planningCycleActivations = mysqlTable(
  "planningCycleActivations",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    targetYear: int("targetYear").notNull(),
    deadline: date("deadline"),
    status: mysqlEnum("status", ["draft", "active", "closed", "cancelled"])
      .default("draft")
      .notNull(),
    createdByAccountId: int("createdByAccountId"),
    activatedByAccountId: int("activatedByAccountId"),
    activatedAt: timestamp("activatedAt"),
    closedAt: timestamp("closedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    companyYearUnique: unique(
      "planningCycleActivations_company_year_unique"
    ).on(table.companyId, table.targetYear),
  })
);

export type PlanningCycleActivation =
  typeof planningCycleActivations.$inferSelect;
export type InsertPlanningCycleActivation =
  typeof planningCycleActivations.$inferInsert;

/**
 * Planning Cycles - One annual cycle per company and process. Existing process tables remain untouched.
 */
export const planningCycles = mysqlTable(
  "planningCycles",
  {
    id: int("id").autoincrement().primaryKey(),
    activationId: int("activationId"),
    sourceCycleId: int("sourceCycleId"),
    companyId: int("companyId").notNull(),
    processId: int("processId").notNull(),
    cycleYear: int("cycleYear").notNull(),
    status: mysqlEnum("status", [
      "not_started",
      "in_review",
      "ready",
      "active",
      "closed",
      "skipped",
    ])
      .default("not_started")
      .notNull(),
    preparedByAccountId: int("preparedByAccountId"),
    preparedAt: timestamp("preparedAt"),
    managerApprovalStatus: varchar("managerApprovalStatus", { length: 24 })
      .default("pending")
      .notNull(),
    managerReviewedByAccountId: int("managerReviewedByAccountId"),
    managerReviewedAt: timestamp("managerReviewedAt"),
    managerReviewNote: text("managerReviewNote"),
    activatedAt: timestamp("activatedAt"),
    closedAt: timestamp("closedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    companyProcessYearUnique: unique(
      "planningCycles_company_process_year_unique"
    ).on(table.companyId, table.processId, table.cycleYear),
  })
);

export type PlanningCycle = typeof planningCycles.$inferSelect;
export type InsertPlanningCycle = typeof planningCycles.$inferInsert;

/**
 * Planning Cycle Decisions - Explicit, reversible draft decisions for every element being reviewed.
 */
export const planningCycleDecisions = mysqlTable(
  "planningCycleDecisions",
  {
    id: int("id").autoincrement().primaryKey(),
    targetCycleId: int("targetCycleId").notNull(),
    sourceCycleId: int("sourceCycleId"),
    itemType: mysqlEnum("itemType", [
      "ote",
      "otg",
      "stakeholder_action",
      "compliance",
      "participant_kpi",
    ]).notNull(),
    sourceItemKey: varchar("sourceItemKey", { length: 255 }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    completionPercent: decimal("completionPercent", { precision: 7, scale: 2 })
      .default("0.00")
      .notNull(),
    sourcePayloadJson: longtext("sourcePayloadJson").notNull(),
    decision: mysqlEnum("decision", ["pending", "migrate", "close", "review"])
      .default("pending")
      .notNull(),
    decisionNote: text("decisionNote"),
    decidedByAccountId: int("decidedByAccountId"),
    decidedAt: timestamp("decidedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    cycleItemUnique: unique("planningCycleDecisions_cycle_item_unique").on(
      table.targetCycleId,
      table.itemType,
      table.sourceItemKey
    ),
  })
);

export type PlanningCycleDecision = typeof planningCycleDecisions.$inferSelect;
export type InsertPlanningCycleDecision =
  typeof planningCycleDecisions.$inferInsert;

/**
 * Planning Cycle Snapshots - Immutable historical record created when a source cycle is closed.
 */
export const planningCycleSnapshots = mysqlTable(
  "planningCycleSnapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    cycleId: int("cycleId").notNull(),
    itemType: mysqlEnum("itemType", [
      "ote",
      "otg",
      "stakeholder_action",
      "compliance",
      "participant_kpi",
    ]).notNull(),
    sourceItemKey: varchar("sourceItemKey", { length: 255 }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    completionPercent: decimal("completionPercent", { precision: 7, scale: 2 })
      .default("0.00")
      .notNull(),
    snapshotJson: longtext("snapshotJson").notNull(),
    migrationDecision: mysqlEnum("migrationDecision", [
      "migrate",
      "close",
      "review",
    ]).notNull(),
    migratedToCycleId: int("migratedToCycleId"),
    closedAt: timestamp("closedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    snapshotItemUnique: unique("planningCycleSnapshots_cycle_item_unique").on(
      table.cycleId,
      table.itemType,
      table.sourceItemKey
    ),
  })
);

export type PlanningCycleSnapshot = typeof planningCycleSnapshots.$inferSelect;
export type InsertPlanningCycleSnapshot =
  typeof planningCycleSnapshots.$inferInsert;

/**
 * Operational items created only after an approved annual-cycle migration.
 * They preserve a separate plan for the destination year without rewriting the source records.
 */
export const planningCycleOperationalItems = mysqlTable(
  "planningCycleOperationalItems",
  {
    id: int("id").autoincrement().primaryKey(),
    targetCycleId: int("targetCycleId").notNull(),
    sourceDecisionId: int("sourceDecisionId").notNull(),
    itemType: mysqlEnum("itemType", [
      "ote",
      "otg",
      "stakeholder_action",
      "compliance",
      "participant_kpi",
    ]).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    plannedDate: date("plannedDate"),
    sourceCompletionPercent: decimal("sourceCompletionPercent", {
      precision: 7,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    sourcePayloadJson: longtext("sourcePayloadJson").notNull(),
    status: mysqlEnum("status", ["active", "review_required"])
      .default("active")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    cycleDecisionUnique: unique(
      "planningCycleOperationalItems_cycle_decision_unique"
    ).on(table.targetCycleId, table.sourceDecisionId),
  })
);

export type PlanningCycleOperationalItem =
  typeof planningCycleOperationalItems.$inferSelect;
export type InsertPlanningCycleOperationalItem =
  typeof planningCycleOperationalItems.$inferInsert;

/**
 * Process Resources - Stores resources used in process characterization
 */
export const processResources = mysqlTable("processResources", {
  id: int("id").autoincrement().primaryKey(),
  processCharacterizationId: int("processCharacterizationId").notNull(),
  participantId: int("participantId"), // FK to processParticipants
  participant: varchar("participant", { length: 255 }), // Kept for backward compatibility
  resourceType: varchar("resourceType", { length: 255 }).notNull(), // Required field in DB
  description: text("description"), // Kept for backward compatibility
  resourceName: varchar("resourceName", { length: 255 }), // New field name (nullable)
  resourceElements: text("resourceElements"), // New field name (nullable)
  orderIndex: int("orderIndex").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessResource = typeof processResources.$inferSelect;
export type InsertProcessResource = typeof processResources.$inferInsert;

/**
 * Procedures - Stores procedures for each process
 */
export const procedures = mysqlTable("procedures", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  objective: text("objective"),
  code: varchar("code", { length: 50 }).notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  createdDate: varchar("createdDate", { length: 10 }),
  lastVersion: varchar("lastVersion", { length: 20 }),
  procedureFileUrl: text("procedureFileUrl"),
  procedureFileKey: text("procedureFileKey"),
  procedureFileSizeBytes: int("procedureFileSizeBytes").default(0),
  flowchartFileUrl: text("flowchartFileUrl"),
  flowchartFileKey: text("flowchartFileKey"),
  flowchartFileSizeBytes: int("flowchartFileSizeBytes").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Procedure = typeof procedures.$inferSelect;
export type InsertProcedure = typeof procedures.$inferInsert;

/**
 * Procedure Records - Stores records/registros associated with procedures
 */
export const procedureRecords = mysqlTable("procedureRecords", {
  id: int("id").autoincrement().primaryKey(),
  procedureId: int("procedureId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  date: varchar("date", { length: 10 }),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  fileSizeBytes: int("fileSizeBytes").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcedureRecord = typeof procedureRecords.$inferSelect;
export type InsertProcedureRecord = typeof procedureRecords.$inferInsert;

/**
 * Company Access Requests - Stores requests from companies to access SIGE platform
 * Admin (Esteban) approves or rejects these requests
 */
export const companyAccessRequests = mysqlTable("companyAccessRequests", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  rucOrCI: varchar("rucOrCI", { length: 50 }).notNull(),
  contactName: varchar("contactName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"])
    .default("pending")
    .notNull(),
  approvedBy: int("approvedBy"), // User ID of admin who approved
  approvalDate: timestamp("approvalDate"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyAccessRequest = typeof companyAccessRequests.$inferSelect;
export type InsertCompanyAccessRequest =
  typeof companyAccessRequests.$inferInsert;

/**
 * Process Access Keys - Stores access keys for process managers (jefes de proceso)
 * Each process manager gets a 4-digit numeric key to access their process
 */
export const processAccessKeys = mysqlTable("processAccessKeys", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  processId: int("processId").notNull(),
  managerName: varchar("managerName", { length: 255 }).notNull(),
  managerEmail: varchar("managerEmail", { length: 320 }).notNull(),
  accessKey: varchar("accessKey", { length: 4 }).notNull(), // 4-digit numeric key
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(), // General manager who created this access
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deactivatedAt: timestamp("deactivatedAt"),
  deactivatedBy: int("deactivatedBy"), // General manager who deactivated
});

export type ProcessAccessKey = typeof processAccessKeys.$inferSelect;
export type InsertProcessAccessKey = typeof processAccessKeys.$inferInsert;

/**
 * Access Audit Log - Stores all access-related events for security and compliance
 * Tracks: company approvals, key creations, deactivations, login attempts, etc.
 */
export const accessAuditLog = mysqlTable("accessAuditLog", {
  id: int("id").autoincrement().primaryKey(),
  eventType: mysqlEnum("eventType", [
    "company_request_created",
    "company_approved",
    "company_rejected",
    "company_manager_password_set",
    "company_manager_password_changed",
    "company_manager_password_reset",
    "process_key_created",
    "process_key_deactivated",
    "process_key_modified",
    "process_leader_invited",
    "process_leader_pin_set",
    "process_leader_pin_changed",
    "process_leader_pin_reset_requested",
    "process_leader_pin_reset",
    "process_leader_deactivated",
    "process_leader_reactivated",
    "process_leader_login_success",
    "process_leader_login_failed",
    "company_manager_deactivated",
    "company_manager_reactivated",
    "company_access_invitation_created",
    "company_access_invitation_used",
    "company_access_invitation_revoked",
    "access_request_approved",
    "access_request_rejected",
    "manager_invitation_created",
    "manager_invitation_accepted",
    "manager_invitation_revoked",
    "login_attempt",
    "login_success",
    "login_failed",
  ]).notNull(),
  companyId: int("companyId"),
  accountId: int("accountId"),
  processAccessKeyId: int("processAccessKeyId"),
  description: text("description"),
  ipAddress: varchar("ipAddress", { length: 45 }), // IPv4 or IPv6
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccessAuditLog = typeof accessAuditLog.$inferSelect;
export type InsertAccessAuditLog = typeof accessAuditLog.$inferInsert;

/**
 * Password Reset Tokens - Stores temporary tokens for password recovery
 */
export const passwordResetTokens = mysqlTable("passwordResetTokens", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId"),
  companyId: int("companyId"),
  email: varchar("email", { length: 320 }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  otp: varchar("otp", { length: 6 }),
  tokenType: mysqlEnum("tokenType", [
    "password_reset",
    "password_change",
    "initial_setup",
  ]).notNull(),
  isVerified: boolean("isVerified").default(false).notNull(),
  attempts: int("attempts").default(0).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

/**
 * Unified invitations (manager, process leader, process owner OAuth path, company setup).
 */
export const authInvitations = mysqlTable("auth_invitations", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", [
    "manager",
    "process_leader",
    "process_owner",
    "company_setup",
  ]).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  /** Display name (e.g. process leader). */
  inviteeName: varchar("inviteeName", { length: 255 }),
  invitationToken: varchar("invitationToken", { length: 255 })
    .notNull()
    .unique(),
  /** Set when known (e.g. manager/leader); optional for company_setup until company exists. */
  companyId: int("companyId"),
  processId: int("processId"),
  invitedByAccountId: int("invitedByAccountId"),
  companyAccessRequestId: int("companyAccessRequestId"),
  accessCode: varchar("accessCode", { length: 12 }),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AuthInvitation = typeof authInvitations.$inferSelect;
export type InsertAuthInvitation = typeof authInvitations.$inferInsert;

/**
 * Access Invitations - Stores invitation tokens for company access requests
 * Controls who can request access to the platform
 * Only companies with a valid token can submit access requests
 */
export const accessInvitations = mysqlTable("accessInvitations", {
  id: int("id").autoincrement().primaryKey(),
  invitationToken: varchar("invitationToken", { length: 255 })
    .notNull()
    .unique(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactEmail: varchar("contactEmail", { length: 320 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"), // When the invitation was used to create a request
  usedByRequestId: int("usedByRequestId"), // Reference to the access request created
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AccessInvitation = typeof accessInvitations.$inferSelect;
export type InsertAccessInvitation = typeof accessInvitations.$inferInsert;

/**
 * User Company Access - Associates users with companies they can access
 * Ensures users can only see and manage their assigned companies
 */
export const userCompanyAccess = mysqlTable("userCompanyAccess", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  companyId: int("companyId").notNull(),
  role: mysqlEnum("role", ["manager", "process_leader", "viewer"])
    .default("manager")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserCompanyAccess = typeof userCompanyAccess.$inferSelect;
export type InsertUserCompanyAccess = typeof userCompanyAccess.$inferInsert;

/**
 * Company Module Customization — one display label per (companyId, moduleName).
 * moduleName uses stable keys (see shared/moduleLabelDefinitions.ts).
 */
export const companyModuleCustomization = mysqlTable(
  "companyModuleCustomization",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    moduleName: varchar("moduleName", { length: 100 }).notNull(),
    customLabel: varchar("customLabel", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    companyModuleNameUnique: unique(
      "company_module_customization_company_module"
    ).on(table.companyId, table.moduleName),
  })
);

export type CompanyModuleCustomization =
  typeof companyModuleCustomization.$inferSelect;
export type InsertCompanyModuleCustomization =
  typeof companyModuleCustomization.$inferInsert;

/**
 * Company Managers - Associates users with companies as managers/gerentes
 * A manager can create and manage process owner invitations for their company
 */
export const companyManagers = mysqlTable("companyManagers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  accountId: int("accountId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyManager = typeof companyManagers.$inferSelect;
export type InsertCompanyManager = typeof companyManagers.$inferInsert;

/**
 * Process Owner Invitations - Stores invitations for process owners (Dueños de Proceso)
 * Allows company managers to invite process owners with a 4-digit access code
 */
export const processOwnerInvitations = mysqlTable("processOwnerInvitations", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  processId: int("processId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  accessCode: varchar("accessCode", { length: 12 }), // 12-character robust code - nullable, set by Process Owner
  invitationToken: varchar("invitationToken", { length: 255 })
    .notNull()
    .unique(),
  status: mysqlEnum("status", ["pending", "accepted", "expired"])
    .default("pending")
    .notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessOwnerInvitation =
  typeof processOwnerInvitations.$inferSelect;
export type InsertProcessOwnerInvitation =
  typeof processOwnerInvitations.$inferInsert;

/**
 * Process Owners - Associates users with processes as owners/jefes de proceso
 * A process owner has access to their specific process and can view it in Mapa de Procesos
 */
export const processOwners = mysqlTable("processOwners", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  processId: int("processId").notNull(),
  accountId: int("accountId").notNull(),
  accessCode: varchar("accessCode", { length: 12 }).notNull(), // 12-character robust code for reference
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessOwner = typeof processOwners.$inferSelect;
export type InsertProcessOwner = typeof processOwners.$inferInsert;

/**
 * Company FODA - Stores the consolidated FODA (Fortalezas, Oportunidades, Debilidades, Amenazas) for each company
 * This is built from selected and edited elements from processFODA tables
 */
export const companyFODAs = mysqlTable("companyFODAs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  type: mysqlEnum("type", [
    "Fortaleza",
    "Oportunidad",
    "Debilidad",
    "Amenaza",
  ]).notNull(),
  description: text("description").notNull(),
  justification: text("justification"), // Justification or context for the FODA element
  processId: int("processId"), // Reference to original process (for traceability)
  isCustom: boolean("isCustom").default(false).notNull(), // true if manually added, false if from process
  editedAt: timestamp("editedAt"), // When this element was last edited
  editedBy: int("editedBy"), // User who last edited (FK to users)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyFODA = typeof companyFODAs.$inferSelect;
export type InsertCompanyFODA = typeof companyFODAs.$inferInsert;

/**
 * Company FODA Selection - Tracks which process FODA elements have been selected for company FODA
 * Allows mapping between processFODA and companyFODA
 */
export const companyFODASelections = mysqlTable("companyFODASelections", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  processId: int("processId").notNull(),
  type: mysqlEnum("type", [
    "Fortaleza",
    "Oportunidad",
    "Debilidad",
    "Amenaza",
  ]).notNull(),
  originalText: text("originalText").notNull(), // Original text from processFODA
  isSelected: boolean("isSelected").default(false).notNull(),
  companyFODAId: int("companyFODAId"), // Reference to companyFODA if selected
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyFODASelection = typeof companyFODASelections.$inferSelect;
export type InsertCompanyFODASelection =
  typeof companyFODASelections.$inferInsert;

/**
 * AI Query Audit - Stores all AI queries and responses for auditing and learning
 * Tracks what users ask, what the AI responds, and context
 */
export const aiQueryAudit = mysqlTable("aiQueryAudit", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  userId: int("userId").notNull(),
  moduleType: varchar("moduleType", { length: 100 }).notNull(), // e.g., "SIGE", "FODA", "Criticality", "General"
  query: longtext("query").notNull(), // User's question
  response: longtext("response").notNull(), // AI's response
  contextData: longtext("contextData"), // JSON with relevant context (process, stakeholder, etc.)
  model: varchar("model", { length: 50 }).notNull(), // e.g., "claude-3-sonnet"
  tokensUsed: int("tokensUsed"), // For future billing tracking
  responseTimeMs: int("responseTimeMs"), // Response time in milliseconds
  status: mysqlEnum("status", ["success", "error", "partial"])
    .default("success")
    .notNull(),
  errorMessage: text("errorMessage"), // If status is error
  userFeedback: mysqlEnum("userFeedback", ["helpful", "not_helpful", "none"])
    .default("none")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AIQueryAudit = typeof aiQueryAudit.$inferSelect;
export type InsertAIQueryAudit = typeof aiQueryAudit.$inferInsert;

/**
 * Recovery Audit - Stores all disaster recovery operations for audit trail
 */
export const recoveryAudit = mysqlTable("recoveryAudit", {
  id: int("id").autoincrement().primaryKey(),
  recoveryDate: timestamp("recoveryDate").defaultNow().notNull(),
  companyId: int("companyId").notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  backupFile: varchar("backupFile", { length: 255 }).notNull(),
  backupDate: timestamp("backupDate").notNull(),
  modulesRecovered: longtext("modulesRecovered").notNull(), // JSON array of module names
  processesRecovered: longtext("processesRecovered"), // JSON array of processes with their parts
  recordsCount: int("recordsCount"),
  status: mysqlEnum("status", ["success", "partial", "failed"]).notNull(),
  errorMessage: text("errorMessage"),
  performedByUserId: int("performedByUserId").notNull(),
  performedByName: varchar("performedByName", { length: 255 }).notNull(),
  authorizedByUserId: int("authorizedByUserId"),
  authorizedByName: varchar("authorizedByName", { length: 255 }),
  authorizationDate: timestamp("authorizationDate"),
  reason: text("reason"), // Why recovery was needed
  durationSeconds: int("durationSeconds"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RecoveryAudit = typeof recoveryAudit.$inferSelect;
export type InsertRecoveryAudit = typeof recoveryAudit.$inferInsert;

/**
 * Payroll employees - Master personnel roster for performance evaluation.
 * Active employees are managed in Nómina; inactive employees retain their employment history.
 */
export const payrollEmployees = mysqlTable(
  "payrollEmployees",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    fullName: varchar("fullName", { length: 255 }).notNull(),
    identityCard: varchar("identityCard", { length: 20 }).notNull(),
    hireDate: date("hireDate").notNull(),
    area: varchar("area", { length: 255 }).notNull(),
    position: varchar("position", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["activo", "pasivo"])
      .default("activo")
      .notNull(),
    terminationDate: date("terminationDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    companyIdentityUnique: unique(
      "payrollEmployees_company_identity_unique"
    ).on(table.companyId, table.identityCard),
  })
);

export type PayrollEmployee = typeof payrollEmployees.$inferSelect;
export type InsertPayrollEmployee = typeof payrollEmployees.$inferInsert;

/**
 * Organization Chart - Stores organization structure for each company
 */
export const organizationChart = mysqlTable("organizationChart", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OrganizationChart = typeof organizationChart.$inferSelect;
export type InsertOrganizationChart = typeof organizationChart.$inferInsert;

/**
 * Organization Chart Nodes - Individual positions/roles in the organization chart
 */
export const organizationChartNodes = mysqlTable("organizationChartNodes", {
  id: int("id").autoincrement().primaryKey(),
  chartId: int("chartId").notNull(),
  nodeId: varchar("nodeId", { length: 64 }).notNull(), // Unique identifier for the node (e.g., "node-1", "node-2")
  parentNodeId: varchar("parentNodeId", { length: 64 }), // Reference to parent node (null for root)
  position: varchar("position", { length: 255 }).notNull(), // Job title/position (e.g., "Gerente General")
  department: varchar("department", { length: 255 }), // Department name
  personName: varchar("personName", { length: 255 }), // Name of the person in this position (optional)
  email: varchar("email", { length: 320 }), // Email address
  phone: varchar("phone", { length: 20 }), // Phone number
  responsibilities: longtext("responsibilities"), // Job responsibilities (can be long text)
  salary: decimal("salary", { precision: 12, scale: 2 }), // Annual salary (optional, only for GG view)
  level: int("level").notNull(), // Hierarchical level (0 = CEO, 1 = direct reports, etc.)
  order: int("order").notNull(), // Order within the same level
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OrganizationChartNode = typeof organizationChartNodes.$inferSelect;
export type InsertOrganizationChartNode =
  typeof organizationChartNodes.$inferInsert;

/**
 * Organization Chart Files - PDF files uploaded for the organization chart
 */
export const organizationChartFiles = mysqlTable("organizationChartFiles", {
  id: int("id").autoincrement().primaryKey(),
  chartId: int("chartId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(), // S3 URL
  fileKey: varchar("fileKey", { length: 1024 }).notNull(), // S3 file key
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  uploadedByUserId: int("uploadedByUserId").notNull(),
  uploadedByName: varchar("uploadedByName", { length: 255 }).notNull(),
  fileSizeBytes: int("fileSizeBytes").default(0),
});

export type OrganizationChartFile = typeof organizationChartFiles.$inferSelect;
export type InsertOrganizationChartFile =
  typeof organizationChartFiles.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO: AUDITORÍAS E INSPECCIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sistema de Gestión — registros de sistemas de gestión por empresa,
 * con archivos de certificación y check lists de auditoría.
 */
export const managementSystems = mysqlTable("managementSystems", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  systemName: varchar("systemName", { length: 255 }).notNull().default(""),
  certification: varchar("certification", { length: 255 })
    .notNull()
    .default(""),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ManagementSystem = typeof managementSystems.$inferSelect;
export type InsertManagementSystem = typeof managementSystems.$inferInsert;

/**
 * Archivos adjuntos de sistemas de gestión (certificaciones y check lists).
 */
export const managementSystemFiles = mysqlTable("managementSystemFiles", {
  id: int("id").autoincrement().primaryKey(),
  managementSystemId: int("managementSystemId").notNull(),
  companyId: int("companyId").notNull(),
  fileType: mysqlEnum("fileType", ["certification", "checklist"]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
  fileKey: varchar("fileKey", { length: 1024 }).notNull(),
  fileSizeBytes: int("fileSizeBytes").default(0),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type ManagementSystemFile = typeof managementSystemFiles.$inferSelect;
export type InsertManagementSystemFile =
  typeof managementSystemFiles.$inferInsert;

/**
 * Control de Auditorías — una fila por auditoría realizada.
 */
export const audits = mysqlTable("audits", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  managementSystem: varchar("managementSystem", { length: 255 })
    .notNull()
    .default(""),
  auditDate: varchar("auditDate", { length: 20 }).notNull().default(""),
  auditType: mysqlEnum("auditType", ["Interna", "Externa"])
    .notNull()
    .default("Interna"),
  findingsObservations: int("findingsObservations").notNull().default(0),
  findingsMajorNC: int("findingsMajorNC").notNull().default(0),
  findingsMinorNC: int("findingsMinorNC").notNull().default(0),
  findingsOM: int("findingsOM").notNull().default(0),
  closuresObservations: int("closuresObservations").notNull().default(0),
  closuresMajorNC: int("closuresMajorNC").notNull().default(0),
  closuresMinorNC: int("closuresMinorNC").notNull().default(0),
  closuresOM: int("closuresOM").notNull().default(0),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Audit = typeof audits.$inferSelect;
export type InsertAudit = typeof audits.$inferInsert;

/**
 * Archivos de hallazgos de auditorías (Excel o PDF por fila de auditoría).
 */
export const auditFiles = mysqlTable("auditFiles", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull(),
  companyId: int("companyId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
  fileKey: varchar("fileKey", { length: 1024 }).notNull(),
  fileSizeBytes: int("fileSizeBytes").default(0),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type AuditFile = typeof auditFiles.$inferSelect;
export type InsertAuditFile = typeof auditFiles.$inferInsert;

/**
 * Control de Inspecciones — una fila por inspección realizada.
 */
export const inspections = mysqlTable("inspections", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  managementSystem: varchar("managementSystem", { length: 255 })
    .notNull()
    .default(""),
  inspectionDate: varchar("inspectionDate", { length: 20 })
    .notNull()
    .default(""),
  area: varchar("area", { length: 255 }).notNull().default(""),
  findings: int("findings").notNull().default(0),
  closures: int("closures").notNull().default(0),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Inspection = typeof inspections.$inferSelect;
export type InsertInspection = typeof inspections.$inferInsert;

/**
 * Archivos de hallazgos de inspecciones (Excel o PDF por fila de inspección).
 */
export const inspectionFiles = mysqlTable("inspectionFiles", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: int("inspectionId").notNull(),
  companyId: int("companyId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
  fileKey: varchar("fileKey", { length: 1024 }).notNull(),
  fileSizeBytes: int("fileSizeBytes").default(0),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type InspectionFile = typeof inspectionFiles.$inferSelect;
export type InsertInspectionFile = typeof inspectionFiles.$inferInsert;

/**
 * Process Stakeholder Matrix File - Stores the uploaded Excel matrix file for each process
 */
export const processStakeholderMatrixFiles = mysqlTable(
  "processStakeholderMatrixFiles",
  {
    id: int("id").autoincrement().primaryKey(),
    processId: int("processId").notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    fileKey: text("fileKey").notNull(),
    fileSizeBytes: int("fileSizeBytes").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export type ProcessStakeholderMatrixFile =
  typeof processStakeholderMatrixFiles.$inferSelect;
export type InsertProcessStakeholderMatrixFile =
  typeof processStakeholderMatrixFiles.$inferInsert;

/**
 * Management Programs - Stores programs for each company's management systems
 */
export const managementPrograms = mysqlTable("managementPrograms", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  programName: varchar("programName", { length: 500 }).notNull(),
  managementSystem: varchar("managementSystem", { length: 100 })
    .notNull()
    .default("Calidad"),
  plannedActions: int("plannedActions").default(0),
  completedActions: int("completedActions").default(0),
  planFileKey: text("planFileKey"),
  planFileName: varchar("planFileName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ManagementProgram = typeof managementPrograms.$inferSelect;
export type InsertManagementProgram = typeof managementPrograms.$inferInsert;

/**
 * Stakeholder Surveys - Registra encuestas aplicadas a partes interesadas
 * Cada encuesta puede generar acciones que se vinculan a la tabla criticalityMatrix
 */
export const stakeholderSurveys = mysqlTable("stakeholderSurveys", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  // Datos de control
  surveyName: varchar("surveyName", { length: 500 }).notNull().default(""),
  segment: mysqlEnum("segment", [
    "Clientes",
    "Proveedores Externos",
    "Proveedores Internos",
    "Mixto",
  ])
    .notNull()
    .default("Clientes"),
  surveyDate: varchar("surveyDate", { length: 20 }).default(""),
  sentCount: int("sentCount").default(0),
  respondedCount: int("respondedCount").default(0),
  // KPIs de satisfacción
  nps: int("nps"), // -100 a 100
  csat: int("csat"), // 0 a 100 (%)
  avgRating: varchar("avgRating", { length: 20 }).default(""), // Ej: "4.2/5"
  // Hallazgos cualitativos
  topStrengths: text("topStrengths"), // Top fortalezas mencionadas
  topWeaknesses: text("topWeaknesses"), // Top debilidades mencionadas
  mainFindings: text("mainFindings"), // Resumen ejecutivo de hallazgos
  // Vinculación con acciones (JSON array de criticalityMatrix IDs)
  linkedActionIds: text("linkedActionIds"), // JSON: [1, 2, 3]
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StakeholderSurvey = typeof stakeholderSurveys.$inferSelect;
export type InsertStakeholderSurvey = typeof stakeholderSurveys.$inferInsert;

/**
 * Company Trainings - Stores training records at company level (Sistema de Gestión)
 */
export const companyTrainings = mysqlTable("companyTrainings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  objective: text("objective"),
  type: mysqlEnum("type", ["Mandatoria", "Reglamentaria", "Sugerida"])
    .default("Mandatoria")
    .notNull(),
  audience: varchar("audience", { length: 255 }),
  plannedAttendees: int("plannedAttendees").default(0),
  modality: mysqlEnum("modality", ["Presencial", "Online", "Externa"])
    .default("Presencial")
    .notNull(),
  responsible: varchar("responsible", { length: 255 }),
  plannedDate: date("plannedDate"),
  conductedDate: date("conductedDate"),
  actualAttendees: int("actualAttendees").default(0),
  attendancePercentage: int("attendancePercentage").default(0),
  completed: mysqlEnum("completed", ["SI", "NO"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyTraining = typeof companyTrainings.$inferSelect;
export type InsertCompanyTraining = typeof companyTrainings.$inferInsert;

// Company-level Compliances (Sistema de Gestión)
export const companyCompliances = mysqlTable("companyCompliances", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  requirement: varchar("requirement", { length: 255 }).notNull(),
  description: text("description"),
  obligationType: mysqlEnum("obligationType", [
    "Legal",
    "Reglamentaria",
    "Concesion",
    "Sistema de Gestion",
    "Otros",
  ]).notNull(),
  otherObligationType: varchar("otherObligationType", { length: 255 }),
  responsible: varchar("responsible", { length: 255 }),
  completed: mysqlEnum("completed", ["SI", "NO"]).default("NO").notNull(),
  plannedMonths: varchar("plannedMonths", { length: 50 }),
  completedMonths: varchar("completedMonths", { length: 50 }),
  observations: text("observations"),
  evaluationMode: mysqlEnum("evaluationMode", ["meses", "vigencia"])
    .default("meses")
    .notNull(),
  validFrom: date("validFrom"),
  validUntil: date("validUntil"),
  evidencePdfUrl: varchar("evidencePdfUrl", { length: 1024 }),
  evidencePdfName: varchar("evidencePdfName", { length: 255 }),
  evidencePdfKey: varchar("evidencePdfKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CompanyCompliance = typeof companyCompliances.$inferSelect;
export type InsertCompanyCompliance = typeof companyCompliances.$inferInsert;

// Company-level Strategic Trends (snapshots mensuales de % avance)
export const companyTrends = mysqlTable(
  "companyTrends",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    year: int("year").notNull(),
    month: int("month").notNull(),
    otePercent: decimal("otePercent", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    otgPercent: decimal("otgPercent", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    stakeholderPercent: decimal("stakeholderPercent", {
      precision: 6,
      scale: 2,
    })
      .notNull()
      .default("0"),
    oteMeta: decimal("oteMeta", { precision: 6, scale: 2 })
      .notNull()
      .default("100"),
    otgMeta: decimal("otgMeta", { precision: 6, scale: 2 })
      .notNull()
      .default("100"),
    stakeholderMeta: decimal("stakeholderMeta", { precision: 6, scale: 2 })
      .notNull()
      .default("100"),
    // JSON: { [oeName: string]: number } — porcentaje de cada OE en este snapshot
    oePercentsJson: text("oePercentsJson").default("{}"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    // Un solo snapshot por empresa y período; los cierres posteriores actualizan el mismo mes.
    uniqueCompanyTrendPeriod: unique("company_trends_company_year_month").on(
      table.companyId,
      table.year,
      table.month
    ),
  })
);
export type CompanyTrend = typeof companyTrends.$inferSelect;
export type InsertCompanyTrend = typeof companyTrends.$inferInsert;

// ─── Training Schedules (Cronograma Anual de Capacitación) ────────────────────
export const trainingSchedules = mysqlTable("trainingSchedules", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  year: int("year").notNull(),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileSizeBytes: int("fileSizeBytes").default(0),
  uploadedAt: timestamp("uploadedAt").defaultNow(),
});
export type TrainingSchedule = typeof trainingSchedules.$inferSelect;
export type InsertTrainingSchedule = typeof trainingSchedules.$inferInsert;

// ─── Training Backups (Respaldos por capacitación) ────────────────────────────
export const trainingBackups = mysqlTable("trainingBackups", {
  id: int("id").autoincrement().primaryKey(),
  trainingId: int("trainingId").notNull(),
  companyId: int("companyId").notNull(),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileSizeBytes: int("fileSizeBytes").default(0),
  uploadedAt: timestamp("uploadedAt").defaultNow(),
});
export type TrainingBackup = typeof trainingBackups.$inferSelect;
export type InsertTrainingBackup = typeof trainingBackups.$inferInsert;
