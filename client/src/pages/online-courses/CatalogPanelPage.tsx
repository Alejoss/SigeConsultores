import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { coursePath } from "./coursePaths";
import { LoginForm, Shell } from "./PortalPage";
import { CourseContentRemovalButton } from "./CourseContentRemovalButton";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción.";
}

export default function CatalogPanelPage() {
  const whoami = trpc.onlineCourses.whoami.useQuery(undefined, { retry: false });
  const overview = trpc.onlineCourses.catalogOverview.useQuery(undefined, { enabled: whoami.data?.role === "platform_admin" });
  const createModule = trpc.onlineCourses.createModule.useMutation();
  const createLesson = trpc.onlineCourses.createLesson.useMutation();
  const [moduleName, setModuleName] = useState("");
  const [fieldId, setFieldId] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function reload(text: string) {
    setMessage(text);
    await overview.refetch();
  }

  if (whoami.isLoading) return <Shell><p>Cargando…</p></Shell>;
  if (!whoami.data) return <LoginForm onDone={() => whoami.refetch()} />;
  if (whoami.data.role !== "platform_admin") {
    return <Shell><p className="text-slate-600">El catálogo lo administra el administrador general de ISGE 360. Usa el menú de arriba para ir a tus secciones.</p></Shell>;
  }

  return (
    <Shell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Administración general</p>
        <h1 className="text-3xl font-semibold">Catálogo de capacitaciones</h1>
      </div>
      {message && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

      <section className="mb-8 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Empresas</h2>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="py-2">Empresa</th><th>Trabajadores</th></tr></thead>
          <tbody>
            {(overview.data?.companies || []).map(company => (
              <tr key={company.id} className="border-b">
                <td className="py-2"><a className="text-emerald-800 underline" href={coursePath(`/empresa?empresa=${company.id}`)}>{company.name}</a></td>
                <td>{company.workers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Campos, módulos y capacitaciones</h2>
        {(overview.data?.fields || []).map(field => (
          <article key={field.id} className="mb-3 rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{field.name}</h3>
              <CourseContentRemovalButton
                kind="campo"
                id={field.id}
                name={field.name}
                onRemoved={outcome => reload(outcome === "archived" ? "Campo archivado; se conservó el historial" : "Campo eliminado")}
              />
            </div>
            {field.modules.map(moduleRow => (
              <div key={moduleRow.id} className="border-t py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>{moduleRow.name} · {moduleRow.lessonCount} capacitaciones</span>
                  <div className="flex items-center gap-1">
                    <button className="rounded-md border px-2 py-1" onClick={() => setModuleId(moduleRow.id)}>+ Cargar capacitación</button>
                    <CourseContentRemovalButton
                      kind="modulo"
                      id={moduleRow.id}
                      name={moduleRow.name}
                      onRemoved={outcome => reload(outcome === "archived" ? "Módulo archivado; se conservó el historial" : "Módulo eliminado")}
                    />
                  </div>
                </div>
                {moduleRow.lessons.map(lesson => (
                  <div key={lesson.id} className="ml-4 mt-2 flex items-center justify-between gap-3 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    <span>Capacitación {lesson.number}: {lesson.title}</span>
                    <CourseContentRemovalButton
                      kind="capacitacion"
                      id={lesson.id}
                      name={lesson.title}
                      onRemoved={outcome => reload(outcome === "archived" ? "Capacitación archivada; se conservó el historial" : "Capacitación eliminada")}
                    />
                  </div>
                ))}
              </div>
            ))}
            <button className="mt-2 text-sm text-emerald-800 underline" onClick={() => setFieldId(field.id)}>+ Nuevo módulo en este campo</button>
          </article>
        ))}
      </section>

      {fieldId !== null && (
        <dialog open className="fixed inset-0 z-20 m-auto w-full max-w-md rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold">Nuevo módulo</h3>
          <input className="mb-3 w-full rounded-md border px-3 py-2" value={moduleName} onChange={event => setModuleName(event.target.value)} />
          <div className="flex gap-2">
            <button className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white" onClick={async () => {
              try { await createModule.mutateAsync({ fieldId, name: moduleName }); setModuleName(""); setFieldId(null); await reload("Módulo creado"); }
              catch (error) { setMessage(errorText(error)); }
            }}>Crear</button>
            <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setFieldId(null)}>Cancelar</button>
          </div>
        </dialog>
      )}
      {moduleId !== null && (
        <dialog open className="fixed inset-0 z-20 m-auto w-full max-w-md rounded-xl border bg-white p-5">
          <h3 className="mb-2 font-semibold">Cargar capacitación</h3>
          <p className="mb-3 text-sm text-slate-500">Sube el archivo .json de esta capacitación.</p>
          <input type="file" accept=".json,application/json" onChange={async event => {
            const file = event.target.files?.[0];
            if (!file || moduleId === null) return;
            try {
              const parsed = JSON.parse(await file.text());
              await createLesson.mutateAsync({ moduleId, file: parsed });
              setModuleId(null);
              await reload("Capacitación cargada");
            } catch (error) { setMessage(errorText(error)); }
          }} />
          <button className="mt-3 rounded-md border px-3 py-2 text-sm" onClick={() => setModuleId(null)}>Cerrar</button>
        </dialog>
      )}
    </Shell>
  );
}
