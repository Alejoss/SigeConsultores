import { courseProgressPercent } from "@shared/onlineCourses";

export type CourseAnalysisLesson = {
  id: number;
  title: string;
  number: number;
  status: string;
  scoreTenths: number | null;
  completedAt: string | null;
};

export type CourseAnalysisModuleProgress = {
  done: number;
  total: number;
  scoreTenths: number | null;
  status: string;
  override: string;
  progressPercent: number | null;
  availableNow: boolean;
  lessons: CourseAnalysisLesson[];
};

export type CourseAnalysisWorker = {
  id: number;
  name: string;
  cedula: string;
  jobTitle: string;
  workCenter: string;
  modules: Record<number, CourseAnalysisModuleProgress>;
};

export type CourseAnalysisModule = {
  id: number;
  name: string;
  lessonCount: number;
  lessons: Array<{ id: number; title: string; number: number }>;
  open: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export type CourseAnalysisField = {
  id: number;
  name: string;
  own: boolean;
  modules: CourseAnalysisModule[];
};

export type CourseProgressAnalysisFilters = {
  workCenter?: string;
  fieldId?: number | null;
  moduleId?: number | null;
  lessonId?: number | null;
};

export type CourseProgressAnalysisLevel = "all" | "field" | "module" | "lesson";
export type CourseProgressStatus =
  | "no_aplica"
  | "sin_iniciar"
  | "en_curso"
  | "reprobado"
  | "aprobado";

export type CourseProgressMetrics = {
  passedLessons: number;
  applicableLessons: number;
  evaluatedLessons: number;
  progressPercent: number | null;
  scoreTenths: number | null;
  status: CourseProgressStatus;
};

export type CourseProgressAnalysisRow = CourseProgressMetrics & {
  workerId: number;
  name: string;
  cedula: string;
  workCenter: string;
  completedAt: string | null;
};

export type CourseProgressAnalysis = {
  level: CourseProgressAnalysisLevel;
  rows: CourseProgressAnalysisRow[];
  summary: CourseProgressMetrics & {
    workerCount: number;
    applicableWorkerCount: number;
  };
};

type ScopedLesson = Pick<CourseAnalysisLesson, "status" | "scoreTenths" | "completedAt">;

function metricsFromLessons(lessons: ScopedLesson[]): CourseProgressMetrics {
  const applicableLessons = lessons.length;
  const passedLessons = lessons.filter(lesson => lesson.status === "aprobado").length;
  const scores = lessons
    .map(lesson => lesson.scoreTenths)
    .filter((score): score is number => score !== null);
  const evaluatedLessons = scores.length;

  const status: CourseProgressStatus =
    applicableLessons === 0
      ? "no_aplica"
      : passedLessons === applicableLessons
        ? "aprobado"
        : passedLessons > 0 || lessons.some(lesson => lesson.status !== "sin_iniciar")
          ? "en_curso"
          : "sin_iniciar";

  return {
    passedLessons,
    applicableLessons,
    evaluatedLessons,
    progressPercent: courseProgressPercent(passedLessons, applicableLessons),
    scoreTenths: scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null,
    status,
  };
}

function activeLessonsForModules(
  worker: CourseAnalysisWorker,
  modules: CourseAnalysisModule[]
): ScopedLesson[] {
  return modules.flatMap(moduleRow => {
    const progress = worker.modules[moduleRow.id];
    if (!progress?.availableNow || progress.total <= 0) return [];
    return progress.lessons;
  });
}

function levelFrom(filters: CourseProgressAnalysisFilters): CourseProgressAnalysisLevel {
  if (filters.lessonId) return "lesson";
  if (filters.moduleId) return "module";
  if (filters.fieldId) return "field";
  return "all";
}

function scopedModules(
  fields: CourseAnalysisField[],
  filters: CourseProgressAnalysisFilters
): CourseAnalysisModule[] {
  const fieldsInScope = filters.fieldId
    ? fields.filter(field => field.id === filters.fieldId)
    : fields;
  const modules = fieldsInScope.flatMap(field => field.modules);
  return filters.moduleId
    ? modules.filter(moduleRow => moduleRow.id === filters.moduleId)
    : modules;
}

function lessonsForWorker(
  worker: CourseAnalysisWorker,
  modules: CourseAnalysisModule[],
  filters: CourseProgressAnalysisFilters
): ScopedLesson[] {
  if (filters.lessonId) {
    const moduleRow = modules.find(moduleItem =>
      moduleItem.lessons.some(lesson => lesson.id === filters.lessonId)
    );
    const progress = moduleRow ? worker.modules[moduleRow.id] : undefined;
    if (!progress?.availableNow || progress.total <= 0) return [];
    return progress.lessons.filter(lesson => lesson.id === filters.lessonId);
  }
  return activeLessonsForModules(worker, modules);
}

function completionForWorker(
  worker: CourseAnalysisWorker,
  filters: CourseProgressAnalysisFilters,
  level: CourseProgressAnalysisLevel
): string | null {
  if (level !== "lesson" || !filters.moduleId || !filters.lessonId) return null;
  return worker.modules[filters.moduleId]?.lessons.find(
    lesson => lesson.id === filters.lessonId
  )?.completedAt ?? null;
}

/**
 * Creates the manager-facing rows from the same company overview that powers
 * the existing personnel tracking. Progress always excludes closed, expired,
 * or individually disabled modules and preserves null as "No aplica".
 */
export function buildCourseProgressAnalysis(
  fields: CourseAnalysisField[],
  workers: CourseAnalysisWorker[],
  filters: CourseProgressAnalysisFilters = {}
): CourseProgressAnalysis {
  const level = levelFrom(filters);
  const modules = scopedModules(fields, filters);
  const normalizedCenter = filters.workCenter?.trim() || "";
  const workersInScope = normalizedCenter
    ? workers.filter(worker => worker.workCenter === normalizedCenter)
    : workers;

  const rows = workersInScope.map(worker => {
    const lessons = lessonsForWorker(worker, modules, filters);
    const metrics = metricsFromLessons(lessons);
    const lessonStatus =
      level === "lesson" && lessons.length === 1 && lessons[0].status === "reprobado"
        ? "reprobado"
        : metrics.status;
    return {
      workerId: worker.id,
      name: worker.name,
      cedula: worker.cedula,
      workCenter: worker.workCenter,
      completedAt: completionForWorker(worker, filters, level),
      ...metrics,
      status: lessonStatus,
    };
  });

  const summary = metricsFromLessons(
    rows.flatMap(row => {
      const worker = workersInScope.find(item => item.id === row.workerId);
      return worker ? lessonsForWorker(worker, modules, filters) : [];
    })
  );

  return {
    level,
    rows,
    summary: {
      ...summary,
      workerCount: rows.length,
      applicableWorkerCount: rows.filter(
        row => row.applicableLessons > 0
      ).length,
    },
  };
}

export function courseAnalysisWorkCenters(workers: CourseAnalysisWorker[]) {
  return Array.from(
    new Set(workers.map(worker => worker.workCenter.trim()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right, "es"));
}

export function courseAnalysisActiveModuleIds(workers: CourseAnalysisWorker[]) {
  const ids = new Set<number>();
  for (const worker of workers) {
    for (const [moduleId, progress] of Object.entries(worker.modules)) {
      if (progress.availableNow && progress.total > 0) ids.add(Number(moduleId));
    }
  }
  return ids;
}
