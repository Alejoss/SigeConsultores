import { COOKIE_NAME } from "@shared/const";
import { sendManagerAccessConfirmationEmail } from "./_core/emailService";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { managerAuthRouter } from "./routers/managerAuth";
import { managerCreationRouter } from "./routers/managerCreation";
import { aiRouter } from "./routers/ai";
import { publicProcedure, router, protectedProcedure, adminProcedure, companyProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { companies, companyValues, processes, companyTrainings, trainingSchedules, trainingBackups } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  createCompany,
  getCompanyById,
  getUserCompanies,
  upsertCompanyInfo,
  getCompanyInfo,
  addCompanyValue,
  getCompanyValues,
  deleteCompanyValue,
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
  getAllModuleCustomizations,
  createProcess,
  getCompanyProcesses,
  getProcessById,
  createProcessUser,
  getProcessUser,
  approveProcessUser,
  upsertProcessCharacterization,
  getProcessCharacterization,
  upsertSubprocessMap,
  getSubprocessMap,
  createStakeholderCriticality,
  getProcessStakeholderCriticalities,
  deleteStakeholderCriticality,
  updateStakeholderCriticality,
  upsertProcessFODA,
  getProcessFODAAnalysis,
  createProcessRisk,
  getProcessRiskMatrices,
  deleteProcessRisk,
  updateProcessRisk,
  createProcessTacticalObjective,
  getProcessTacticalObjectives,
  deleteProcessTacticalObjective,
  updateProcessTacticalObjective,
  createProcessCompliance,
  getProcessCompliancesList,
  deleteProcessCompliance,
  updateProcessCompliance,
  createProcessTraining,
  getProcessTrainingsList,
  deleteProcessTraining,
  updateProcessTraining,
  createProcessScheduleActivity,
  getProcessScheduleActivities,
  deleteProcessScheduleActivity,
  updateProcessScheduleActivity,
  createProcessIndicator,
  getProcessIndicatorsList,
  deleteProcessIndicator,
  updateProcessIndicator,
  getProcessOwnerInvitationsByEmail,
  getProcessOwner,
  createProcessOwner,
} from "./db";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { subprocessMapRouter } from "./routers/subprocessMap";
import { processMapRouter } from "./routers/processMap";
import { processFODARouter } from "./routers/processFODA";
import { processRiskMatrixRouter } from "./routers/processRiskMatrix";
import { processTacticalObjectivesRouter } from "./routers/processTacticalObjectives";
import { recoveryRouter } from "./routers/recovery";
import { policiesRouter } from "./routers/policies";
import { strategicObjectivesRouter } from "./routers/strategicObjectives";
import { policyObjectivesRouter } from "./routers/policyObjectives";
import { processParticipantsRouter } from "./routers/processParticipants";
import { processResourcesRouter } from "./routers/processResources";
import { processCharacterizationRouter } from "./routers/processCharacterization";
import { consolidatedScheduleRouter } from "./routers/consolidatedSchedule";
import { indicatorsRouter } from "./routers/indicators";
import { consolidatedIndicatorsRouter } from "./routers/consolidatedIndicators";
import { macroIndicatorsRouter } from "./routers/macroIndicators";
import { subprocessNeedsRouter } from "./routers/subprocessNeeds";
import { proceduresRouter } from "./routers/procedures";
import { companyAccessRequestsRouter } from "./routers/companyAccessRequests";
import { managerCredentialsRouter } from "./routers/managerCredentials";
import { processLeaderInvitationsRouter } from "./routers/processLeaderInvitations";
import { adminOperationsRouter } from "./routers/adminOperations";
import { accessInvitationsRouter } from "./routers/accessInvitations";
import { managerInvitationsRouter } from "./routers/managerInvitations";
import { companySetupRouter } from "./routers/companySetup";
import { hierarchicalAccessRouter } from "./routers/hierarchicalAccess";
import { authRouter } from "./routers/authRouter";
import { documentsRouter } from "./routers/documents";
import { passwordResetRouter } from "./routers/passwordResetRouter";
import { processStakeholderCriticalityRouter } from "./routers/processStakeholderCriticality";
import { criticalityMatrixRouter } from "./routers/criticalityMatrix";
import { fodasRouter } from "./routers/fodasRouter";
import { matrixFODAPDFRouter } from "./routers/matrixFODAPDF";
import { resourcesPDFRouter } from "./routers/resourcesPDF";
import { organizationChartRouter } from "./routers/organizationChart";
import { payrollRouter } from "./routers/payroll";
import { auditsInspectionsRouter } from "./routers/auditsInspections";
import { managementProgramsRouter } from "./routers/managementPrograms";
import { stakeholderSurveysRouter } from "./routers/stakeholderSurveys";
import { strategicTrendsRouter } from "./routers/strategicTrends";
import { planningCyclesRouter } from "./routers/planningCycles";

// Module Customization Router
const moduleCustomizationRouter = router({
  getLabels: companyProcedure
    .input(z.object({
      companyId: z.number(),
    }))
    .query(async ({ input }) => {
      try {
        const customizations = await getAllModuleCustomizations(input.companyId);
        const labels: Record<string, any> = {};
        customizations.forEach((item) => {
          labels[item.moduleName] = item;
        });
        return labels;
      } catch (error) {
        console.error("[ModuleCustomization] Get labels error:", error);
        return {};
      }
    }),

  get: companyProcedure
    .input(z.object({
      companyId: z.number(),
      moduleName: z.string(),
    }))
    .query(async ({ input }) => {
      return getModuleCustomization(input.companyId, input.moduleName);
    }),

  getAll: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return getAllModuleCustomizations(input.companyId);
    }),

  upsert: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        moduleName: z.string(),
        label: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return upsertModuleCustomization(input.companyId, input.moduleName, {
        label: input.label,
      });
    }),

  delete: adminProcedure
    .input(z.object({
      companyId: z.number(),
      moduleName: z.string(),
    }))
    .mutation(async ({ input }) => {
      return deleteModuleCustomization(input.companyId, input.moduleName);
    }),
});

export const appRouter = router({
  system: systemRouter,

  auth: authRouter,
  managerAuth: managerAuthRouter,
  managerCreation: managerCreationRouter,
  passwordReset: passwordResetRouter,
  ai: aiRouter,

  // Process Management
  process: router({
    create: companyProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.id || 0;
        await createCompany(input.name, input.description || "", userId);
        return { success: true, message: "Empresa creada exitosamente" };
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        const userId = ctx.user?.id || 0;
        return getUserCompanies(userId);
      }),

    get: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getCompanyById(input.companyId);
      }),

    update: companyProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.update(companies)
          .set({
            name: input.name,
            description: input.description || null,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, input.id));
        
        return { success: true, message: "Empresa actualizada exitosamente" };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.delete(companies)
          .where(eq(companies.id, input.id));
        
        return { success: true, message: "Empresa eliminada exitosamente" };
      }),
  }),

  // Company Info (Propósito, Misión, Visión)
  companyInfo: router({
    upsert: companyProcedure
      .input(z.object({
        companyId: z.number(),
        proposito: z.string().optional(),
        mision: z.string().optional(),
        vision: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return upsertCompanyInfo(
          input.companyId,
          input.proposito || "",
          input.mision || "",
          input.vision || ""
        );
      }),

    get: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getCompanyInfo(input.companyId);
      }),
  }),

  // Company Values (Valores Empresariales)
  companyValues: router({
    add: companyProcedure
      .input(z.object({
        companyId: z.number(),
        value: z.string().min(1),
        description: z.string().optional(),
        orderIndex: z.number(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.insert(companyValues).values({
          companyId: input.companyId,
          value: input.value,
          description: input.description || null,
          orderIndex: input.orderIndex,
        });
        return { success: true, message: "Valor agregado exitosamente" };
      }),

    list: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getCompanyValues(input.companyId);
      }),

    delete: companyProcedure
      .input(z.object({ valueId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCompanyValue(input.valueId);
        return { success: true };
      }),
  }),

  // Processes (Mapa de Procesos)
  processes: router({
    listAll: adminProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return [];

        const allProcesses = await db.select().from(processes);
        return allProcesses.map(p => ({
          id: p.id,
          name: p.name,
          processType: p.processType,
          description: p.description,
          companyId: p.companyId,
        }));
      }),
    update: companyProcedure
      .input(z.object({
        processId: z.number(),
        name: z.string().min(1),
        processType: z.enum(["estrategico", "misional", "soporte"]),
        description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.update(processes)
          .set({
            name: input.name,
            processType: input.processType,
            description: input.description || null,
            updatedAt: new Date(),
          })
          .where(eq(processes.id, input.processId));
        
        return { success: true, message: "Proceso actualizado exitosamente" };
      }),

    list: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getCompanyProcesses(input.companyId);
      }),

    get: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input }) => {
        return getProcessById(input.processId);
      }),
  }),

  // Process Users (Autenticación por Proceso)
  processUser: router({
    requestAccess: companyProcedure
      .input(
        z.object({
          processId: z.number(),
          approverEmail: z.string().email(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const accountId = ctx.user?.id || 0;
        await createProcessUser(input.processId, accountId, input.approverEmail);
        return {
          success: true,
          message: "Solicitud enviada al aprobador",
        };
      }),

    get: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input, ctx }) => {
        return getProcessUser(input.processId, ctx.user?.id || 0);
      }),

    approve: companyProcedure
      .input(z.object({ processUserId: z.number() }))
      .mutation(async ({ input }) => {
        await approveProcessUser(input.processUserId);
        return { success: true };
      }),
  }),

  // Subprocess Map
  subprocessMap: subprocessMapRouter,

  // Process Map
  processMap: processMapRouter,

  // Company Access Requests
  companyAccessRequests: companyAccessRequestsRouter,

  // Manager Credentials
  managerCredentials: managerCredentialsRouter,

  // Process Leader Invitations
  processLeaderInvitations: processLeaderInvitationsRouter,

  // Admin Operations
  adminOperations: adminOperationsRouter,

  // Company Setup
  companySetup: companySetupRouter,

  // Access Invitations
  accessInvitations: accessInvitationsRouter,
  managerInvitations: managerInvitationsRouter,

  // Process FODA
  processFODA: processFODARouter,

  // Process Risk Matrix
  processRiskMatrix: processRiskMatrixRouter,

  // Process Tactical Objectives
  processTacticalObjectives: processTacticalObjectivesRouter,

  // Recovery Audit
  recovery: recoveryRouter,

  // Organization Chart
  organizationChart: organizationChartRouter,
  payroll: payrollRouter,

  // Process Stakeholder Criticality
  processStakeholderCriticality: processStakeholderCriticalityRouter,

  // Criticality Matrix
  criticalityMatrix: criticalityMatrixRouter,

  // Company FODA
  fodasRouter: fodasRouter,
  matrixFODAPDF: matrixFODAPDFRouter,

  // Policies
  policies: policiesRouter,

  // Strategic Objectives
  strategicObjectives: strategicObjectivesRouter,

  // Policy Objectives
  policyObjectives: policyObjectivesRouter,

  // Process Participants
  processParticipants: processParticipantsRouter,

  // Process Resources
  processResources: processResourcesRouter,
  resourcesPDF: resourcesPDFRouter,

  // Process Characterization
  processCharacterization: processCharacterizationRouter,
  planningCycles: planningCyclesRouter,



  // Stakeholder Criticality
  stakeholderCriticality: router({
    create: companyProcedure
      .input(z.object({
        processId: z.number(),
        name: z.string(),
        type: z.string().optional(),
        influence: z.number().optional(),
        dependence: z.number().optional(),
        criticality: z.number().optional(),
        actionToTake: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        completed: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await createStakeholderCriticality(input.processId, {
          name: input.name,
          type: input.type,
          influence: input.influence,
          dependence: input.dependence,
          criticality: input.criticality,
          actionToTake: input.actionToTake,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          completed: input.completed,
        });
        return { success: true };
      }),

    list: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input }) => {
        return getProcessStakeholderCriticalities(input.processId);
      }),

    delete: companyProcedure
      .input(z.object({ criticalityId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteStakeholderCriticality(input.criticalityId);
        return { success: true };
      }),

    update: companyProcedure
      .input(z.object({
        criticalityId: z.number(),
        name: z.string().optional(),
        type: z.string().optional(),
        influence: z.number().optional(),
        dependence: z.number().optional(),
        criticality: z.number().optional(),
        actionToTake: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        completed: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateStakeholderCriticality(input.criticalityId, {
          name: input.name,
          type: input.type,
          influence: input.influence,
          dependence: input.dependence,
          criticality: input.criticality,
          actionToTake: input.actionToTake,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          completed: input.completed,
        });
        return { success: true };
      }),
  }),





  // Process Compliances
  processCompliances: router({
    create: companyProcedure
      .input(z.object({
        processId: z.number(),
        tacticalObjectiveId: z.number().optional(),
        requirement: z.string(),
        description: z.string().optional(),
        obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]),
        otherObligationType: z.string().optional(),
        regulation: z.string().optional(),
        status: z.enum(["Planificado", "En Progreso", "Completado"]).optional(),
        dueDate: z.string().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
        plannedMonths: z.string().optional(),
        completedMonths: z.string().optional(),
        observations: z.string().optional(),
        evidence: z.string().optional(),
        completionPercentage: z.number().optional(),
        evaluationMode: z.enum(["meses", "vigencia"]).optional(),
        validFrom: z.string().nullable().optional(),
        validUntil: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await createProcessCompliance(input.processId, {
          tacticalObjectiveId: input.tacticalObjectiveId,
          requirement: input.requirement,
          description: input.description || null,
          obligationType: input.obligationType,
          otherObligationType: input.otherObligationType || null,
          regulation: input.regulation,
          status: input.status,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          responsible: input.responsible,
          completed: input.completed,
          plannedMonths: input.plannedMonths || null,
          completedMonths: input.completedMonths || null,
          observations: input.observations || null,
          evidence: input.evidence,
          completionPercentage: input.completionPercentage,
          evaluationMode: input.evaluationMode,
          validFrom: input.validFrom ?? null,
          validUntil: input.validUntil ?? null,
        });
        return { success: true };
      }),

    list: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input }) => {
        return getProcessCompliancesList(input.processId);
      }),

    delete: companyProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteProcessCompliance(input.id);
        return { success: true };
      }),

    update: companyProcedure
      .input(z.object({
        id: z.number(),
        tacticalObjectiveId: z.number().optional(),
        requirement: z.string().optional(),
        description: z.string().optional(),
        obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]).optional(),
        otherObligationType: z.string().optional(),
        regulation: z.string().optional(),
        status: z.enum(["Planificado", "En Progreso", "Completado"]).optional(),
        dueDate: z.string().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
        plannedMonths: z.string().optional(),
        completedMonths: z.string().optional(),
        observations: z.string().optional(),
        evidence: z.string().optional(),
        completionPercentage: z.number().optional(),
        evaluationMode: z.enum(["meses", "vigencia"]).optional(),
        validFrom: z.string().nullable().optional(),
        validUntil: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateProcessCompliance(input.id, {
          tacticalObjectiveId: input.tacticalObjectiveId,
          requirement: input.requirement,
          description: input.description,
          obligationType: input.obligationType,
          otherObligationType: input.otherObligationType,
          regulation: input.regulation,
          status: input.status,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          responsible: input.responsible,
          completed: input.completed,
          plannedMonths: input.plannedMonths,
          completedMonths: input.completedMonths,
          observations: input.observations,
          evidence: input.evidence,
          completionPercentage: input.completionPercentage,
          evaluationMode: input.evaluationMode,
          validFrom: input.validFrom,
          validUntil: input.validUntil,
        });
        return { success: true };
      }),
  }),

  // Company-level Compliances (Sistema de Gestión)
  companyCompliances: router({
    list: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { companyCompliances: tbl } = await import("../drizzle/schema");
        return await db.select().from(tbl).where(eq(tbl.companyId, input.companyId));
      }),
    create: companyProcedure
      .input(z.object({
        companyId: z.number(),
        requirement: z.string().min(1),
        description: z.string().optional(),
        obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]),
        otherObligationType: z.string().optional(),
        responsible: z.string().optional(),
        plannedMonths: z.string().optional(),
        completedMonths: z.string().optional(),
        observations: z.string().optional(),
        evaluationMode: z.enum(["meses", "vigencia"]).optional(),
        validFrom: z.string().optional(),
        validUntil: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("No DB");
        const { companyCompliances: tbl } = await import("../drizzle/schema");
        await db.insert(tbl).values({
          companyId: input.companyId,
          requirement: input.requirement,
          description: input.description ?? null,
          obligationType: input.obligationType,
          otherObligationType: input.otherObligationType ?? null,
          responsible: input.responsible ?? null,
          completed: "NO",
          plannedMonths: input.plannedMonths ?? null,
          completedMonths: input.completedMonths ?? null,
          observations: input.observations ?? null,
          evaluationMode: input.evaluationMode ?? "meses",
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
        });
        return { success: true };
      }),
    update: companyProcedure
      .input(z.object({
        id: z.number(),
        requirement: z.string().min(1).optional(),
        description: z.string().optional(),
        obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]).optional(),
        otherObligationType: z.string().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
        plannedMonths: z.string().optional(),
        completedMonths: z.string().optional(),
        observations: z.string().optional(),
        evaluationMode: z.enum(["meses", "vigencia"]).optional(),
        validFrom: z.string().nullable().optional(),
        validUntil: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("No DB");
        const { companyCompliances: tbl } = await import("../drizzle/schema");
        const { id, validFrom, validUntil, ...rest } = input;
        await db.update(tbl).set({
          ...rest,
          updatedAt: new Date(),
          validFrom: validFrom !== undefined ? (validFrom ? new Date(validFrom) : null) : undefined,
          validUntil: validUntil !== undefined ? (validUntil ? new Date(validUntil) : null) : undefined,
        }).where(eq(tbl.id, id));
        return { success: true };
      }),
    delete: companyProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("No DB");
        const { companyCompliances: tbl } = await import("../drizzle/schema");
        await db.delete(tbl).where(eq(tbl.id, input.id));
        return { success: true };
      }),
  }),

  // Process Trainings
  processTrainings: router({
    create: companyProcedure
      .input(z.object({
        processId: z.number(),
        name: z.string(),
        objective: z.string().optional(),
        type: z.enum(["Mandatoria", "Reglamentaria", "Sugerida"]).optional(),
        audience: z.string().optional(),
        plannedAttendees: z.number().optional(),
        modality: z.enum(["Presencial", "Online", "Externa"]).optional(),
        plannedDate: z.string().optional(),
        conductedDate: z.string().optional(),
        actualAttendees: z.number().optional(),
        attendancePercentage: z.number().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
      }))
      .mutation(async ({ input }) => {
        await createProcessTraining(input.processId, {
          name: input.name,
          objective: input.objective,
          type: input.type,
          audience: input.audience,
          plannedAttendees: input.plannedAttendees,
          modality: input.modality,
          plannedDate: input.plannedDate ? new Date(input.plannedDate) : undefined,
          conductedDate: input.conductedDate ? new Date(input.conductedDate) : undefined,
          actualAttendees: input.actualAttendees,
          attendancePercentage: input.attendancePercentage,
          responsible: input.responsible,
          completed: input.completed,
        });
        return { success: true };
      }),

    list: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input }) => {
        return getProcessTrainingsList(input.processId);
      }),

    delete: companyProcedure
      .input(z.object({ trainingId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteProcessTraining(input.trainingId);
        return { success: true };
      }),
    update: companyProcedure
      .input(z.object({
        trainingId: z.number(),
        name: z.string().optional(),
        objective: z.string().optional(),
        type: z.enum(["Mandatoria", "Reglamentaria", "Sugerida"]).optional(),
        audience: z.string().optional(),
        plannedAttendees: z.number().optional(),
        modality: z.enum(["Presencial", "Online", "Externa"]).optional(),
        plannedDate: z.string().optional(),
        conductedDate: z.string().optional(),
        actualAttendees: z.number().optional(),
        attendancePercentage: z.number().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
      }))
      .mutation(async ({ input }) => {
        await updateProcessTraining(input.trainingId, {
          name: input.name,
          objective: input.objective,
          type: input.type,
          audience: input.audience,
          plannedAttendees: input.plannedAttendees,
          modality: input.modality,
          plannedDate: input.plannedDate ? new Date(input.plannedDate) : undefined,
          conductedDate: input.conductedDate ? new Date(input.conductedDate) : undefined,
          actualAttendees: input.actualAttendees,
          attendancePercentage: input.attendancePercentage,
          responsible: input.responsible,
          completed: input.completed,
        });
        return { success: true };
      }),
  }),

  // Process Schedule Activities
  processSchedule: router({
    create: companyProcedure
      .input(z.object({
        processId: z.number(),
        tacticalObjectiveId: z.number().optional(),
        name: z.string(),
        type: z.string().optional(),
        status: z.enum(["Planificado", "En Progreso", "Completado"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        responsible: z.string().optional(),
        priority: z.enum(["Baja", "Media", "Alta"]).optional(),
        progress: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await createProcessScheduleActivity(input.processId, {
          tacticalObjectiveId: input.tacticalObjectiveId,
          name: input.name,
          type: input.type,
          status: input.status,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          responsible: input.responsible,
          priority: input.priority,
          progress: input.progress,
        });
        return { success: true };
      }),

    list: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input }) => {
        return getProcessScheduleActivities(input.processId);
      }),

    delete: companyProcedure
      .input(z.object({ activityId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteProcessScheduleActivity(input.activityId);
        return { success: true };
      }),

    update: companyProcedure
      .input(z.object({
        activityId: z.number(),
        tacticalObjectiveId: z.number().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
        status: z.enum(["Planificado", "En Progreso", "Completado"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        responsible: z.string().optional(),
        priority: z.enum(["Baja", "Media", "Alta"]).optional(),
        progress: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateProcessScheduleActivity(input.activityId, {
          tacticalObjectiveId: input.tacticalObjectiveId,
          name: input.name,
          type: input.type,
          status: input.status,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          responsible: input.responsible,
          priority: input.priority,
          progress: input.progress,
        });
        return { success: true };
      }),
  }),

  // Process Indicators
  processIndicators: router({
    create: companyProcedure
      .input(z.object({
        processId: z.number(),
        tacticalObjectiveId: z.number().optional(),
        name: z.string(),
        formula: z.string().optional(),
        unit: z.string().optional(),
        target: z.string().optional(),
        currentValue: z.string().optional(),
        frequency: z.string().optional(),
        responsible: z.string().optional(),
        performance: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await createProcessIndicator(input.processId, {
          tacticalObjectiveId: input.tacticalObjectiveId,
          name: input.name,
          formula: input.formula,
          unit: input.unit,
          target: input.target,
          currentValue: input.currentValue,
          frequency: input.frequency,
          responsible: input.responsible,
          performance: input.performance,
        });
        return { success: true };
      }),

    list: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input }) => {
        return getProcessIndicatorsList(input.processId);
      }),

    delete: companyProcedure
      .input(z.object({ indicatorId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteProcessIndicator(input.indicatorId);
        return { success: true };
      }),

    update: companyProcedure
      .input(z.object({
        indicatorId: z.number(),
        tacticalObjectiveId: z.number().optional(),
        name: z.string().optional(),
        formula: z.string().optional(),
        unit: z.string().optional(),
        target: z.string().optional(),
        currentValue: z.string().optional(),
        frequency: z.string().optional(),
        responsible: z.string().optional(),
        performance: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateProcessIndicator(input.indicatorId, {
          tacticalObjectiveId: input.tacticalObjectiveId,
          name: input.name,
          formula: input.formula,
          unit: input.unit,
          target: input.target,
          currentValue: input.currentValue,
          frequency: input.frequency,
          responsible: input.responsible,
          performance: input.performance,
        });
        return { success: true };
      }),
  }),

  // Consolidated Schedule
  consolidatedSchedule: consolidatedScheduleRouter,
  indicators: indicatorsRouter,
  consolidatedIndicators: consolidatedIndicatorsRouter,
  macroIndicators: macroIndicatorsRouter,
  subprocessNeeds: subprocessNeedsRouter,
  procedures: proceduresRouter,
  moduleCustomization: moduleCustomizationRouter,
  hierarchicalAccess: hierarchicalAccessRouter,
  documents: documentsRouter,
  auditsInspections: auditsInspectionsRouter,
  managementPrograms: managementProgramsRouter,
  stakeholderSurveys: stakeholderSurveysRouter,
  strategicTrends: strategicTrendsRouter,

  // Company Trainings (Capacitaciones a nivel empresa)
  companyTrainings: router({
    create: companyProcedure
      .input(z.object({
        companyId: z.number(),
        name: z.string(),
        objective: z.string().optional(),
        type: z.enum(["Mandatoria", "Reglamentaria", "Sugerida"]).optional(),
        audience: z.string().optional(),
        plannedAttendees: z.number().optional(),
        modality: z.enum(["Presencial", "Online", "Externa"]).optional(),
        responsible: z.string().optional(),
        plannedDate: z.string().optional(),
        conductedDate: z.string().optional(),
        actualAttendees: z.number().optional(),
        attendancePercentage: z.number().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.insert(companyTrainings).values({
          companyId: input.companyId,
          name: input.name,
          objective: input.objective || null,
          type: input.type || "Mandatoria",
          audience: input.audience || null,
          plannedAttendees: input.plannedAttendees || 0,
          modality: input.modality || "Presencial",
          responsible: input.responsible || null,
          plannedDate: input.plannedDate ? new Date(input.plannedDate) : null,
          conductedDate: input.conductedDate ? new Date(input.conductedDate) : null,
          actualAttendees: input.actualAttendees || 0,
          attendancePercentage: input.attendancePercentage || 0,
          completed: input.completed || null,
        });
        return { success: true };
      }),

    list: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(companyTrainings)
          .where(eq(companyTrainings.companyId, input.companyId));
      }),

    delete: companyProcedure
      .input(z.object({ trainingId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(companyTrainings)
          .where(eq(companyTrainings.id, input.trainingId));
        return { success: true };
      }),

    update: companyProcedure
      .input(z.object({
        trainingId: z.number(),
        name: z.string().optional(),
        objective: z.string().optional(),
        type: z.enum(["Mandatoria", "Reglamentaria", "Sugerida"]).optional(),
        audience: z.string().optional(),
        plannedAttendees: z.number().optional(),
        modality: z.enum(["Presencial", "Online", "Externa"]).optional(),
        responsible: z.string().optional(),
        plannedDate: z.string().optional(),
        conductedDate: z.string().optional(),
        actualAttendees: z.number().optional(),
        attendancePercentage: z.number().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { trainingId, ...fields } = input;
        await db.update(companyTrainings)
          .set({
            ...(fields.name !== undefined && { name: fields.name }),
            ...(fields.objective !== undefined && { objective: fields.objective }),
            ...(fields.type !== undefined && { type: fields.type }),
            ...(fields.audience !== undefined && { audience: fields.audience }),
            ...(fields.plannedAttendees !== undefined && { plannedAttendees: fields.plannedAttendees }),
            ...(fields.modality !== undefined && { modality: fields.modality }),
            ...(fields.responsible !== undefined && { responsible: fields.responsible }),
            ...(fields.plannedDate !== undefined && { plannedDate: fields.plannedDate ? new Date(fields.plannedDate) : null }),
            ...(fields.conductedDate !== undefined && { conductedDate: fields.conductedDate ? new Date(fields.conductedDate) : null }),
            ...(fields.actualAttendees !== undefined && { actualAttendees: fields.actualAttendees }),
            ...(fields.attendancePercentage !== undefined && { attendancePercentage: fields.attendancePercentage }),
            ...(fields.completed !== undefined && { completed: fields.completed }),
            updatedAt: new Date(),
          })
          .where(eq(companyTrainings.id, trainingId));
        return { success: true };
      }),

    // Borrar todas las capacitaciones de una empresa (para reimportación limpia)
    clearByCompany: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(companyTrainings)
          .where(eq(companyTrainings.companyId, input.companyId));
        return { success: true };
      }),

    // Importación masiva desde Excel (filas ya parseadas en el cliente)
    importBulk: companyProcedure
      .input(z.object({
        companyId: z.number(),
        rows: z.array(z.object({
          name: z.string(),
          type: z.enum(["Mandatoria", "Reglamentaria", "Sugerida"]).optional(),
          objective: z.string().optional(),
          audience: z.string().optional(),
          plannedAttendees: z.number().optional(),
          modality: z.enum(["Presencial", "Online", "Externa"]).optional(),
          responsible: z.string().optional(),
          plannedDate: z.string().optional(),
          completed: z.enum(["SI", "NO"]).optional(),
          conductedDate: z.string().optional(),
          actualAttendees: z.number().optional(),
        }))
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        if (input.rows.length === 0) return { inserted: 0 };
        await db.insert(companyTrainings).values(
          input.rows.map(row => {
            const planned = row.plannedAttendees || 0;
            const actual = row.actualAttendees || 0;
            const attendance = planned > 0 ? Math.round((actual / planned) * 100) : 0;
            return {
              companyId: input.companyId,
              name: row.name,
              type: row.type || "Mandatoria",
              objective: row.objective || null,
              audience: row.audience || null,
              plannedAttendees: planned,
              modality: row.modality || "Presencial",
              responsible: row.responsible || null,
              plannedDate: row.plannedDate ? new Date(row.plannedDate) : null,
              completed: row.completed || null,
              conductedDate: row.conductedDate ? new Date(row.conductedDate) : null,
              actualAttendees: actual,
              attendancePercentage: attendance,
            };
          })
        );
        return { inserted: input.rows.length };
      }),
  }),

  // Training Schedules (Cronograma Anual de Capacitación)
  trainingSchedules: router({
    upsert: companyProcedure
      .input(z.object({
        companyId: z.number(),
        year: z.number(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileKey: z.string(),
        fileSizeBytes: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        // Delete existing schedule for this company+year and insert new one
        await db.delete(trainingSchedules)
          .where(eq(trainingSchedules.companyId, input.companyId));
        await db.insert(trainingSchedules).values({
          companyId: input.companyId,
          year: input.year,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileKey: input.fileKey,
          fileSizeBytes: input.fileSizeBytes || 0,
        });
        return { success: true };
      }),
    get: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(trainingSchedules)
          .where(eq(trainingSchedules.companyId, input.companyId))
          .limit(1);
        return rows[0] || null;
      }),
    delete: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(trainingSchedules)
          .where(eq(trainingSchedules.companyId, input.companyId));
        return { success: true };
      }),
  }),

  // Training Backups (Respaldos por capacitación)
  trainingBackups: router({
    add: companyProcedure
      .input(z.object({
        trainingId: z.number(),
        companyId: z.number(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileKey: z.string(),
        fileSizeBytes: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.insert(trainingBackups).values({
          trainingId: input.trainingId,
          companyId: input.companyId,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileKey: input.fileKey,
          fileSizeBytes: input.fileSizeBytes || 0,
        });
        return { success: true };
      }),
    list: companyProcedure
      .input(z.object({ trainingId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(trainingBackups)
          .where(eq(trainingBackups.trainingId, input.trainingId));
      }),
    delete: companyProcedure
      .input(z.object({ backupId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(trainingBackups)
          .where(eq(trainingBackups.id, input.backupId));
        return { success: true };
      }),
  }),

  testEmail: adminProcedure
    .input(z.object({
      email: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      const result = await sendManagerAccessConfirmationEmail(
        input.email,
        'Test Company',
        'https://sigeplatf-me7scwrb.manus.space'
      );
      return {
        success: result,
        message: result ? 'Email sent successfully' : 'Failed to send email',
      };
    }),
});

export type AppRouter = typeof appRouter;

// Helper function to validate password strength
export function validatePassword(password: string): boolean {
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  return hasMinLength && hasUpperCase && hasNumber && hasSpecialChar;
}


