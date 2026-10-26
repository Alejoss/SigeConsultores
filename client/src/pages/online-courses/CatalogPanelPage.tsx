import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { coursePath, managementHomeHref } from "./coursePaths";
import { LoginForm, Shell } from "./PortalPage";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción.";
}

export default function CatalogPanelPage() {
  const [, setLocation] = useLocation();
  const whoami = trpc.onlineCourses.whoami.useQuery(undefined, { retry: false });
  const overview = trpc.onlineCourses.catalogOverview.useQuery(undefined, { enabled: whoami.data?.role === "platform_admin" });
  const logout = trpc.onlineCourses.logout.useMutation();
  const createField = trpc.onlineCourses.createField.useMutation();
  const createModule = trpc.onlineCourses.createModule.useMutation();
  const createLesson = trpc.onlineCourses.createLesson.useMutation();
  const assignCompany = trpc.onlineCourses.assignCompany.useMutation();
  const [fieldName, setFieldName] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [fieldId, setFieldId] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [regCode, setRegCode] = useState("");
  const [message, setMessage] = useState("");

  async function reload(text: string) {
    setMessage(text);
    await overview.refetch();
  }

  useEffect(() => {
    if (whoami.data?.role === "company_admin") setLocation(coursePath("/empresa"));
    if (whoami.data?.role === "worker") setLocation(coursePath("/"));
  }, [whoami.data?.role, setLocation]);

  if (whoami.isLoading) return <Shell><p>Cargando…</p></Shell>;
  if (!whoami.data) return <LoginForm onDone={() => whoami.refetch()} />;
  if (whoami.data.role !== "platform_admin") return <Shell><p>Abriendo tu panel…</p></Shell>;

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Administración general</p>
          <h1 className="text-3xl font-semibold">Catálogo de capacitaciones</h1>
        </div>
        <button className="rounded-md border px-3 py-2 text-sm" onClick={async () => { await logout.mutateAsync(); location.href = managementHomeHref(); }}>Salir</button>
      </div>
      {message && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

      <section className="mb-8 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Empresas</h2>
        <table className="mb-3 w-full text-left text-sm">
          <thead><tr className="border-b"><th className="py-2">Empresa</th><th>Código</th><th>Trabajadores</th></tr></thead>
          <tbody>
            {(overview.data?.companies || []).map(company => (
              <tr key={company.id} className="border-b">
                <td className="py-2">{company.name}</td>
                <td>{company.regCode || "—"}</td>
                <td>{company.workers}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2">
          <select className="rounded-md border px-2 py-2 text-sm" value={companyId} onChange={event => setCompanyId(event.target.value)}>
            <option value="">Elegir empresa de ISGE 360</option>
            {(overview.data?.companies || []).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
          <input className="rounded-md border px-2 py-2 text-sm" placeholder="Código (opcional)" value={regCode} onChange={event => setRegCode(event.target.value)} />
          <button className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white" onClick={async () => {
            try {
              const result = await assignCompany.mutateAsync({ companyId: Number(companyId), regCode: regCode || undefined });
              setRegCode("");
              await reload(`Empresa habilitada. Código: ${result.regCode}`);
            } catch (error) { setMessage(errorText(error)); }
          }}>Habilitar empresa</button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Campos, módulos y capacitaciones</h2>
        {(overview.data?.fields || []).map(field => (
          <article key={field.id} className="mb-3 rounded-xl border bg-white p-4">
            <h3 className="font-semibold">{field.name}</h3>
            {field.modules.map(moduleRow => (
              <div key={moduleRow.id} className="flex items-center justify-between border-t py-2 text-sm">
                <span>{moduleRow.name} · {moduleRow.lessonCount} capacitaciones</span>
                <button className="rounded-md border px-2 py-1" onClick={() => setModuleId(moduleRow.id)}>+ Cargar capacitación</button>
              </div>
            ))}
            <button className="mt-2 text-sm text-emerald-800 underline" onClick={() => setFieldId(field.id)}>+ Nuevo módulo en este campo</button>
          </article>
        ))}
        <div className="mt-3 flex gap-2">
          <input className="rounded-md border px-3 py-2" placeholder="Nombre del campo nuevo" value={fieldName} onChange={event => setFieldName(event.target.value)} />
          <button className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white" onClick={async () => {
            try { await createField.mutateAsync({ name: fieldName }); setFieldName(""); await reload("Campo creado"); }
            catch (error) { setMessage(errorText(error)); }
          }}>Agregar campo</button>
        </div>
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
