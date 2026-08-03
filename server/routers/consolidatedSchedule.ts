import crypto from "crypto";
import { z } from "zod";
import { getDb } from "../db";
import {
  criticalityMatrix,
  stakeholders,
  processFODA,
  processTacticalObjectives,
  processCompliances,
} from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { companyProcedure, router } from "../_core/trpc";

export interface ScheduleActivity {
  id: string;
  type: "stakeholder" | "foda" | "objective" | "compliance";
  element: string;
  action: string;
  dueDate: Date;
  completed: "SI" | "NO";
  completionField: string;
  badge: string;
  badgeColor: string;
  daysRemaining?: number;
  completionPercentage?: number;
}

function calculateDaysRemaining(dueDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getBadgeInfo(type: string, fodaType?: string): { badge: string; color: string } {
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
    default:
      return { badge: "Actividad", color: "bg-gray-100 text-gray-700 border-gray-300" };
  }
}

export const consolidatedScheduleRouter = router({
  debugCriticality: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { error: "No DB" };

      const criticalityEntries = await db
        .select()
        .from(criticalityMatrix)
        .where(eq(criticalityMatrix.processId, input.processId));

      return {
        totalRows: criticalityEntries.length,
        entries: criticalityEntries.map((e: any) => ({
          id: e.id,
          stakeholderId: e.stakeholderId,
          actionToTake: e.actionToTake,
          startDate: e.startDate,
          endDate: e.endDate,
          actionLength: e.actionToTake?.length || 0,
          actionHash: e.actionToTake?.substring(0, 50) || "NULL",
        })),
      };
    }),

  getConsolidatedSchedule: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const activities: ScheduleActivity[] = [];

      try {        // 1. Criticality Matrix - Get actions from "Acciones y Seguimiento"
        // IMPORTANT: Only select records that have BOTH actionToTake AND endDate (not null)
        // This filters out matrix entries that don't have follow-up actions
        const allCriticalityRecords = await db
          .select()
          .from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, input.processId));
        
        // Filter to only records with actual actions and dates
        const criticalityEntries = allCriticalityRecords.filter((record: any) => {
          return record.actionToTake && record.actionToTake.trim() !== '' && record.endDate;
        });
                console.log(`[DEBUG] Total criticality records (with actions): ${criticalityEntries.length}`);
        console.log(`[DEBUG] Filtered out ${allCriticalityRecords.length - criticalityEntries.length} records without actions/dates`);        criticalityEntries.slice(0, 5).forEach((e: any, i: number) => {
          console.log(`  [${i}] stakeholder=${e.stakeholderId}, action="${e.actionToTake}", endDate=${e.endDate}`);
        });

        // Also get stakeholder names for better display
        const stakeholdersList = await db
          .select()
          .from(stakeholders)
          .where(eq(stakeholders.processId, input.processId));
        
        const stakeholderMap = new Map(stakeholdersList.map((s: any) => [s.id, s.name]));

        // Deduplicate criticality entries by (stakeholderId, normalizedAction) ONLY
        // Same action for same stakeholder should appear only ONCE, even if it has multiple endDates
        // We keep the entry with the LATEST endDate (most recent deadline)
        const uniqueCriticalityMap = new Map<string, any>();
        
        criticalityEntries.forEach((entry: any) => {
          if (entry.actionToTake && entry.endDate) {
            // Normalize actionToTake: trim, lowercase, collapse multiple spaces/newlines to single space, remove special chars
            const normalizedAction = entry.actionToTake
              .trim()
              .toLowerCase()
              .replace(/[\r\n\t]+/g, ' ')  // Replace newlines and tabs with space
              .replace(/\s+/g, ' ')  // Collapse multiple spaces to single space
              .replace(/[^a-z0-9\s]/g, '');  // Remove special characters except spaces and numbers
            
            // Create a unique key based ONLY on stakeholder and normalized action
            // This ensures the same action for the same stakeholder appears only once
            const uniqueKey = `${entry.stakeholderId}|${normalizedAction}`;
            
            // Keep the entry with the latest endDate
            if (!uniqueCriticalityMap.has(uniqueKey)) {
              uniqueCriticalityMap.set(uniqueKey, entry);
              console.log(`[DEBUG] NEW: key="${uniqueKey}"`);
            } else {
              // Compare endDates and keep the latest one
              const existing = uniqueCriticalityMap.get(uniqueKey);
              const existingDate = new Date(existing.endDate).getTime();
              const currentDate = new Date(entry.endDate).getTime();
              if (currentDate > existingDate) {
                console.log(`[DEBUG] UPDATE: key="${uniqueKey}", oldDate=${existing.endDate}, newDate=${entry.endDate}`);
                uniqueCriticalityMap.set(uniqueKey, entry);
              } else {
                console.log(`[DEBUG] SKIP: key="${uniqueKey}", keeping oldDate=${existing.endDate}`);
              }
            }
          }
        });
        
        console.log(`[DEBUG] After deduplication: ${uniqueCriticalityMap.size} unique entries`);

        // Process the deduplicated entries
        uniqueCriticalityMap.forEach((entry: any) => {
          const dueDate = new Date(entry.endDate);
          const badgeInfo = getBadgeInfo("stakeholder");
          const stakeholderName = stakeholderMap.get(entry.stakeholderId) || "Partes Interesadas";
          
          // Generate ID based on normalized content (without endDate for consistency)
          const normalizedAction = entry.actionToTake
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
          const contentHash = `${entry.stakeholderId}-${normalizedAction}`;
          const contentId = crypto.createHash('sha256').update(contentHash).digest('hex').substring(0, 12);
          
          activities.push({
            id: `stakeholder-${contentId}`,
            type: "stakeholder",
            element: stakeholderName,
            action: entry.actionToTake,
            dueDate: dueDate,
            completed: entry.implementationStatus ? "SI" : "NO",
            completionField: "Implementación",
            badge: badgeInfo.badge,
            badgeColor: badgeInfo.color,
            daysRemaining: calculateDaysRemaining(dueDate),
            completionPercentage: entry.completionPercentage || 0,
          });
        });

        // 2. Matriz FODA - Parse matrixData JSON
        // Load ONLY the most recent FODA entry at DB level to avoid duplicates
        const fodaDataRows = await db
          .select()
          .from(processFODA)
          .where(eq(processFODA.processId, input.processId))
          .orderBy(desc(processFODA.updatedAt))
          .limit(1);

        const latestFoda = fodaDataRows.length > 0 ? fodaDataRows[0] : null;

        if (latestFoda) {
          const f = latestFoda;
          try {
            if (f.matrixData) {
              const matrixArray = typeof f.matrixData === 'string' 
                ? JSON.parse(f.matrixData) 
                : f.matrixData;

              if (Array.isArray(matrixArray)) {
                matrixArray.forEach((row: any) => {
                  let action = "";
                  let dueDate: Date | null = null;
                  let completed = "NO";
                  let fodaType = row.foda || "FODA";

                  // Determine action - use accionATomar (it's the field name in the data)
                  action = row.accionATomar || row.accionDeAprovechamiento || row.description || "";

                  // Get date from fechaFinalPrevista
                  if (row.fechaFinalPrevista) {
                    dueDate = new Date(row.fechaFinalPrevista);
                  }

                  // Get completion status - check objetivoLogrado or mejoraImplementada
                  if (row.objetivoLogrado === "SI" || row.mejoraImplementada === "SI" || row.implementacionCumplio === "SI") {
                    completed = "SI";
                  }

                  if (action && dueDate) {
                    const badgeInfo = getBadgeInfo("foda", fodaType);
                    // Generate ID based on content (action + dueDate + element) to ensure deduplication
                    const contentHash = `${action}-${dueDate.toISOString()}-${row.elemento || row.name || ""}`;
                    const contentId = crypto.createHash('sha256').update(contentHash).digest('hex').substring(0, 12);
                    activities.push({
                      id: `foda-${contentId}`,
                      type: "foda",
                      element: `${row.elemento || row.name || ""}`,
                      action: action,
                      dueDate: dueDate,
                      completed: completed as "SI" | "NO",
                      completionField: "Implementación",
                      badge: badgeInfo.badge,
                      badgeColor: badgeInfo.color,
                      daysRemaining: calculateDaysRemaining(dueDate),
                    });
                  }
                });
              }
            }
          } catch (error) {
            console.error("[Consolidated Schedule] Error parsing FODA data:", error);
          }
        }
        // End of latestFoda check

        // 3. Objetivos Tácticos - Parse planningData JSON
        const objectives = await db
          .select()
          .from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, input.processId));

        objectives.forEach((o: any) => {
          try {
            if (o.planningData) {
              const planningData = typeof o.planningData === 'string' 
                ? JSON.parse(o.planningData) 
                : o.planningData;

              // planningData is an object with resultKeys array
              if (planningData && planningData.resultKeys && Array.isArray(planningData.resultKeys)) {
                planningData.resultKeys.forEach((resultKey: any, rkIndex: number) => {
                  const hasTasks = resultKey.tasks && Array.isArray(resultKey.tasks) && resultKey.tasks.length > 0;

                  if (hasTasks) {
                    // OO tiene tareas: agregar cada tarea al cronograma
                    resultKey.tasks.forEach((task: any, taskIndex: number) => {
                      if (task.description && task.date) {
                        const dueDate = new Date(task.date);
                        const badgeInfo = getBadgeInfo("objective");
                        const completionPercentage = task.percentageCompleted || 0;

                        activities.push({
                          id: `objective-task-${o.id}-${rkIndex}-${taskIndex}`,
                          type: "objective",
                          element: "OTE",
                          action: task.description,
                          dueDate: dueDate,
                          completed: completionPercentage === 100 ? "SI" : "NO",
                          completionField: `${completionPercentage}%`,
                          badge: badgeInfo.badge,
                          badgeColor: badgeInfo.color,
                          daysRemaining: calculateDaysRemaining(dueDate),
                          completionPercentage: completionPercentage,
                        });
                      }
                    });
                  } else {
                    // OO sin tareas: el propio OO actúa como tarea en el cronograma
                    // Usar endDate o implementationDate como fecha de vencimiento
                    const dateStr = resultKey.endDate || resultKey.implementationDate || resultKey.startDate;
                    if (resultKey.description && dateStr) {
                      const dueDate = new Date(dateStr);
                      const badgeInfo = getBadgeInfo("objective");
                      const completionPercentage = resultKey.porcentajeAlcanzado || 0;

                      activities.push({
                        id: `objective-oo-${o.id}-${rkIndex}`,
                        type: "objective",
                        element: "OTE",
                        action: resultKey.description,
                        dueDate: dueDate,
                        completed: completionPercentage === 100 ? "SI" : "NO",
                        completionField: `${completionPercentage}%`,
                        badge: badgeInfo.badge,
                        badgeColor: badgeInfo.color,
                        daysRemaining: calculateDaysRemaining(dueDate),
                        completionPercentage: completionPercentage,
                      });
                    }
                  }
                });
              }
            }
          } catch (error) {
            console.error("[Consolidated Schedule] Error parsing objectives data:", error);
          }
        });

        // 4. Cumplimientos
        const compliances = await db
          .select()
          .from(processCompliances)
          .where(eq(processCompliances.processId, input.processId));

        compliances.forEach((c: any) => {
          if (c.requirement && c.dueDate) {
            const dueDate = new Date(c.dueDate);
            const badgeInfo = getBadgeInfo("compliance");
            activities.push({
              id: `compliance-${c.id}`,
              type: "compliance",
              element: "Cumplimiento",
              action: c.requirement,
              dueDate: dueDate,
              completed: c.completed === "SI" ? "SI" : "NO",
              completionField: "Estado",
              badge: badgeInfo.badge,
              badgeColor: badgeInfo.color,
              daysRemaining: calculateDaysRemaining(dueDate),
              completionPercentage: c.completionPercentage || 0,
            });
          }
        });

                // Deduplicate activities by ID (content-based hashing ensures same elements get same ID)
        const uniqueActivities = new Map<string, ScheduleActivity>();
        activities.forEach(activity => {
          // Keep the first occurrence of each unique activity
          if (!uniqueActivities.has(activity.id)) {
            uniqueActivities.set(activity.id, activity);
          }
        });
        
        const deduplicatedActivities = Array.from(uniqueActivities.values());
        
        // Sort by dueDate
        deduplicatedActivities.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

        return deduplicatedActivities;
      } catch (error) {
        console.error("[Consolidated Schedule] Error fetching activities:", error);
        return [];
      }
    }),
});
