import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { courseDateTimeLocalValue } from "@shared/onlineCourses";
import { trpc } from "@/lib/trpc";
import { coursePath, managementHomeHref } from "./coursePaths";
import { LoginForm, Shell } from "./PortalPage";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción.";
}

function toLocal(iso: string | null): string {
  return courseDateTimeLocalValue(iso);
}

export default function CompanyPanelPage() {
  const [, setLocation] = useLocation();
  const whoami = trpc.onlineCourses.whoami.useQuery(undefined, { retry: false });
  const overview = trpc.onlineCourses.companyOverview.useQuery(undefined, { enabled: whoami.data?.role === "company_admin" });
  const logout = trpc.onlineCourses.logout.useMutation();
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

  const data = overview.data;
  const modules = useMemo(() => data?.fields.flatMap(field => field.modules.map(moduleRow => ({ ...moduleRow, field: field.name }))) || [], [data]);
  const workers = (data?.workers || []).filter(worker => {
    const haystack = `${worker.name} ${worker.cedula} ${worker.jobTitle} ${worker.workCenter}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function reload(text: string) {
    setMessage(text);
    await overview.refetch();
  }

  useEffect(() => {
    if (whoami.data?.role === "platform_admin") setLocation(coursePath("/catalogo"));
    if (whoami.data?.role === "worker") setLocation(coursePath("/"));
  }, [whoami.data?.role, setLocation]);

  if (whoami.isLoading) return <Shell><p>Cargando…</p></Shell>;
  if (!whoami.data) return <LoginForm onDone={() => whoami.refetch()} />;
  if (whoami.data.role !== "company_admin") return <Shell><p>Abriendo tu panel…</p></Shell>;

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{data?.companyName || "Administración"}</p>
          <h1 className="text-3xl font-semibold">Capacitaciones de mi empresa</h1>
        </div>
        <button className="rounded-md border px-3 py-2 text-sm" onClick={async () => { await logout.mutateAsync(); location.href = managementHomeHref(); }}>Salir</button>
      </div>
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
            try { await setCode.mutateAsync({ codigo: code }); setCodeValue(""); await reload("Código actualizado"); }
            catch (error) { setMessage(errorText(error)); }
          }}>Cambiar código</button>
        </div>
      </section>

      <h2 className="mb-2 text-xl font-semibold">Acceso por módulo</h2>
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {modules.map(moduleRow => (
          <article key={`${moduleRow.id}-${moduleRow.opensAt ?? ""}-${moduleRow.closesAt ?? ""}`} className="rounded-xl border bg-white p-4 text-sm">
            <p className="text-xs text-slate-500">{moduleRow.field}</p>
            <h3 className="font-semibold">{moduleRow.name}</h3>
            <p className="text-slate-500">{moduleRow.lessonCount} capacitaciones</p>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={moduleRow.open} onChange={async event => {
                try { await setAccess.mutateAsync({ moduleId: moduleRow.id, open: event.target.checked, opensAt: moduleRow.opensAt, closesAt: moduleRow.closesAt }); await overview.refetch(); }
                catch (error) { setMessage(errorText(error)); }
              }} />
              {moduleRow.open ? "Abierto" : "Cerrado"}
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input type="datetime-local" className="rounded border px-1" defaultValue={toLocal(moduleRow.opensAt)} onBlur={async event => {
                try {
                  await setAccess.mutateAsync({ moduleId: moduleRow.id, open: moduleRow.open, opensAt: event.target.value || null, closesAt: moduleRow.closesAt });
                  await overview.refetch();
                } catch (error) { setMessage(errorText(error)); }
              }} />
              <input type="datetime-local" className="rounded border px-1" defaultValue={toLocal(moduleRow.closesAt)} onBlur={async event => {
                try {
                  await setAccess.mutateAsync({ moduleId: moduleRow.id, open: moduleRow.open, opensAt: moduleRow.opensAt, closesAt: event.target.value || null });
                  await overview.refetch();
                } catch (error) { setMessage(errorText(error)); }
              }} />
            </div>
          </article>
        ))}
      </div>

      <h2 className="mb-2 text-xl font-semibold">Seguimiento del personal</h2>
      <div className="mb-2 flex flex-wrap gap-2">
        <input className="rounded-md border px-3 py-2" placeholder="Buscar por nombre, cédula, cargo o centro" value={query} onChange={event => setQuery(event.target.value)} />
        <CsvButton />
      </div>
      <div className="mb-8 overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2">Persona</th>
              {modules.map(moduleRow => <th key={moduleRow.id} className="px-3 py-2">{moduleRow.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {workers.map(worker => (
              <tr key={worker.id} className="border-t align-top">
                <td className="px-3 py-2">
                  <b>{worker.name}</b>
                  <div className="text-xs text-slate-500">{worker.cedula} · {worker.jobTitle} · {worker.workCenter}</div>
                  <button className="mt-1 text-xs underline" onClick={async () => {
                    const password = window.prompt("Nueva clave (mínimo 6 caracteres)");
                    if (!password) return;
                    try { await resetPassword.mutateAsync({ workerId: worker.id, password }); setMessage("Clave actualizada"); }
                    catch (error) { setMessage(errorText(error)); }
                  }}>Restablecer clave</button>
                </td>
                {modules.map(moduleRow => {
                  const cell = worker.modules[moduleRow.id];
                  return (
                    <td key={moduleRow.id} className="px-3 py-2">
                      <div>{{ aprobado: "Aprobado", en_curso: "En curso", sin_iniciar: "Sin iniciar" }[cell?.status || "sin_iniciar"]}</div>
                      <select className="mt-1 rounded border text-xs" value={cell?.override || "auto"} onChange={async event => {
                        try {
                          await setOverride.mutateAsync({ workerId: worker.id, moduleId: moduleRow.id, value: event.target.value as "abrir" | "cerrar" | "auto" });
                          await overview.refetch();
                        } catch (error) { setMessage(errorText(error)); }
                      }}>
                        <option value="auto">Según la empresa</option>
                        <option value="abrir">Abrir solo a esta persona</option>
                        <option value="cerrar">Cerrar solo a esta persona</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-xl font-semibold">Tus capacitaciones propias</h2>
      <p className="mb-3 text-sm text-slate-500">Solo las ve tu empresa. Se publican directo.</p>
      {(data?.fields || []).filter(field => field.own).map(field => (
        <article key={field.id} className="mb-3 rounded-xl border bg-white p-4">
          <h3 className="font-semibold">{field.name}</h3>
          {field.modules.map(moduleRow => (
            <div key={moduleRow.id} className="flex items-center justify-between border-t py-2 text-sm">
              <span>{moduleRow.name} · {moduleRow.lessonCount}</span>
              <button className="rounded border px-2 py-1" onClick={() => setModuleId(moduleRow.id)}>+ Cargar capacitación</button>
            </div>
          ))}
          <button className="mt-2 text-sm underline" onClick={() => setFieldId(field.id)}>+ Nuevo módulo</button>
        </article>
      ))}
      <div className="flex gap-2">
        <input className="rounded-md border px-3 py-2" placeholder="Nombre del campo nuevo" value={fieldName} onChange={event => setFieldName(event.target.value)} />
        <button className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white" onClick={async () => {
          try { await createField.mutateAsync({ name: fieldName }); setFieldName(""); await reload("Campo creado"); }
          catch (error) { setMessage(errorText(error)); }
        }}>Agregar campo propio</button>
      </div>

      {fieldId !== null && (
        <dialog open className="fixed inset-0 z-20 m-auto max-w-md rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold">Nuevo módulo</h3>
          <input className="mb-3 w-full rounded border px-3 py-2" value={moduleName} onChange={event => setModuleName(event.target.value)} />
          <button className="mr-2 rounded bg-emerald-700 px-3 py-2 text-sm text-white" onClick={async () => {
            try { await createModule.mutateAsync({ fieldId, name: moduleName }); setModuleName(""); setFieldId(null); await reload("Módulo creado"); }
            catch (error) { setMessage(errorText(error)); }
          }}>Crear</button>
          <button className="rounded border px-3 py-2 text-sm" onClick={() => setFieldId(null)}>Cancelar</button>
        </dialog>
      )}
      {moduleId !== null && (
        <dialog open className="fixed inset-0 z-20 m-auto max-w-md rounded-xl border bg-white p-5">
          <h3 className="mb-2 font-semibold">Cargar capacitación</h3>
          <input type="file" accept=".json,application/json" onChange={async event => {
            const file = event.target.files?.[0];
            if (!file || moduleId === null) return;
            try {
              await createLesson.mutateAsync({ moduleId, file: JSON.parse(await file.text()) });
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

function CsvButton() {
  const utils = trpc.useUtils();
  return (
    <button className="rounded-md border px-3 py-2 text-sm" onClick={async () => {
      const file = await utils.onlineCourses.exportCsv.fetch();
      const blob = new Blob([file.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
    }}>Descargar Excel (CSV)</button>
  );
}
