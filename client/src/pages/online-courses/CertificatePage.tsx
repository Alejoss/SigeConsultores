import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { coursePath } from "./coursePaths";
import { CourseNav, Shell } from "./PortalPage";

export default function CertificatePage() {
  const [location] = useLocation();
  const parts = location.split("/").filter(Boolean);
  const id = Number(parts[parts.length - 1]);
  const kind = parts[parts.length - 2];
  const valid = kind === "capacitacion" || kind === "modulo" || kind === "campo";
  const certificate = trpc.onlineCourses.certificate.useQuery(
    { kind: valid ? kind : "capacitacion", id },
    { enabled: valid && Number.isInteger(id) && id > 0, retry: false }
  );

  if (!valid) return <Shell><p>Certificado no disponible.</p></Shell>;
  if (certificate.isLoading) return <Shell><p>Cargando…</p></Shell>;
  if (certificate.error || !certificate.data) return <Shell><p>{certificate.error?.message || "Certificado no disponible."}</p></Shell>;
  const data = certificate.data;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <CourseNav />
      <div className="mb-4 flex gap-2 print:hidden">
        <button className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white" onClick={() => window.print()}>Imprimir o guardar en PDF</button>
        <a className="rounded-md border px-3 py-2 text-sm" href={coursePath("/")}>Volver al portal</a>
      </div>
      <article className="rounded-xl border p-8">
        <p className="text-sm uppercase tracking-wide text-slate-500">{data.companyName}</p>
        <h1 className="mt-2 text-3xl font-semibold">Certificado — {data.title}</h1>
        <p className="mt-6">Se confiere el presente certificado a</p>
        <p className="mt-2 text-2xl font-semibold">{data.workerName}</p>
        <p className="text-sm text-slate-600">C.I. {data.cedula}</p>
        <p className="mt-4">por haber aprobado {data.kind === "capacitacion" ? "la capacitación" : data.kind === "modulo" ? "el módulo" : "el campo"} <b>{data.title}</b>{data.subtitle ? ` (${data.subtitle})` : ""}.</p>
        {data.lines.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {data.lines.map(line => (
              <li key={line.label} className="flex justify-between gap-4 border-b py-1"><span>{line.label}</span><span>{line.detail}</span></li>
            ))}
          </ul>
        )}
        <p className="mt-4">Duración: {data.hours} {data.hours === 1 ? "hora" : "horas"} de formación. Nota: {data.scoreLabel}.</p>
        <div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm">
          <div className="border-t pt-2">Responsable de Talento Humano</div>
          <div className="border-t pt-2">Representante legal</div>
        </div>
        <p className="mt-6 text-xs text-slate-500">Emitido el {data.issuedOn}. Código: {data.code}.</p>
      </article>
    </main>
  );
}
