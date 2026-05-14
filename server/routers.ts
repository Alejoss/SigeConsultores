import { COOKIE_NAME } from "@shared/const";
import { sendManagerAccessConfirmationEmail } from "./_core/emailService";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { managerAuthRouter } from "./routers/managerAuth";
import { managerCreationRouter } from "./routers/managerCreation";
import { aiRouter } from "./routers/ai";
import { publicProcedure, router, protectedProcedure, adminProcedure, companyProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { companies, companyValues, processes } from "../drizzle/schema";
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

// Module Customization Router
const moduleCustomizationRouter = router({
  getLabels: publicProcedure
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

  get: publicProcedure
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
    .input(z.object({
      companyId: z.number(),
      moduleName: z.string(),
      label1: z.string().optional(),
      label2: z.string().optional(),
      label3: z.string().optional(),
      label4: z.string().optional(),
      label5: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return upsertModuleCustomization(input.companyId, input.moduleName, {
        label1: input.label1,
        label2: input.label2,
        label3: input.label3,
        label4: input.label4,
        label5: input.label5,
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

    get: publicProcedure
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
    listAll: publicProcedure
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

    list: publicProcedure
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
        obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]),
        otherObligationType: z.string().optional(),
        regulation: z.string().optional(),
        status: z.enum(["Planificado", "En Progreso", "Completado"]).optional(),
        dueDate: z.string().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
        observations: z.string().optional(),
        evidence: z.string().optional(),
        completionPercentage: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await createProcessCompliance(input.processId, {
          tacticalObjectiveId: input.tacticalObjectiveId,
          requirement: input.requirement,
          obligationType: input.obligationType,
          otherObligationType: input.otherObligationType || null,
          regulation: input.regulation,
          status: input.status,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          responsible: input.responsible,
          completed: input.completed,
          observations: input.observations || null,
          evidence: input.evidence,
          completionPercentage: input.completionPercentage,
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
        obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]).optional(),
        otherObligationType: z.string().optional(),
        regulation: z.string().optional(),
        status: z.enum(["Planificado", "En Progreso", "Completado"]).optional(),
        dueDate: z.string().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
        observations: z.string().optional(),
        evidence: z.string().optional(),
        completionPercentage: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateProcessCompliance(input.id, {
          tacticalObjectiveId: input.tacticalObjectiveId,
          requirement: input.requirement,
          obligationType: input.obligationType,
          otherObligationType: input.otherObligationType,
          regulation: input.regulation,
          status: input.status,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          responsible: input.responsible,
          completed: input.completed,
          observations: input.observations,
          evidence: input.evidence,
          completionPercentage: input.completionPercentage,
        });
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


