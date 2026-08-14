import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  criticalityMatrix,
  processCompliances,
  processFODA,
  processTacticalObjectives,
  stakeholders,
} from "../../drizzle/schema";

export interface ConsolidatedScheduleActivity {
  id: string;
  type: "stakeholder" | "foda" | "objective" | "compliance";
  element: string;
  action: string;
  dueDate: Date;
  completed: "SI" | "NO";
  completionField: string;
  badge: string;
  badgeColor: string;
  daysRemaining: number;
  completionPercentage?: number;
}

function calculateDaysRemaining(dueDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getBadgeInfo(type: ConsolidatedScheduleActivity["type"], fodaType?: string) {
  switch (type) {
    case "stakeholder":
      return { badge: "Gestión con Partes Interesadas", color: "bg-blue-100 text-blue-700 border-blue-300" };
    case "foda":
      if (fodaType === "Fortaleza") return { badge: "Fortaleza", color: "bg-green-100 text-green-700 border-green-300" };
      if (fodaType === "Oportunidad") return { badge: "Oportunidad", color: "bg-orange-100 text-orange-700 border-orange-300" };
      if (fodaType === "Debilidad") return { badge: "Debilidad", color: "bg-red-100 text-red-700 border-red-300" };
      if (fodaType === "Amenaza") return { badge: "Amenaza", color: "bg-purple-100 text-purple-700 border-purple-300" };
      return { badge: "FODA", color: "bg-gray-100 text-gray-700 border-gray-300" };
    case "objective":
      return { badge: "OTE", color: "bg-yellow-100 text-yellow-700 border-yellow-300" };
    case "compliance":
      return { badge: "Cumplimientos", color: "bg-pink-100 text-pink-700 border-pink-300" };
  }
}

/**
 * Fuente única de las actividades del Cronograma Consolidado.
 * Toda alerta dirigida a un Jefe de Proceso debe consumir este resultado.
 */
export async function getConsolidatedScheduleActivities(
  processId: number
): Promise<ConsolidatedScheduleActivity[]> {
  const db = await getDb();
  if (!db) return [];

  const activities: ConsolidatedScheduleActivity[] = [];

  // 1. Acciones y seguimiento de Partes Interesadas.
  const criticalityRows = await db
    .select()
    .from(criticalityMatrix)
    .where(eq(criticalityMatrix.processId, processId));
  const stakeholderRows = await db
    .select()
    .from(stakeholders)
    .where(eq(stakeholders.processId, processId));
  const stakeholderMap = new Map(stakeholderRows.map((s: any) => [s.id, s.name]));
  const uniqueStakeholders = new Map<string, any>();

  for (const entry of criticalityRows as any[]) {
    if (!entry.actionToTake?.trim() || !entry.endDate) continue;
    const normalizedAction = entry.actionToTake
      .trim()
      .toLowerCase()
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9áéíóúñü\s]/gi, "");
    const key = `${entry.stakeholderId}|${normalizedAction}`;
    const existing = uniqueStakeholders.get(key);
    if (!existing || new Date(entry.endDate).getTime() > new Date(existing.endDate).getTime()) {
      uniqueStakeholders.set(key, entry);
    }
  }

  for (const entry of uniqueStakeholders.values()) {
    const dueDate = new Date(entry.endDate);
    const contentId = createHash("sha256")
      .update(`${entry.stakeholderId}-${entry.actionToTake.trim().toLowerCase().replace(/\s+/g, " ")}`)
      .digest("hex")
      .substring(0, 12);
    const badge = getBadgeInfo("stakeholder");
    activities.push({
      id: `stakeholder-${contentId}`,
      type: "stakeholder",
      element: stakeholderMap.get(entry.stakeholderId) || "Partes Interesadas",
      action: entry.actionToTake,
      dueDate,
      completed: entry.implementationStatus ? "SI" : "NO",
      completionField: "Implementación",
      badge: badge.badge,
      badgeColor: badge.color,
      daysRemaining: calculateDaysRemaining(dueDate),
      completionPercentage: entry.completionPercentage || 0,
    });
  }

  // 2. Matriz FODA: solo la versión más reciente del proceso.
  const latestFodaRows = await db
    .select()
    .from(processFODA)
    .where(eq(processFODA.processId, processId))
    .orderBy(desc(processFODA.updatedAt))
    .limit(1);
  const latestFoda: any = latestFodaRows[0];
  if (latestFoda?.matrixData) {
    try {
      const matrixRows = typeof latestFoda.matrixData === "string"
        ? JSON.parse(latestFoda.matrixData)
        : latestFoda.matrixData;
      if (Array.isArray(matrixRows)) {
        for (const row of matrixRows) {
          const action = row.accionATomar || row.accionDeAprovechamiento || row.description || "";
          if (!action || !row.fechaFinalPrevista) continue;
          const dueDate = new Date(row.fechaFinalPrevista);
          const badge = getBadgeInfo("foda", row.foda || "FODA");
          const completed = row.objetivoLogrado === "SI" || row.mejoraImplementada === "SI" || row.implementacionCumplio === "SI" ? "SI" : "NO";
          const contentId = createHash("sha256")
            .update(`${action}-${dueDate.toISOString()}-${row.elemento || row.name || ""}`)
            .digest("hex")
            .substring(0, 12);
          activities.push({
            id: `foda-${contentId}`,
            type: "foda",
            element: row.elemento || row.name || "",
            action,
            dueDate,
            completed,
            completionField: "Implementación",
            badge: badge.badge,
            badgeColor: badge.color,
            daysRemaining: calculateDaysRemaining(dueDate),
          });
        }
      }
    } catch {
      // Se omite FODA con JSON malformado sin bloquear el cronograma completo.
    }
  }

  // 3. OTE: tareas de Objetivos Operativos, o el OO cuando no posee tareas.
  const objectives = await db
    .select()
    .from(processTacticalObjectives)
    .where(eq(processTacticalObjectives.processId, processId));
  for (const objective of objectives as any[]) {
    if (!objective.planningData) continue;
    try {
      const planningData = typeof objective.planningData === "string"
        ? JSON.parse(objective.planningData)
        : objective.planningData;
      if (!Array.isArray(planningData?.resultKeys)) continue;
      for (let resultKeyIndex = 0; resultKeyIndex < planningData.resultKeys.length; resultKeyIndex++) {
        const resultKey = planningData.resultKeys[resultKeyIndex];
        const tasks = Array.isArray(resultKey.tasks) ? resultKey.tasks : [];
        const badge = getBadgeInfo("objective");
        if (tasks.length > 0) {
          for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
            const task = tasks[taskIndex];
            if (!task.description || !task.date) continue;
            const dueDate = new Date(task.date);
            const completionPercentage = task.percentageCompleted || 0;
            activities.push({
              id: `objective-task-${objective.id}-${resultKeyIndex}-${taskIndex}`,
              type: "objective",
              element: "OTE",
              action: task.description,
              dueDate,
              completed: completionPercentage === 100 ? "SI" : "NO",
              completionField: `${completionPercentage}%`,
              badge: badge.badge,
              badgeColor: badge.color,
              daysRemaining: calculateDaysRemaining(dueDate),
              completionPercentage,
            });
          }
        } else {
          const dateValue = resultKey.endDate || resultKey.implementationDate || resultKey.startDate;
          if (!resultKey.description || !dateValue) continue;
          const dueDate = new Date(dateValue);
          const completionPercentage = resultKey.porcentajeAlcanzado || 0;
          activities.push({
            id: `objective-oo-${objective.id}-${resultKeyIndex}`,
            type: "objective",
            element: "OTE",
            action: resultKey.description,
            dueDate,
            completed: completionPercentage === 100 ? "SI" : "NO",
            completionField: `${completionPercentage}%`,
            badge: badge.badge,
            badgeColor: badge.color,
            daysRemaining: calculateDaysRemaining(dueDate),
            completionPercentage,
          });
        }
      }
    } catch {
      // Se omite un OTE malformado sin bloquear el cronograma completo.
    }
  }

  // 4. Cumplimientos del proceso.
  const processComplianceRows = await db
    .select()
    .from(processCompliances)
    .where(eq(processCompliances.processId, processId));
  for (const compliance of processComplianceRows as any[]) {
    if (!compliance.requirement || !compliance.dueDate) continue;
    const dueDate = new Date(compliance.dueDate);
    const badge = getBadgeInfo("compliance");
    activities.push({
      id: `compliance-${compliance.id}`,
      type: "compliance",
      element: "Cumplimiento",
      action: compliance.requirement,
      dueDate,
      completed: compliance.completed === "SI" ? "SI" : "NO",
      completionField: "Estado",
      badge: badge.badge,
      badgeColor: badge.color,
      daysRemaining: calculateDaysRemaining(dueDate),
      completionPercentage: compliance.completionPercentage || 0,
    });
  }

  const uniqueActivities = new Map<string, ConsolidatedScheduleActivity>();
  for (const activity of activities) {
    if (!uniqueActivities.has(activity.id)) uniqueActivities.set(activity.id, activity);
  }
  return Array.from(uniqueActivities.values())
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
