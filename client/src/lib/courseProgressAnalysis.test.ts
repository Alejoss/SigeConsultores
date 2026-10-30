import { describe, expect, it } from "vitest";
import {
  buildCourseProgressAnalysis,
  courseAnalysisActiveModuleIds,
  courseAnalysisWorkCenters,
  type CourseAnalysisField,
  type CourseAnalysisWorker,
} from "./courseProgressAnalysis";

const fields: CourseAnalysisField[] = [
  {
    id: 1,
    name: "Igualdad salarial",
    own: false,
    modules: [
      {
        id: 11,
        name: "Conceptos",
        lessonCount: 2,
        lessons: [
          { id: 111, number: 1, title: "Concepto uno" },
          { id: 112, number: 2, title: "Concepto dos" },
        ],
        open: true,
        opensAt: null,
        closesAt: null,
      },
      {
        id: 12,
        name: "No disponible",
        lessonCount: 1,
        lessons: [{ id: 121, number: 1, title: "Contenido cerrado" }],
        open: false,
        opensAt: null,
        closesAt: null,
      },
    ],
  },
  {
    id: 2,
    name: "Seguridad",
    own: false,
    modules: [
      {
        id: 21,
        name: "Inducción",
        lessonCount: 1,
        lessons: [{ id: 211, number: 1, title: "Inducción" }],
        open: true,
        opensAt: null,
        closesAt: null,
      },
    ],
  },
];

function moduleProgress(
  availableNow: boolean,
  lessons: Array<{
    id: number;
    title: string;
    number: number;
    status: string;
    scoreTenths: number | null;
    completedAt?: string | null;
  }>
) {
  const done = lessons.filter(lesson => lesson.status === "aprobado").length;
  return {
    done,
    total: lessons.length,
    scoreTenths: null,
    status: done === lessons.length ? "aprobado" : "en_curso",
    override: "auto",
    progressPercent: lessons.length ? Math.round((done / lessons.length) * 100) : null,
    availableNow,
    lessons: lessons.map(lesson => ({ ...lesson, completedAt: lesson.completedAt || null })),
  };
}

const workers: CourseAnalysisWorker[] = [
  {
    id: 1,
    name: "Ana Patoa",
    cedula: "0101",
    jobTitle: "Analista",
    workCenter: "Patoa",
    modules: {
      11: moduleProgress(true, [
        { id: 111, number: 1, title: "Concepto uno", status: "aprobado", scoreTenths: 100, completedAt: "2026-10-01T12:00:00.000Z" },
        { id: 112, number: 2, title: "Concepto dos", status: "reprobado", scoreTenths: 60 },
      ]),
      12: moduleProgress(false, [
        { id: 121, number: 1, title: "Contenido cerrado", status: "aprobado", scoreTenths: 100 },
      ]),
      21: moduleProgress(true, [
        { id: 211, number: 1, title: "Inducción", status: "sin_iniciar", scoreTenths: null },
      ]),
    },
  },
  {
    id: 2,
    name: "Bruno Patoa",
    cedula: "0202",
    jobTitle: "Supervisor",
    workCenter: "Patoa",
    modules: {
      11: moduleProgress(true, [
        { id: 111, number: 1, title: "Concepto uno", status: "aprobado", scoreTenths: 80 },
        { id: 112, number: 2, title: "Concepto dos", status: "aprobado", scoreTenths: 90 },
      ]),
      12: moduleProgress(false, [
        { id: 121, number: 1, title: "Contenido cerrado", status: "sin_iniciar", scoreTenths: null },
      ]),
      21: moduleProgress(false, [
        { id: 211, number: 1, title: "Inducción", status: "sin_iniciar", scoreTenths: null },
      ]),
    },
  },
  {
    id: 3,
    name: "Carla Quito",
    cedula: "0303",
    jobTitle: "Asistente",
    workCenter: "Quito",
    modules: {
      11: moduleProgress(false, [
        { id: 111, number: 1, title: "Concepto uno", status: "sin_iniciar", scoreTenths: null },
        { id: 112, number: 2, title: "Concepto dos", status: "sin_iniciar", scoreTenths: null },
      ]),
      12: moduleProgress(false, [
        { id: 121, number: 1, title: "Contenido cerrado", status: "sin_iniciar", scoreTenths: null },
      ]),
      21: moduleProgress(false, [
        { id: 211, number: 1, title: "Inducción", status: "sin_iniciar", scoreTenths: null },
      ]),
    },
  },
];

describe("Análisis de avance de capacitaciones", () => {
  it("filtra por centro y calcula avance ponderado solo con módulos disponibles", () => {
    const analysis = buildCourseProgressAnalysis(fields, workers, {
      workCenter: "Patoa",
      fieldId: 1,
    });

    expect(analysis.level).toBe("field");
    expect(analysis.rows).toHaveLength(2);
    expect(analysis.rows.map(row => [row.name, row.progressPercent])).toEqual([
      ["Ana Patoa", 50],
      ["Bruno Patoa", 100],
    ]);
    expect(analysis.summary).toMatchObject({
      workerCount: 2,
      applicableWorkerCount: 2,
      passedLessons: 3,
      applicableLessons: 4,
      progressPercent: 75,
    });
  });

  it("muestra la calificación promedio de evaluaciones al seleccionar un módulo", () => {
    const analysis = buildCourseProgressAnalysis(fields, workers, {
      workCenter: "Patoa",
      fieldId: 1,
      moduleId: 11,
    });

    expect(analysis.level).toBe("module");
    expect(analysis.rows[0]).toMatchObject({
      name: "Ana Patoa",
      progressPercent: 50,
      scoreTenths: 80,
      status: "en_curso",
    });
    expect(analysis.rows[1]).toMatchObject({
      name: "Bruno Patoa",
      progressPercent: 100,
      scoreTenths: 85,
      status: "aprobado",
    });
  });

  it("muestra una capacitación con estado, nota y fecha sin convertir ausencia en cero", () => {
    const analysis = buildCourseProgressAnalysis(fields, workers, {
      fieldId: 1,
      moduleId: 11,
      lessonId: 112,
    });

    expect(analysis.level).toBe("lesson");
    expect(analysis.rows.find(row => row.name === "Ana Patoa")).toMatchObject({
      progressPercent: 0,
      scoreTenths: 60,
      status: "reprobado",
    });
    expect(analysis.rows.find(row => row.name === "Carla Quito")).toMatchObject({
      progressPercent: null,
      scoreTenths: null,
      status: "no_aplica",
    });
  });

  it("distingue centros y módulos activos disponibles para los filtros", () => {
    expect(courseAnalysisWorkCenters(workers)).toEqual(["Patoa", "Quito"]);
    expect(Array.from(courseAnalysisActiveModuleIds(workers)).sort()).toEqual([11, 21]);
  });
});
