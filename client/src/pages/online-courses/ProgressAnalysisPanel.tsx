import { useMemo, useState } from "react";
import { ArrowLeft, FilterX } from "lucide-react";
import { formatCourseScore } from "@shared/onlineCourses";
import {
  buildCourseProgressAnalysis,
  courseAnalysisActiveModuleIds,
  courseAnalysisWorkCenters,
  type CourseAnalysisField,
  type CourseAnalysisWorker,
  type CourseProgressStatus,
} from "@/lib/courseProgressAnalysis";

type ProgressAnalysisPanelProps = {
  fields: CourseAnalysisField[];
  workers: CourseAnalysisWorker[];
  onBack: () => void;
};

function percentageLabel(value: number | null) {
  return value == null ? "No aplica" : `${value}%`;
}

function statusLabel(status: CourseProgressStatus) {
  return {
    no_aplica: "No aplica",
    sin_iniciar: "Sin iniciar",
    en_curso: "En curso",
    reprobado: "Reprobada",
    aprobado: "Aprobado",
  }[status];
}

function statusClass(status: CourseProgressStatus) {
  return {
    no_aplica: "bg-slate-100 text-slate-700",
    sin_iniciar: "bg-slate-100 text-slate-700",
    en_curso: "bg-amber-100 text-amber-800",
    reprobado: "bg-rose-100 text-rose-800",
    aprobado: "bg-emerald-100 text-emerald-800",
  }[status];
}

function optionNumber(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function ProgressAnalysisPanel({
  fields,
  workers,
  onBack,
}: ProgressAnalysisPanelProps) {
  const [workCenter, setWorkCenter] = useState("");
  const [fieldId, setFieldId] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [lessonId, setLessonId] = useState<number | null>(null);

  const selectedField = fields.find(field => field.id === fieldId) || null;
  const workersInSelectedCenter = useMemo(
    () =>
      workCenter
        ? workers.filter(worker => worker.workCenter === workCenter)
        : workers,
    [workCenter, workers]
  );
  const activeModuleIds = useMemo(
    () => courseAnalysisActiveModuleIds(workersInSelectedCenter),
    [workersInSelectedCenter]
  );
  const modules = (selectedField?.modules || []).filter(moduleRow =>
    activeModuleIds.has(moduleRow.id)
  );
  const selectedModule = modules.find(moduleRow => moduleRow.id === moduleId) || null;
  const analysis = useMemo(
    () =>
      buildCourseProgressAnalysis(fields, workers, {
        workCenter: workCenter || undefined,
        fieldId,
        moduleId,
        lessonId,
      }),
    [fieldId, fields, lessonId, moduleId, workCenter, workers]
  );
  const showDetailColumns = analysis.level === "module" || analysis.level === "lesson";
  const selectedScope =
    analysis.level === "lesson"
      ? selectedModule?.lessons.find(lesson => lesson.id === lessonId)?.title || "Capacitación"
      : analysis.level === "module"
        ? selectedModule?.name || "Módulo"
        : analysis.level === "field"
          ? selectedField?.name || "Campo"
          : "Todos los contenidos activos";

  const clearFilters = () => {
    setWorkCenter("");
    setFieldId(null);
    setModuleId(null);
    setLessonId(null);
  };

  return (
    <section className="space-y-5 rounded-xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            className="mb-2 inline-flex items-center gap-1 text-sm text-emerald-800 underline"
            onClick={onBack}
          >
            <ArrowLeft size={16} /> Volver a Seguimiento del personal
          </button>
          <h2 className="text-xl font-semibold">Análisis de Avance</h2>
          <p className="mt-1 text-sm text-slate-500">
            Filtre por centro de trabajo y contenido. Los porcentajes consideran únicamente las capacitaciones activas y disponibles para cada persona.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
          onClick={clearFilters}
        >
          <FilterX size={16} /> Limpiar filtros
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Centro de trabajo
          <select
            className="mt-1 w-full rounded-md border px-3 py-2 font-normal"
            value={workCenter}
            onChange={event => setWorkCenter(event.target.value)}
          >
            <option value="">Todos los centros</option>
            {courseAnalysisWorkCenters(workers).map(center => (
              <option key={center} value={center}>
                {center}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Campo
          <select
            className="mt-1 w-full rounded-md border px-3 py-2 font-normal"
            value={fieldId || ""}
            onChange={event => {
              setFieldId(optionNumber(event.target.value));
              setModuleId(null);
              setLessonId(null);
            }}
          >
            <option value="">Todos los campos</option>
            {fields.map(field => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Módulo
          <select
            className="mt-1 w-full rounded-md border px-3 py-2 font-normal disabled:bg-slate-100"
            value={moduleId || ""}
            disabled={!selectedField}
            onChange={event => {
              setModuleId(optionNumber(event.target.value));
              setLessonId(null);
            }}
          >
            <option value="">Todos los módulos activos</option>
            {modules.map(moduleRow => (
              <option key={moduleRow.id} value={moduleRow.id}>
                {moduleRow.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Capacitación
          <select
            className="mt-1 w-full rounded-md border px-3 py-2 font-normal disabled:bg-slate-100"
            value={lessonId || ""}
            disabled={!selectedModule}
            onChange={event => setLessonId(optionNumber(event.target.value))}
          >
            <option value="">Todas las capacitaciones</option>
            {(selectedModule?.lessons || []).map(lesson => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.number}. {lesson.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Vista seleccionada: <strong>{selectedScope}</strong>
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Trabajadores mostrados</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{analysis.summary.workerCount}</p>
        </article>
        <article className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Con contenido aplicable</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{analysis.summary.applicableWorkerCount}</p>
        </article>
        <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-800">Avance ponderado</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-800">{percentageLabel(analysis.summary.progressPercent)}</p>
        </article>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Persona</th>
              <th className="px-4 py-3 font-semibold">Cédula</th>
              <th className="px-4 py-3 font-semibold">Centro de trabajo</th>
              <th className="px-4 py-3 font-semibold">Avance</th>
              {showDetailColumns && <th className="px-4 py-3 font-semibold">Estado</th>}
              {showDetailColumns && <th className="px-4 py-3 font-semibold">Calificación</th>}
            </tr>
          </thead>
          <tbody>
            {analysis.rows.map(row => (
              <tr key={row.workerId} className="border-t">
                <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                <td className="px-4 py-3 text-slate-700">{row.cedula}</td>
                <td className="px-4 py-3 text-slate-700">{row.workCenter || "No aplica"}</td>
                <td className="px-4 py-3 font-semibold text-emerald-800">{percentageLabel(row.progressPercent)}</td>
                {showDetailColumns && (
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                )}
                {showDetailColumns && (
                  <td className="px-4 py-3 text-slate-700">
                    {row.scoreTenths == null ? "Sin calificación" : formatCourseScore(row.scoreTenths)}
                  </td>
                )}
              </tr>
            ))}
            {!analysis.rows.length && (
              <tr>
                <td colSpan={showDetailColumns ? 6 : 4} className="px-4 py-8 text-center text-slate-500">
                  No hay trabajadores que coincidan con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        “No aplica” indica que la persona no tiene capacitaciones activas y disponibles para la selección; no equivale a un avance de 0 %.
      </p>
    </section>
  );
}
