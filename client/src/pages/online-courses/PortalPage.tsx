import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { coursePath } from "./coursePaths";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción.";
}

export default function PortalPage() {
  const [, setLocation] = useLocation();
  const whoami = trpc.onlineCourses.whoami.useQuery(undefined, { retry: false });
  const tree = trpc.onlineCourses.tree.useQuery(undefined, { enabled: whoami.data?.role === "worker", retry: false });
  const logout = trpc.onlineCourses.logout.useMutation();
  const [query, setQuery] = useState("");
  const search = trpc.onlineCourses.search.useQuery({ q: query }, { enabled: whoami.data?.role === "worker" && query.trim().length >= 2 });

  useEffect(() => {
    if (whoami.data?.role === "company_admin") setLocation(coursePath("/empresa"));
    if (whoami.data?.role === "platform_admin") setLocation(coursePath("/catalogo"));
  }, [whoami.data?.role, setLocation]);

  if (whoami.isLoading) return <Shell><p className="text-slate-500">Cargando…</p></Shell>;
  if (!whoami.data) return <LoginForm onDone={() => whoami.refetch()} />;
  if (whoami.data.role !== "worker") return <Shell><p className="text-slate-500">Abriendo tu panel…</p></Shell>;

  const fields = tree.data?.fields || [];
  const total = fields.reduce((sum, field) => sum + field.modules.length, 0);
  const approved = fields.reduce((sum, field) => sum + field.approved, 0);

  return (
    <Shell>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Plataforma de capacitación</p>
          <h1 className="text-3xl font-semibold text-slate-900">Hola, {whoami.data.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-500">{approved} de {total} módulos aprobados.</p>
        </div>
        <button className="rounded-md border px-3 py-2 text-sm" onClick={async () => { await logout.mutateAsync(); whoami.refetch(); }}>
          Salir
        </button>
      </div>
      <div className="relative mb-6">
        <input className="w-full rounded-lg border px-3 py-3" placeholder="Busca una capacitación por nombre…" value={query} onChange={event => setQuery(event.target.value)} />
        {search.data && query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow">
            {search.data.results.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Sin resultados</p>}
            {search.data.results.map(result => (
              <button key={result.lessonId} className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-slate-50" onClick={() => setLocation(coursePath(`/modulo/${result.moduleId}`))}>
                <span className="block text-sm font-medium">{result.title}</span>
                <span className="text-xs text-slate-500">{result.fieldName} · {result.moduleName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {fields.length === 0 && <p className="text-slate-500">Todavía no hay capacitaciones asignadas a tu empresa.</p>}
      {fields.map(field => (
        <section key={field.id} className="mb-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{field.name}</h2>
            {field.certificate && <a className="text-sm text-emerald-700 underline" href={coursePath(`/certificado/campo/${field.id}`)}>Ver certificado</a>}
          </div>
          <div className="space-y-2">
            {field.modules.map(moduleRow => {
              const open = moduleRow.state === "disponible";
              return (
                <div key={moduleRow.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-4">
                  <div>
                    <p className="font-medium">{moduleRow.name}</p>
                    <p className="text-sm text-slate-500">
                      <StateChip state={moduleRow.state} /> {moduleRow.lessonCount} capacitaciones
                      {moduleRow.done > 0 && moduleRow.state !== "aprobado" ? ` · avance ${moduleRow.done}/${moduleRow.lessonCount}` : ""}
                      {moduleRow.closesLabel ? ` · abierto hasta ${moduleRow.closesLabel}` : ""}
                    </p>
                    {moduleRow.reason && <p className="text-sm text-slate-500">{moduleRow.reason}</p>}
                  </div>
                  {moduleRow.certificate && <a className="rounded-md border px-3 py-2 text-sm" href={coursePath(`/certificado/modulo/${moduleRow.id}`)}>Certificado</a>}
                  {open && <a className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white" href={coursePath(`/modulo/${moduleRow.id}`)}>{moduleRow.done ? "Continuar" : "Empezar"}</a>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </Shell>
  );
}

function StateChip({ state }: { state: string }) {
  const label = { aprobado: "Aprobado", disponible: "Disponible", cerrado: "Cerrado", bloqueado: "Bloqueado" }[state] || state;
  const color = state === "aprobado" ? "text-emerald-700" : state === "disponible" ? "text-amber-700" : "text-slate-500";
  return <span className={`font-medium ${color}`}>{label}.</span>;
}

export function LoginForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"in" | "reg">("in");
  const [identificacion, setIdentificacion] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [codigo, setCodigo] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [centro, setCentro] = useState("");
  const [error, setError] = useState("");
  const login = trpc.onlineCourses.login.useMutation();
  const register = trpc.onlineCourses.register.useMutation();

  async function submit() {
    setError("");
    try {
      if (mode === "reg") {
        if (password !== passwordConfirm) {
          setError("Las claves no coinciden.");
          return;
        }
        await register.mutateAsync({ cedula: identificacion, nombre, password, codigo, cargo, centro });
      } else {
        await login.mutateAsync({ identificacion, password, codigo: codigo || undefined });
      }
      onDone();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Plataforma de capacitación</p>
      <h1 className="mb-4 text-3xl font-semibold">Ingresa a tu cuenta</h1>
      <div className="max-w-md rounded-xl border bg-white p-5">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button className={`rounded-md px-3 py-2 text-sm ${mode === "in" ? "bg-emerald-700 text-white" : "border"}`} onClick={() => setMode("in")}>Ingresar</button>
          <button className={`rounded-md px-3 py-2 text-sm ${mode === "reg" ? "bg-emerald-700 text-white" : "border"}`} onClick={() => setMode("reg")}>Crear cuenta</button>
        </div>
        <label className="mb-3 block text-sm">
          {mode === "in" ? "Cédula o correo" : "Cédula o identificación"}
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={identificacion} onChange={event => setIdentificacion(event.target.value)} />
        </label>
        {mode === "in" && (
          <p className="mb-3 text-xs text-slate-500">Personal de la empresa: usa el correo de ISGE 360. Trabajadores: usa tu cédula.</p>
        )}
        {(mode === "reg" || showCode) && (
          <label className="mb-3 block text-sm">
            Código de tu empresa
            <input className="mt-1 w-full rounded-md border px-3 py-2" value={codigo} onChange={event => setCodigo(event.target.value)} />
          </label>
        )}
        {mode === "in" && !showCode && (
          <button className="mb-3 text-xs text-emerald-800 underline" onClick={() => setShowCode(true)}>Tengo código de empresa</button>
        )}
        {mode === "reg" && (
          <>
            <label className="mb-3 block text-sm">Nombres y apellidos<input className="mt-1 w-full rounded-md border px-3 py-2" value={nombre} onChange={event => setNombre(event.target.value)} /></label>
            <label className="mb-3 block text-sm">Cargo<input className="mt-1 w-full rounded-md border px-3 py-2" value={cargo} onChange={event => setCargo(event.target.value)} /></label>
            <label className="mb-3 block text-sm">Centro de trabajo<input className="mt-1 w-full rounded-md border px-3 py-2" value={centro} onChange={event => setCentro(event.target.value)} /></label>
          </>
        )}
        <label className={`block text-sm ${mode === "reg" ? "mb-3" : "mb-4"}`}>
          Clave
          <input type="password" className="mt-1 w-full rounded-md border px-3 py-2" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submit(); }} />
        </label>
        {mode === "reg" && (
          <label className="mb-4 block text-sm">
            Repite la clave
            <input type="password" className="mt-1 w-full rounded-md border px-3 py-2" value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submit(); }} />
          </label>
        )}
        <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white" onClick={() => void submit()}>{mode === "reg" ? "Crear cuenta" : "Ingresar"}</button>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">{children}</main>;
}
