import { describe, expect, it } from "vitest";
import {
  deriveMeetingDraftFromAssistantReport,
  deriveTaskDraftsFromActionItems,
} from "./meetingAssistantImport";

describe("deriveMeetingDraftFromAssistantReport", () => {
  it("propone campos y acuerdos desde un acta estructurada", () => {
    const report = [
      "ACTA DE REUNIÓN",
      "Fecha: 2026-09-28",
      "Objetivo: Revisar indicadores por área",
      "Participantes: Jefes de proceso",
      "Lugar o medio: Sala de reuniones",
      "Resumen:",
      "Se revisaron los indicadores del mes.",
      "Acuerdos y pendientes",
      "- Actualizar la matriz de riesgos",
      "2. Entregar el presupuesto de capacitación",
    ].join("\n");

    expect(deriveMeetingDraftFromAssistantReport(report, "2026-09-29")).toEqual({
      title: "Revisar indicadores por área",
      meetingDate: "2026-09-28",
      objective: "Revisar indicadores por área",
      participants: "Jefes de proceso",
      locationOrMedium: "Sala de reuniones",
      notes: "Se revisaron los indicadores del mes.",
      agreements: [
        { description: "Actualizar la matriz de riesgos", responsibleName: "", dueDate: "", notes: "" },
        { description: "Entregar el presupuesto de capacitación", responsibleName: "", dueDate: "", notes: "" },
      ],
    });
  });

  it("usa el nombre de reunión sin truncar objetivos principales", () => {
    const report = [
      "Nombre de la reunión: Revisión semanal de Gestión – Operaciones y Comercial",
      "Fecha: 6 de octubre de 2026",
      "Objetivos principales",
      "Revisar operaciones y resultados comerciales.",
      "Participantes: María López, Carlos Andrade",
    ].join("\n");

    expect(deriveMeetingDraftFromAssistantReport(report, "2026-10-07")).toMatchObject({
      title: "Revisión semanal de Gestión – Operaciones y Comercial",
      meetingDate: "2026-10-06",
      objective: "Revisar operaciones y resultados comerciales.",
      participants: "María López, Carlos Andrade",
    });
  });

  it("conserva la fecha alternativa cuando el reporte no tiene fecha reconocible", () => {
    const result = deriveMeetingDraftFromAssistantReport(
      "Resumen breve\nAcuerdos:\n- Preparar evidencia",
      "2026-09-29"
    );

    expect(result.meetingDate).toBe("2026-09-29");
    expect(result.agreements).toEqual([
      { description: "Preparar evidencia", responsibleName: "", dueDate: "", notes: "" },
    ]);
  });

  it("no convierte el resumen general en compromisos: usa únicamente la sección de tareas", () => {
    const report = [
      "Summary",
      "El equipo comentó que deben mejorar el filtro de flores y el mood board.",
      "Action Items",
      "- Mejorar el diseño visual del mood board.",
      "- Enviar el material visual a los floristas.",
    ].join("\n");

    const result = deriveMeetingDraftFromAssistantReport(report, "2026-10-01");
    expect(result.notes).toBe("El equipo comentó que deben mejorar el filtro de flores y el mood board.");
    expect(result.agreements.map(item => item.description)).toEqual([
      "Mejorar el diseño visual del mood board.",
      "Enviar el material visual a los floristas.",
    ]);
  });
});

describe("deriveTaskDraftsFromActionItems", () => {
  it("lee una lista Action Items copiada por separado y conserva responsable y fecha cuando están explícitos", () => {
    const items = [
      "Mejorar el filtro de flores | Responsable: Sebastián Maldonado | Fecha límite: 10/10/2026",
      "Enviar reporte de publicaciones",
      "Responsable: Equipo comercial",
      "Fecha tope: 2026-10-12",
    ].join("\n");

    expect(deriveTaskDraftsFromActionItems(items)).toEqual([
      {
        description: "Mejorar el filtro de flores",
        responsibleName: "Sebastián Maldonado",
        dueDate: "2026-10-10",
        notes: "",
      },
      {
        description: "Enviar reporte de publicaciones",
        responsibleName: "Equipo comercial",
        dueDate: "2026-10-12",
        notes: "",
      },
    ]);
  });

  it("lee todas las tareas de una tabla pegada desde Word", () => {
    const items = [
      "Tareas y acciones",
      "Revisión semanal de Gestión – Acciones identificadas",
      "Acción\tResponsable\tFecha límite",
      "Implementar un pronóstico de caja a 30 días, actualizado por Finanzas cada lunes.\tPedro José\t15/10/2026",
      "Publicar el reporte semanal de resultados comerciales.\tMaría López\t16/10/2026",
      "Revisar los pedidos pendientes con Operaciones.\tCarlos Andrade\t17/10/2026",
      "Actualizar el catálogo de servicios prioritarios.\tLaura Sánchez\t18/10/2026",
      "Preparar el análisis de desviaciones de la semana.\tPedro José\t19/10/2026",
      "Confirmar la reunión de seguimiento con cada responsable.\tMaría López\t20/10/2026",
      "Consolidar las novedades operativas en un solo reporte.\tCarlos Andrade\t21/10/2026",
      "Enviar el resumen ejecutivo a Gerencia General.\tLaura Sánchez\t22/10/2026",
    ].join("\n");

    expect(deriveTaskDraftsFromActionItems(items)).toEqual([
      { description: "Implementar un pronóstico de caja a 30 días, actualizado por Finanzas cada lunes.", responsibleName: "Pedro José", dueDate: "2026-10-15", notes: "" },
      { description: "Publicar el reporte semanal de resultados comerciales.", responsibleName: "María López", dueDate: "2026-10-16", notes: "" },
      { description: "Revisar los pedidos pendientes con Operaciones.", responsibleName: "Carlos Andrade", dueDate: "2026-10-17", notes: "" },
      { description: "Actualizar el catálogo de servicios prioritarios.", responsibleName: "Laura Sánchez", dueDate: "2026-10-18", notes: "" },
      { description: "Preparar el análisis de desviaciones de la semana.", responsibleName: "Pedro José", dueDate: "2026-10-19", notes: "" },
      { description: "Confirmar la reunión de seguimiento con cada responsable.", responsibleName: "María López", dueDate: "2026-10-20", notes: "" },
      { description: "Consolidar las novedades operativas en un solo reporte.", responsibleName: "Carlos Andrade", dueDate: "2026-10-21", notes: "" },
      { description: "Enviar el resumen ejecutivo a Gerencia General.", responsibleName: "Laura Sánchez", dueDate: "2026-10-22", notes: "" },
    ]);
  });

  it("acepta tareas numeradas y separa sus metadatos en líneas consecutivas", () => {
    const items = [
      "Tarea 1:",
      "Preparar proyección de ventas.",
      "Responsable: Ana",
      "Fecha de cumplimiento: 21/10/2026",
      "Tarea 2: Consolidar gastos de la semana.",
      "Responsable: Luis",
      "Fecha límite: 22/10/2026",
    ].join("\n");

    expect(deriveTaskDraftsFromActionItems(items)).toEqual([
      { description: "Preparar proyección de ventas.", responsibleName: "Ana", dueDate: "2026-10-21", notes: "" },
      { description: "Consolidar gastos de la semana.", responsibleName: "Luis", dueDate: "2026-10-22", notes: "" },
    ]);
  });

  it("descarta encabezados de tablas y no duplica acciones", () => {
    const items = [
      "Action Items",
      "| Action | Owner | Due date |",
      "| --- | --- | --- |",
      "- Actualizar el tracker de conversión",
      "- Actualizar el tracker de conversión",
    ].join("\n");

    expect(deriveTaskDraftsFromActionItems(items)).toEqual([
      { description: "Actualizar el tracker de conversión", responsibleName: "", dueDate: "", notes: "" },
    ]);
  });
});
