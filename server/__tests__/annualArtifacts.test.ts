import { describe, expect, it } from "vitest";
import { annualUploadKey } from "../annual/fileScope";
import { annualActivityIdentity, mergeAnnualAlertActivities } from "../annual/alertIdentity";
import type { ConsolidatedScheduleActivity } from "../lib/consolidatedScheduleActivities";

const workspace = { id: 42, companyId: 999701, year: 2027, status: "open" as const };
const activity = (overrides: Partial<ConsolidatedScheduleActivity> = {}): ConsolidatedScheduleActivity => ({
  id: "linked-commitment-99", type: "linked_commitment", element: "Auditoría",
  action: "Cerrar hallazgo", dueDate: new Date("2027-01-15T12:00:00Z"),
  completed: "NO", completionField: "Estado", badge: "Compromiso", badgeColor: "bg-teal-100",
  daysRemaining: 0, completionPercentage: 0,
  navigation: { destination: "linked_commitment", commitmentId: 99 }, ...overrides,
});

describe("archivos anuales inmutables", () => {
  it("preserva la normalización heredada fuera de un contexto anual", () => {
    expect(annualUploadKey("/documents/1/mapa.png", undefined, "nonce")).toBe("uploads/documents/1/mapa.png");
    expect(annualUploadKey("uploads/documents/1/mapa.png", undefined, "nonce")).toBe("uploads/documents/1/mapa.png");
  });
  it("incluye empresa, año y workspace solamente en una nueva carga", () => {
    expect(annualUploadKey("documents/1/mapa.png", workspace, "nonce")).toBe("uploads/annual/999701/2027/42/nonce/documents/1/mapa.png");
  });
  it("no duplica el prefijo uploads", () => {
    expect(annualUploadKey("uploads/documents/1/mapa.png", workspace, "nonce")).toBe("uploads/annual/999701/2027/42/nonce/documents/1/mapa.png");
  });
  it("no reutiliza una clave aunque nombre y año coincidan", () => {
    expect(annualUploadKey("mapa.png", workspace)).not.toBe(annualUploadKey("mapa.png", workspace));
  });
  it("separa claves de diferentes empresas y años", () => {
    const key = annualUploadKey("mapa.png", workspace, "nonce");
    expect(annualUploadKey("mapa.png", { ...workspace, year: 2028, id: 43 }, "nonce")).not.toBe(key);
    expect(annualUploadKey("mapa.png", { ...workspace, companyId: 999702 }, "nonce")).not.toBe(key);
  });
  it("rechaza cargas al año cerrado antes de escribir un objeto", () => {
    expect(() => annualUploadKey("mapa.png", { ...workspace, status: "closed" }, "nonce")).toThrow("solo lectura");
  });
  it.each([0, -1, 1.5, NaN])("rechaza identificadores de ámbito no válidos: %s", id => {
    expect(() => annualUploadKey("mapa.png", { ...workspace, id }, "nonce")).toThrow("Ámbito anual inválido");
  });
  it("rechaza identificadores de archivo que permitirían introducir rutas", () => {
    expect(() => annualUploadKey("mapa.png", workspace, "../otro")).toThrow("Identificador de archivo inválido");
  });
});

describe("pendientes con procedencia anual", () => {
  it("mantiene una sola obligación lógica y usa su cierre más reciente", () => {
    const old = activity();
    const current = activity({ completed: "SI", completionPercentage: 100 });
    const merged = mergeAnnualAlertActivities([{ year: 2026, activity: old }, { year: 2027, activity: current }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].completed).toBe("SI");
    expect(merged[0].badge).toBe("Compromiso · 2027");
    expect(old.completed).toBe("NO");
    expect(old.badge).toBe("Compromiso");
  });
  it("no hace reaparecer un estado antiguo si las consultas llegan fuera de orden", () => {
    const merged = mergeAnnualAlertActivities([{ year: 2027, activity: activity({ completed: "SI" }) }, { year: 2026, activity: activity() }]);
    expect(merged[0].completed).toBe("SI");
  });
  it("mantiene el pendiente del programa que no se copia al nuevo año", () => {
    const merged = mergeAnnualAlertActivities([{ year: 2026, activity: activity() }]);
    expect(merged[0].completed).toBe("NO");
    expect(merged[0].badge).toContain("2026");
  });
  it("usa la identidad de fila FODA en vez de un hash que cambia con la fecha", () => {
    const old = activity({ id: "foda-old-hash", type: "foda", navigation: { destination: "foda", fodaRecordId: 31, fodaRowId: "uuid-1", fodaRowIndex: 3 } });
    const current = { ...old, id: "foda-new-hash", dueDate: new Date("2027-02-01T12:00:00Z"), completed: "SI" as const };
    expect(mergeAnnualAlertActivities([{ year: 2026, activity: old }, { year: 2027, activity: current }])).toHaveLength(1);
  });
  it("mantiene tareas diferentes aunque compartan objetivo y nombre", () => {
    const first = activity({ type: "objective", navigation: { destination: "objective", objectiveId: 17, resultKeyId: "oo1", resultKeyIndex: 0, taskId: "task1", taskIndex: 0 } });
    const second = activity({ type: "objective", navigation: { destination: "objective", objectiveId: 17, resultKeyId: "oo1", resultKeyIndex: 0, taskId: "task2", taskIndex: 1 } });
    expect(annualActivityIdentity(first)).not.toBe(annualActivityIdentity(second));
    expect(mergeAnnualAlertActivities([{ year: 2027, activity: first }, { year: 2027, activity: second }])).toHaveLength(2);
  });
  it("no fusiona dos ocurrencias de una actividad recurrente", () => {
    const first = activity({ type: "compliance", navigation: { destination: "compliance", activityId: 22, occurrenceDate: "2027-01-15" } });
    const second = activity({ type: "compliance", navigation: { destination: "compliance", activityId: 22, occurrenceDate: "2027-02-15" } });
    expect(annualActivityIdentity(first)).not.toBe(annualActivityIdentity(second));
  });
});
