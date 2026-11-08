import type { inferRouterOutputs } from "@trpc/server";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { AppRouter } from "../../../server/routers";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type RouterOutput = inferRouterOutputs<AppRouter>;
type Commitment = RouterOutput["linkedCommitments"]["listByProcess"][number];

export type PerformanceAreaDetailProps = {
  view: "sgi" | "staff";
  companyId: number;
  processId: number;
  onBack: () => void;
};

const SIG_CATEGORIES = [
  {
    label: "Sistema de Gestión · Checklist",
    sources: ["checklist_action", "checklist_vigency"],
  },
  { label: "Programas", sources: ["program_action"] },
  { label: "Auditorías", sources: ["audit_finding"] },
  { label: "Inspecciones", sources: ["inspection_finding"] },
  { label: "Cumplimientos", sources: ["company_compliance"] },
] as const;
const SIG_SOURCES: ReadonlySet<string> = new Set(
  SIG_CATEGORIES.flatMap(category => [...category.sources])
);

function Loading({ children }: { children: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-12 text-sm text-slate-600"
    >
      <Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin" />
      {children}
    </div>
  );
}

function ErrorMessage({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      {children}
    </p>
  );
}

function EmptyMessage({ children }: { children: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">
      {children}
    </p>
  );
}

function dateLabel(value: Date | string | null) {
  if (!value) return "Sin fecha";
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

// Igual presentación que Participantes; no se recalculan, limitan ni sustituyen sus resultados.
function percentLabel(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "Sin evaluación"
    : `${value.toFixed(1)}%`;
}

function commitmentStatus(item: Commitment) {
  return item.status === "completed"
    ? item.kind === "vigency"
      ? "Vigencia renovada"
      : "Cumplido"
    : "Pendiente";
}

function SystemsArea({
  companyId,
  processId,
}: {
  companyId: number;
  processId: number;
}) {
  const query = trpc.linkedCommitments.listByProcess.useQuery(
    { companyId, processId },
    { retry: false, placeholderData: () => undefined }
  );
  if (query.error)
    return (
      <ErrorMessage>
        No se pudieron cargar las responsabilidades SIG de esta área.
      </ErrorMessage>
    );
  if (query.isLoading || query.data === undefined)
    return <Loading>Cargando responsabilidades SIG...</Loading>;
  const commitments = query.data.filter(
    item =>
      item.companyId === companyId &&
      item.processId === processId &&
      SIG_SOURCES.has(item.sourceType)
  );
  return (
    <div className="min-w-0 space-y-5">
      <p className="text-sm text-slate-600">
        Responsabilidades SIG vinculadas a este proceso. Se muestran los estados
        y el avance registrado de cada responsabilidad; no se calcula un KPI
        global nuevo para el área.
      </p>
      {commitments.length === 0 && (
        <EmptyMessage>
          No hay responsabilidades SIG vinculadas a este proceso.
        </EmptyMessage>
      )}
      {SIG_CATEGORIES.map(category => {
        const records = commitments.filter(item =>
          (category.sources as readonly string[]).includes(item.sourceType)
        );
        return (
          <section
            key={category.label}
            className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:p-4"
          >
            <h3 className="mb-3 font-semibold text-slate-800">
              {category.label}
            </h3>
            {records.length === 0 ? (
              <p className="text-sm text-slate-500">
                Sin registros vinculados a este proceso.
              </p>
            ) : (
              <div
                className="max-w-full overflow-x-auto rounded-md border border-slate-200"
                role="region"
                aria-label={`${category.label}: responsabilidades vinculadas`}
                tabIndex={0}
              >
                <table className="w-full min-w-[560px] table-fixed text-left text-sm">
                  <caption className="sr-only">
                    Responsabilidades de {category.label} de este proceso
                  </caption>
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th scope="col" className="w-[46%] p-3">
                        Descripción
                      </th>
                      <th scope="col" className="w-[18%] p-3">
                        Fecha objetivo
                      </th>
                      <th scope="col" className="w-[18%] p-3">
                        Estado
                      </th>
                      <th scope="col" className="w-[18%] p-3">
                        Avance registrado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map(item => (
                      <tr key={item.id}>
                        <td className="break-words p-3 align-top">
                          <p className="font-medium text-slate-800">
                            {item.title}
                          </p>
                          {item.description && (
                            <p className="mt-1 whitespace-pre-wrap text-slate-500">
                              {item.description}
                            </p>
                          )}
                          {item.notes && (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">
                              Notas: {item.notes}
                            </p>
                          )}
                        </td>
                        <td className="p-3 align-top">
                          {dateLabel(item.dueDate)}
                        </td>
                        <td className="p-3 align-top">
                          {commitmentStatus(item)}
                        </td>
                        <td className="p-3 align-top">
                          {item.sourceProgress
                            ? `${item.sourceProgress.fulfilled} de ${item.sourceProgress.total} responsabilidades cumplidas`
                            : "Sin avance registrado"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <h3 className="mb-2 font-semibold text-slate-800">Capacitaciones</h3>
        <p className="text-sm text-slate-500">
          La fuente actual de capacitaciones es corporativa y no dispone de
          vinculación por proceso. No se atribuyen capacitaciones de empresa a
          esta área.
        </p>
      </section>
    </div>
  );
}

function StaffDashboard({
  companyId,
  processId,
  characterizationId,
  year,
}: {
  companyId: number;
  processId: number;
  characterizationId: number;
  year: number;
}) {
  const query = trpc.processParticipants.performanceDashboard.useQuery(
    { companyId, processCharacterizationId: characterizationId, year },
    { retry: false, placeholderData: () => undefined }
  );
  if (query.error)
    return (
      <ErrorMessage>
        No se pudo cargar el desempeño de personal de esta área.
      </ErrorMessage>
    );
  if (query.isLoading || query.data === undefined)
    return <Loading>Cargando desempeño de personal...</Loading>;
  const data = query.data;
  // No mostrar datos de una referencia distinta ni trabajadores candidatos de Nómina.
  const wrongScope = data.participants.some(
    row =>
      ![characterizationId, processId].includes(
        row.participant.processCharacterizationId
      ) ||
      row.workers.some(
        worker =>
          worker.employee.companyId !== companyId ||
          worker.assignment.processParticipantId !== row.participant.id ||
          worker.employee.currentProcessParticipantId !== row.participant.id
      )
  );
  if (wrongScope)
    return (
      <ErrorMessage>
        No se pudo verificar el alcance del desempeño de esta área.
      </ErrorMessage>
    );
  return (
    <div className="min-w-0 space-y-5">
      <p className="text-sm text-slate-600">
        Evaluación {year}. Resumen y resultados existentes de Participantes del
        proceso, en modo de solo lectura.
      </p>
      <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Puestos de Trabajo", value: data.totalPositions },
          {
            label: "Trabajadores vinculados",
            value: data.totalAssignedWorkers,
          },
          { label: "Pendientes de evaluación", value: data.pendingEvaluations },
          {
            label: "Desempeño total del proceso",
            value: percentLabel(data.totalPerformance),
          },
        ].map(metric => (
          <div
            key={metric.label}
            className="min-w-0 rounded-lg border border-rose-100 bg-rose-50/50 p-4"
          >
            <dt className="text-xs font-medium text-slate-600">
              {metric.label}
            </dt>
            <dd className="mt-2 break-words text-xl font-bold text-slate-800">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
      {data.participants.length === 0 ? (
        <EmptyMessage>
          No hay Puestos de Trabajo registrados en este proceso.
        </EmptyMessage>
      ) : (
        data.participants.map(row => (
          <section
            key={row.participant.id}
            className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:p-4"
          >
            <h3 className="break-words font-semibold text-slate-800">
              {row.participant.position}
            </h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">
              {row.workerCount} trabajadores vinculados · Gestión del puesto:{" "}
              {percentLabel(row.managementPercentage)}
            </p>
            {row.workers.length === 0 ? (
              <EmptyMessage>
                No hay trabajadores vinculados a este Puesto de Trabajo.
              </EmptyMessage>
            ) : (
              <div className="space-y-3">
                {row.workers.map(worker => (
                  <article
                    key={worker.assignment.id}
                    className="min-w-0 rounded-md border border-sky-100 bg-sky-50 p-3"
                  >
                    <h4 className="break-words font-semibold text-slate-800">
                      {worker.employee.fullName}
                    </h4>
                    <p className="mt-1 break-words text-xs text-slate-600">
                      Cargo: {worker.employee.position} · Área de Nómina:{" "}
                      {worker.employee.area}
                    </p>
                    <p className="mt-2 text-sm font-medium text-sky-800">
                      Desempeño: {percentLabel(worker.performance)}
                    </p>
                    {worker.kpis.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        Sin KPI registrados para {year}. Sin evaluación.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {worker.kpis.map(kpi => (
                          <li
                            key={kpi.id}
                            className="rounded-md border border-sky-100 bg-white p-3 text-sm"
                          >
                            <p className="break-words font-medium text-slate-800">
                              {kpi.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              Meta mensual: {kpi.monthlyTarget} · Resultado:{" "}
                              {percentLabel(kpi.percentage)}
                            </p>
                            {kpi.values.length === 0 ? (
                              <p className="mt-2 text-xs text-slate-500">
                                Sin resultados mensuales registrados.
                              </p>
                            ) : (
                              <p className="mt-2 break-words text-xs text-slate-500">
                                Resultados mensuales:{" "}
                                {kpi.values
                                  .map(
                                    value =>
                                      `${value.month.toString().padStart(2, "0")}: ${value.actualValue ?? "Sin registro"}`
                                  )
                                  .join(" · ")}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

function StaffArea({
  companyId,
  processId,
}: {
  companyId: number;
  processId: number;
}) {
  const year = new Date().getFullYear();
  const characterization = trpc.processCharacterization.getByProcessId.useQuery(
    { processId },
    { retry: false, placeholderData: () => undefined }
  );
  if (characterization.error)
    return (
      <ErrorMessage>
        No se pudo verificar la caracterización de esta área.
      </ErrorMessage>
    );
  if (characterization.isLoading || characterization.data === undefined)
    return <Loading>Cargando caracterización del proceso...</Loading>;
  if (!characterization.data)
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Evaluación {year} · Sin evaluación.
        </p>
        <EmptyMessage>
          No hay Puestos de Trabajo registrados en este proceso. Aún no dispone
          de caracterización.
        </EmptyMessage>
      </div>
    );
  if (characterization.data.processId !== processId)
    return (
      <ErrorMessage>
        No se pudo verificar la caracterización de esta área.
      </ErrorMessage>
    );
  return (
    <StaffDashboard
      key={characterization.data.id}
      companyId={companyId}
      processId={processId}
      characterizationId={characterization.data.id}
      year={year}
    />
  );
}

export function PerformanceAreaDetail({
  view,
  companyId,
  processId,
  onBack,
}: PerformanceAreaDetailProps) {
  const validIds =
    Number.isInteger(companyId) &&
    companyId > 0 &&
    Number.isInteger(processId) &&
    processId > 0;
  const process = trpc.processMap.get.useQuery(
    { processId },
    { enabled: validIds, retry: false, placeholderData: () => undefined }
  );
  const title =
    view === "sgi" ? "Sistemas de Gestión" : "Desempeño de Personal";
  // La validación del servidor es requisito previo para montar cualquier consulta de detalle.
  const authorized =
    validIds &&
    !process.error &&
    !process.isLoading &&
    !process.isPlaceholderData &&
    process.data?.id === processId &&
    process.data.companyId === companyId;
  return (
    <div className="min-w-0 max-w-full space-y-5">
      <Button
        variant="outline"
        onClick={onBack}
        className="h-auto max-w-full gap-2 whitespace-normal py-2 text-left"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
        Volver a {title}
      </Button>
      {!validIds || process.error ? (
        <ErrorMessage>No se pudo verificar el acceso a esta área.</ErrorMessage>
      ) : process.isLoading || process.data === undefined ? (
        <Loading>Verificando acceso al área...</Loading>
      ) : !authorized ? (
        <ErrorMessage>No se pudo verificar el acceso a esta área.</ErrorMessage>
      ) : (
        <>
          <header>
            <h2 className="break-words text-xl font-bold text-slate-800">
              {title} por Área
            </h2>
            <p className="mt-1 break-words text-sm text-slate-600">
              Proceso: <strong>{process.data!.name}</strong>
            </p>
            <p className="mt-1 text-xs text-slate-500">Solo lectura</p>
          </header>
          {view === "sgi" ? (
            <SystemsArea
              key={`sgi:${companyId}:${processId}`}
              companyId={companyId}
              processId={processId}
            />
          ) : (
            <StaffArea
              key={`staff:${companyId}:${processId}`}
              companyId={companyId}
              processId={processId}
            />
          )}
        </>
      )}
    </div>
  );
}
