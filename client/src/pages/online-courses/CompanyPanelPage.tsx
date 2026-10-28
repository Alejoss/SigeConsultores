import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ChevronLeft, ChevronRight, Download, GraduationCap, Layers3, Plus, UserRound } from "lucide-react";
import { courseDateTimeLocalValue, courseProgressPercent, formatCourseScore } from "@shared/onlineCourses";
import { trpc } from "@/lib/trpc";
import { LoginForm, Shell } from "./PortalPage";
import { CourseContentRemovalButton } from "./CourseContentRemovalButton";

type ContentView =
  | { kind: "fields" }
  | { kind: "modules"; fieldId: number }
  | { kind: "lessons"; fieldId: number; moduleId: number };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción.";
}

function toLocal(iso: string | null): string {
  return courseDateTimeLocalValue(iso);
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? "—" : value.toLocaleDateString("es-EC");
}

function percentageLabel(value: number | null | undefined): string {
  return value == null ? "No aplica" : `${value}%`;
}

function statusLabel(status: string | undefined): string {
  return ({ aprobado: "Aprobada", reprobado: "Reprobada", en_curso: "En curso", sin_iniciar: "Sin iniciar" }[status || ""] || "Sin iniciar");
}

function statusClass(status: string | undefined): string {
  return ({ aprobado: "bg-emerald-100 text-emerald-800", reprobado: "bg-rose-100 text-rose-800", en_curso: "bg-amber-100 text-amber-800" }[status || ""] || "bg-slate-100 text-slate-700");
}

/** Company picked by the general admin; `?empresa=<id>` comes from the catalog's company list. */
function initialCompanyId(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const id = Number(new URLSearchParams(window.location.search).get("empresa"));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export default function CompanyPanelPage() {
  const whoami = trpc.onlineCourses.whoami.useQuery(undefined, { retry: false });
  const isAdmin = whoami.data?.role === "platform_admin";
  const [selectedId, setSelectedId] = useState<number | undefined>(initialCompanyId);
  const catalog = trpc.onlineCourses.catalogOverview.useQuery(undefined, { enabled: isAdmin });
  const companyId = isAdmin ? selectedId : undefined;
  const overview = trpc.onlineCourses.companyOverview.useQuery(
    companyId ? { companyId } : undefined,
    { enabled: whoami.data?.role === "company_admin" || (isAdmin && Boolean(companyId)) }
  );
  const setAccess = trpc.onlineCourses.setModuleAccess.useMutation();
  const setOverride = trpc.onlineCourses.setOverride.useMutation();
  const setCode = trpc.onlineCourses.setRegCode.useMutation();
  const resetPassword = trpc.onlineCourses.resetWorkerPassword.useMutation();
  const createField = trpc.onlineCourses.createField.useMutation();
  const createModule = trpc.onlineCourses.createModule.useMutation();
  const createLesson = trpc.onlineCourses.createLesson.useMutation();
  const [code, setCodeValue] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [fieldId, setFieldId] = useState<number | null>(null);
  const [moduleName, setModuleName] = useState("");
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [view, setView] = useState<ContentView>({ kind: "fields" });

  const data = overview.data;
  const fields = data?.fields || [];
  const modules = useMemo(() => fields.flatMap(field => field.modules.map(moduleRow => ({ ...moduleRow, field: field.name, fieldId: field.id, own: field.own }))), [fields]);
  const workers = (data?.workers || []).filter(worker => {
    const haystack = `${worker.name} ${worker.cedula} ${worker.jobTitle} ${worker.workCenter}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const selectedField = view.kind === "fields" ? null : fields.find(field => field.id === view.fieldId) || null;
  const selectedModule = view.kind === "lessons" ? selectedField?.modules.find(moduleRow => moduleRow.id === view.moduleId) || null : null;

  async function reload(text: string) {
    setMessage(text);
    await overview.refetch();
  }

  if (whoami.isLoading) return <Shell><p>Cargando…</p></Shell>;
  if (!whoami.data) return <LoginForm onDone={() => whoami.refetch()} />;
  if (whoami.data.role === "worker") {
    return <Shell><p className="text-slate-600">Este panel es para el administrador de la empresa. Usa el menú de arriba para volver a tus capacitaciones.</p></Shell>;
  }

  const companyPicker = isAdmin && (
    <label className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Empresa</span>
      <select
        className="rounded-md border px-3 py-2"
        value={selectedId ?? ""}
        onChange={event => {
          const id = Number(event.target.value) || undefined;
          setSelectedId(id);
          setMessage("");
          setView({ kind: "fields" });
          window.history.replaceState(null, "", id ? `?empresa=${id}` : window.location.pathname);
        }}
      >
        <option value="">Elige una empresa…</option>
        {(catalog.data?.companies || []).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
    </label>
  );

  if (isAdmin && !companyId) {
    return (
      <Shell>
        <h1 className="mb-4 text-3xl font-semibold">Panel de empresa</h1>
        {companyPicker}
        <p className="text-slate-500">Elige la empresa que quieres administrar.</p>
      </Shell>
    );
  }

  const fieldHeading = view.kind === "fields"
    ? "Campos de capacitación"
    : view.kind === "modules"
      ? `Módulos · ${selectedField?.name || "Campo"}`
      : `Capacitaciones · ${selectedModule?.name || "Módulo"}`;

  return (
    <Shell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{data?.companyName || "Administración"}</p>
        <h1 className="text-3xl font-semibold">{isAdmin ? "Panel de empresa" : "Capacitaciones de mi empresa"}</h1>
      </div>
      {companyPicker}
      {message && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border bg-white p-4"><b className="block text-2xl">{data?.workerCount || 0}</b><span className="text-sm text-slate-500">Trabajadores</span></article>
        <article className="rounded-xl border bg-white p-4"><b className="block text-2xl">{modules.length}</b><span className="text-sm text-slate-500">Módulos visibles</span></article>
        <article className="rounded-xl border bg-white p-4"><b className="block text-2xl">{data?.regCode || "—"}</b><span className="text-sm text-slate-500">Código de inscripción</span></article>
      </div>

      <section className="mb-8 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Código de inscripción</h2>
        <p className="mb-2 text-sm text-slate-500">Compártelo con tu personal para que cree su cuenta.</p>
        <div className="flex flex-wrap gap-2">
          <code className="rounded bg-slate-100 px-2 py-1">{data?.regCode || "—"}</code>
          <input className="rounded-md border px-2 py-1" value={code} onChange={event => setCodeValue(event.target.value)} placeholder="nuevo código" />
          <button className="rounded-md bg-emerald-700 px-3 py-1 text-sm text-white" onClick={async () => {
            try { await setCode.mutateAsync({ companyId, codigo: code }); setCodeValue(""); await reload("Código actualizado"); }
            catch (error) { setMessage(errorText(error)); }
          }}>Cambiar código</button>
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            {view.kind !== "fields" && <button className="mb-2 inline-flex items-center gap-1 text-sm text-emerald-800 underline" onClick={() => setView(view.kind === "lessons" ? { kind: "modules", fieldId: view.fieldId } : { kind: "fields" })}><ChevronLeft size={16} /> Volver</button>}
            <h2 className="text-xl font-semibold">{fieldHeading}</h2>
            {view.kind === "fields" && <p className="text-sm text-slate-500">Organice el contenido en campos, módulos y capacitaciones. Cada nivel abre únicamente el detalle que necesita.</p>}
          </div>
          {view.kind === "fields" && <button className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white" onClick={() => setFieldId(-1)}><Plus size={16} /> Añadir nuevo campo</button>}
          {view.kind === "modules" && selectedField?.own && <button className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white" onClick={() => setFieldId(selectedField.id)}><Plus size={16} /> Añadir nuevo módulo</button>}
          {view.kind === "lessons" && selectedField?.own && selectedModule && <button className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white" onClick={() => setModuleId(selectedModule.id)}><Plus size={16} /> Cargar capacitación</button>}
        </div>

        {view.kind === "fields" && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fields.map(field => (
              <article key={field.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-700">{field.own ? "Contenido propio" : "Catálogo ISGE 360"}</p>
                    <h3 className="mt-1 text-lg font-semibold">{field.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{field.modules.length} {field.modules.length === 1 ? "módulo" : "módulos"} · {field.modules.reduce((sum, moduleRow) => sum + moduleRow.lessonCount, 0)} capacitaciones</p>
                  </div>
                  {field.own && <CourseContentRemovalButton kind="campo" id={field.id} name={field.name} companyId={companyId} onRemoved={outcome => reload(outcome === "archived" ? "Campo archivado; se conservó el historial" : "Campo eliminado")} />}
                </div>
                <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50" onClick={() => setView({ kind: "modules", fieldId: field.id })}><Layers3 size={16} /> Ver módulos <ChevronRight size={16} /></button>
              </article>
            ))}
            {!fields.length && <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">Aún no hay campos. Cree el primero con “Añadir nuevo campo”.</p>}
          </div>
        )}

        {view.kind === "modules" && selectedField && (
          <div className="grid gap-3 md:grid-cols-2">
            {selectedField.modules.map(moduleRow => (
              <article key={`${moduleRow.id}-${moduleRow.opensAt ?? ""}-${moduleRow.closesAt ?? ""}`} className="rounded-xl border bg-white p-4 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-emerald-700">{selectedField.name}</p>
                    <h3 className="mt-1 font-semibold">{moduleRow.name}</h3>
                    <p className="text-slate-500">{moduleRow.lessonCount} capacitaciones</p>
                  </div>
                  {selectedField.own && <CourseContentRemovalButton kind="modulo" id={moduleRow.id} name={moduleRow.name} companyId={companyId} onRemoved={outcome => reload(outcome === "archived" ? "Módulo archivado; se conservó el historial" : "Módulo eliminado")} />}
                </div>
                <label className="mt-3 flex items-center gap-2">
                  <input type="checkbox" checked={moduleRow.open} onChange={async event => {
                    try { await setAccess.mutateAsync({ companyId, moduleId: moduleRow.id, open: event.target.checked, opensAt: moduleRow.opensAt, closesAt: moduleRow.closesAt }); await overview.refetch(); }
                    catch (error) { setMessage(errorText(error)); }
                  }} />
                  {moduleRow.open ? "Abierto" : "Cerrado"}
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-500">Disponible desde<input type="datetime-local" className="mt-1 w-full rounded border px-1 py-1 text-sm text-slate-700" defaultValue={toLocal(moduleRow.opensAt)} onBlur={async event => {
                    try { await setAccess.mutateAsync({ companyId, moduleId: moduleRow.id, open: moduleRow.open, opensAt: event.target.value || null, closesAt: moduleRow.closesAt }); await overview.refetch(); }
                    catch (error) { setMessage(errorText(error)); }
                  }} /></label>
                  <label className="text-xs text-slate-500">Disponible hasta<input type="datetime-local" className="mt-1 w-full rounded border px-1 py-1 text-sm text-slate-700" defaultValue={toLocal(moduleRow.closesAt)} onBlur={async event => {
                    try { await setAccess.mutateAsync({ companyId, moduleId: moduleRow.id, open: moduleRow.open, opensAt: moduleRow.opensAt, closesAt: event.target.value || null }); await overview.refetch(); }
                    catch (error) { setMessage(errorText(error)); }
                  }} /></label>
                </div>
                <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50" onClick={() => setView({ kind: "lessons", fieldId: selectedField.id, moduleId: moduleRow.id })}><GraduationCap size={16} /> Ver capacitaciones <ChevronRight size={16} /></button>
              </article>
            ))}
            {!selectedField.modules.length && <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">Este campo todavía no tiene módulos.</p>}
          </div>
        )}

        {view.kind === "lessons" && selectedField && selectedModule && (
          <article className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div>
                <p className="text-xs font-medium text-emerald-700">{selectedField.name}</p>
                <h3 className="text-lg font-semibold">{selectedModule.name}</h3>
              </div>
              {selectedField.own && <CourseContentRemovalButton kind="modulo" id={selectedModule.id} name={selectedModule.name} companyId={companyId} onRemoved={outcome => reload(outcome === "archived" ? "Módulo archivado; se conservó el historial" : "Módulo eliminado")} />}
            </div>
            <div className="space-y-2">
              {selectedModule.lessons.map(lesson => (
                <div key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span><span className="font-medium">Capacitación {lesson.number}:</span> {lesson.title}</span>
                  {selectedField.own && <CourseContentRemovalButton kind="capacitacion" id={lesson.id} name={lesson.title} companyId={companyId} onRemoved={outcome => reload(outcome === "archived" ? "Capacitación archivada; se conservó el historial" : "Capacitación eliminada")} />}
                </div>
              ))}
              {!selectedModule.lessons.length && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Todavía no hay capacitaciones cargadas en este módulo.</p>}
            </div>
          </article>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Seguimiento del personal</h2>
            <p className="text-sm text-slate-500">Abra una persona, después un campo y un módulo, para revisar las capacitaciones sin desplazarse horizontalmente.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="rounded-md border px-3 py-2" placeholder="Buscar por nombre, cédula, cargo o centro" value={query} onChange={event => setQuery(event.target.value)} />
            <ExcelButton companyId={companyId} />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border bg-white">
          {!workers.length && <p className="p-5 text-sm text-slate-500">No se encontraron trabajadores.</p>}
          {workers.map(worker => <PersonnelRow key={worker.id} worker={worker} fields={fields} companyId={companyId} setOverride={setOverride} reload={overview.refetch} setMessage={setMessage} resetPassword={resetPassword} />)}
        </div>
      </section>

      {fieldId !== null && (
        <dialog open className="fixed inset-0 z-20 m-auto max-w-md rounded-xl border bg-white p-5 shadow-xl">
          {fieldId === -1 ? <>
            <h3 className="mb-3 font-semibold">Añadir nuevo campo</h3>
            <input className="mb-3 w-full rounded border px-3 py-2" placeholder="Nombre del campo" value={fieldName} onChange={event => setFieldName(event.target.value)} autoFocus />
            <button className="mr-2 rounded bg-emerald-700 px-3 py-2 text-sm text-white" onClick={async () => {
              try { await createField.mutateAsync({ companyId, name: fieldName }); setFieldName(""); setFieldId(null); await reload("Campo creado"); }
              catch (error) { setMessage(errorText(error)); }
            }}>Crear campo</button>
            <button className="rounded border px-3 py-2 text-sm" onClick={() => setFieldId(null)}>Cancelar</button>
          </> : <>
            <h3 className="mb-3 font-semibold">Añadir nuevo módulo</h3>
            <input className="mb-3 w-full rounded border px-3 py-2" placeholder="Nombre del módulo" value={moduleName} onChange={event => setModuleName(event.target.value)} autoFocus />
            <button className="mr-2 rounded bg-emerald-700 px-3 py-2 text-sm text-white" onClick={async () => {
              try { await createModule.mutateAsync({ companyId, fieldId, name: moduleName }); setModuleName(""); setFieldId(null); await reload("Módulo creado"); }
              catch (error) { setMessage(errorText(error)); }
            }}>Crear módulo</button>
            <button className="rounded border px-3 py-2 text-sm" onClick={() => setFieldId(null)}>Cancelar</button>
          </>}
        </dialog>
      )}
      {moduleId !== null && (
        <dialog open className="fixed inset-0 z-20 m-auto max-w-md rounded-xl border bg-white p-5 shadow-xl">
          <h3 className="mb-2 font-semibold">Cargar capacitación</h3>
          <input type="file" accept=".json,application/json" onChange={async event => {
            const file = event.target.files?.[0];
            if (!file || moduleId === null) return;
            try {
              await createLesson.mutateAsync({ companyId, moduleId, file: JSON.parse(await file.text()) });
              setModuleId(null);
              await reload("Capacitación cargada");
            } catch (error) { setMessage(errorText(error)); }
          }} />
          <button className="mt-3 rounded border px-3 py-2 text-sm" onClick={() => setModuleId(null)}>Cerrar</button>
        </dialog>
      )}
    </Shell>
  );
}

type LessonRow = { id: number; title: string; number: number };
type ModuleRow = {
  id: number;
  name: string;
  lessonCount: number;
  lessons: LessonRow[];
  open: boolean;
  opensAt: string | null;
  closesAt: string | null;
};
type FieldRow = { id: number; name: string; own: boolean; modules: ModuleRow[] };
type LessonProgress = LessonRow & {
  status: string;
  scoreTenths: number | null;
  completedAt: string | null;
};
type ModuleProgress = {
  done: number;
  total: number;
  scoreTenths: number | null;
  status: string;
  override: string;
  progressPercent: number | null;
  availableNow: boolean;
  lessons: LessonProgress[];
};
type WorkerRow = {
  id: number;
  name: string;
  cedula: string;
  jobTitle: string;
  workCenter: string;
  modules: Record<number, ModuleProgress>;
};

type PersonnelRowProps = {
  worker: WorkerRow;
  fields: FieldRow[];
  companyId?: number;
  setOverride: ReturnType<typeof trpc.onlineCourses.setOverride.useMutation>;
  reload: () => Promise<unknown>;
  setMessage: (message: string) => void;
  resetPassword: ReturnType<typeof trpc.onlineCourses.resetWorkerPassword.useMutation>;
};

function PersonnelRow({ worker, fields, companyId, setOverride, reload, setMessage, resetPassword }: PersonnelRowProps) {
  const applicableFields = fields.map(field => {
    const modules = field.modules.filter(moduleRow => {
      const progress = worker.modules[moduleRow.id];
      return progress?.availableNow && progress.total > 0;
    });
    const total = modules.reduce((sum, moduleRow) => sum + (worker.modules[moduleRow.id]?.total || 0), 0);
    const done = modules.reduce((sum, moduleRow) => sum + (worker.modules[moduleRow.id]?.done || 0), 0);
    return { field, modules, done, total, progressPercent: courseProgressPercent(done, total) };
  }).filter(item => item.total > 0);
  const personDone = applicableFields.reduce((sum, field) => sum + field.done, 0);
  const personTotal = applicableFields.reduce((sum, field) => sum + field.total, 0);

  return (
    <details className="border-b last:border-b-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-slate-50">
        <span className="flex min-w-0 items-center gap-3"><UserRound className="h-5 w-5 shrink-0 text-emerald-700" /><span><b className="block text-slate-900">{worker.name}</b><span className="text-xs text-slate-500">{worker.cedula} · {worker.jobTitle} · {worker.workCenter}</span></span></span>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">Avance: {percentageLabel(courseProgressPercent(personDone, personTotal))}</span>
      </summary>
      <div className="border-t bg-slate-50 px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <button className="text-xs underline" onClick={async () => {
            const password = window.prompt("Nueva clave (mínimo 6 caracteres)");
            if (!password) return;
            try { await resetPassword.mutateAsync({ companyId, workerId: worker.id, password }); setMessage("Clave actualizada"); }
            catch (error) { setMessage(errorText(error)); }
          }}>Restablecer clave</button>
        </div>
        {!applicableFields.length && <p className="text-sm text-slate-500">Esta persona no tiene capacitaciones disponibles en este momento.</p>}
        <div className="space-y-2">
          {applicableFields.map(({ field, modules, progressPercent }) => (
            <details key={field.id} className="rounded-lg border bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 hover:bg-emerald-50"><span className="font-medium">Campo: {field.name}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{percentageLabel(progressPercent)}</span></summary>
              <div className="space-y-2 border-t p-3">
                {modules.map(moduleRow => {
                  const progress = worker.modules[moduleRow.id];
                  return <details key={moduleRow.id} className="rounded-md border bg-slate-50">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-white"><span className="font-medium">Módulo: {moduleRow.name}</span><span className="flex items-center gap-2"><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700">{percentageLabel(progress.progressPercent)}</span><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(progress.status)}`}>{statusLabel(progress.status)}</span></span></summary>
                    <div className="border-t bg-white p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs text-slate-600">Acceso individual<select className="ml-2 rounded border px-2 py-1 text-xs" value={progress.override || "auto"} onChange={async event => {
                          try {
                            await setOverride.mutateAsync({ companyId, workerId: worker.id, moduleId: moduleRow.id, value: event.target.value as "abrir" | "cerrar" | "auto" });
                            await reload();
                          } catch (error) { setMessage(errorText(error)); }
                        }}><option value="auto">Según la empresa</option><option value="abrir">Abrir solo a esta persona</option><option value="cerrar">Cerrar solo a esta persona</option></select></label>
                      </div>
                      <div className="space-y-1">
                        {progress.lessons.map(lesson => <div key={lesson.id} className="grid gap-2 rounded border px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center"><span>Capacitación {lesson.number}: {lesson.title}</span><span className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${statusClass(lesson.status)}`}>{statusLabel(lesson.status)}</span><span className="text-xs text-slate-600">{lesson.scoreTenths == null ? "Sin calificación" : formatCourseScore(lesson.scoreTenths)} · {dateLabel(lesson.completedAt)}</span></div>)}
                      </div>
                    </div>
                  </details>;
                })}
              </div>
            </details>
          ))}
        </div>
      </div>
    </details>
  );
}

function ExcelButton({ companyId }: { companyId?: number }) {
  const utils = trpc.useUtils();
  return (
    <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" onClick={async () => {
      const file = await utils.onlineCourses.exportCsv.fetch(companyId ? { companyId } : undefined);
      const worksheet = XLSX.utils.aoa_to_sheet([file.headers, ...file.rows]);
      worksheet["!cols"] = [{ wch: 26 }, { wch: 18 }, { wch: 28 }, { wch: 32 }, { wch: 46 }, { wch: 16 }, { wch: 16 }, { wch: 22 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Seguimiento detallado");
      XLSX.writeFile(workbook, file.filename);
    }}><Download size={16} /> Exportar a Excel</button>
  );
}
