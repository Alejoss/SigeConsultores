import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardList,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { getCompanyIdFromSession } from "@/lib/sessionScope";
import { getJobDescriptionProcessTypeLabel } from "./payrollJobDescriptionLabels";
import {
  getProcessParticipantCompetencyLevelLabel,
  getProcessParticipantCompetencyTypeLabel,
} from "../../../shared/processParticipantCompetencies";

const normalizeSearchText = (value: unknown) =>
  String(value ?? "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const matchesSearch = (query: string, ...values: Array<unknown>) =>
  values.some(value => normalizeSearchText(value).includes(query));

export default function PayrollJobDescriptions() {
  const [, setLocation] = useLocation();
  const companyId = useMemo(() => getCompanyIdFromSession() || 0, []);
  const [search, setSearch] = useState("");
  const [expandedProcesses, setExpandedProcesses] = useState<Set<number>>(
    () => new Set()
  );
  const [expandedPositions, setExpandedPositions] = useState<Set<number>>(
    () => new Set()
  );
  const {
    data: processes = [],
    isLoading,
    error,
  } = trpc.payroll.jobDescriptions.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const normalizedQuery = normalizeSearchText(search);
  const filteredProcesses = useMemo(() => {
    if (!normalizedQuery) return processes;

    return processes
      .map(process => {
        const processMatches = matchesSearch(
          normalizedQuery,
          process.name,
          getJobDescriptionProcessTypeLabel(process.processType)
        );
        const matchingPositions = process.positions.filter(position =>
          matchesSearch(
            normalizedQuery,
            position.position,
            position.objective,
            position.responsibility,
            position.authority,
            ...position.competencies.flatMap(competency => [
              competency.name,
              getProcessParticipantCompetencyTypeLabel(competency.competencyType),
              getProcessParticipantCompetencyLevelLabel(competency.competencyLevel),
            ])
          )
        );
        return processMatches
          ? process
          : { ...process, positions: matchingPositions };
      })
      .filter(process => process.positions.length > 0);
  }, [normalizedQuery, processes]);

  const totalPositions = processes.reduce(
    (total, process) => total + process.positions.length,
    0
  );

  const toggleProcess = (processId: number) => {
    setExpandedProcesses(current => {
      const next = new Set(current);
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });
  };

  const togglePosition = (positionId: number) => {
    setExpandedPositions(current => {
      const next = new Set(current);
      if (next.has(positionId)) next.delete(positionId);
      else next.add(positionId);
      return next;
    });
  };

  if (!companyId) {
    return (
      <DashboardLayout>
        <p className="py-12 text-center text-slate-600">
          Selecciona una empresa para consultar sus descriptivos de cargo.
        </p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700">
              <BriefcaseBusiness className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                Descriptivos de cargo
              </h1>
              <p className="mt-1 max-w-3xl text-slate-600">
                Consulta los puestos definidos por cada proceso, sus funciones y
                las competencias requeridas.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              setLocation(`/organization-chart?companyId=${companyId}`)
            }
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </div>

        <Card className="border-violet-200 bg-violet-50/60">
          <CardContent className="flex gap-3 pt-5 text-sm text-violet-950">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
            <p>
              Esta es una consolidación de solo lectura. Para crear o actualizar
              funciones o competencias, ingresa a <strong>Participantes</strong>{" "}
              dentro del proceso correspondiente.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="pt-5">
              <p className="text-sm text-slate-600">Procesos de la empresa</p>
              <p className="mt-1 text-3xl font-bold text-violet-700">
                {isLoading ? "—" : processes.length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-5">
              <p className="text-sm text-slate-600">
                Puestos de trabajo definidos
              </p>
              <p className="mt-1 text-3xl font-bold text-emerald-700">
                {isLoading ? "—" : totalPositions}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Descriptivos por proceso</CardTitle>
              <CardDescription>
                Selecciona un proceso y después un puesto para revisar su
                descriptivo.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                aria-label="Buscar descriptivos de cargo"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar proceso, puesto o contenido..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Cargando descriptivos de cargo...
              </div>
            ) : error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-center text-sm text-rose-800">
                No fue posible cargar los descriptivos de cargo. Inténtalo de
                nuevo.
              </div>
            ) : processes.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-slate-500">
                Aún no hay procesos registrados para esta empresa.
              </div>
            ) : filteredProcesses.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-slate-500">
                No se encontraron procesos ni puestos que coincidan con “
                {search}”.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProcesses.map(process => {
                  const isProcessExpanded = expandedProcesses.has(process.id);
                  return (
                    <section
                      key={process.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => toggleProcess(process.id)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset"
                        aria-expanded={isProcessExpanded}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="rounded-lg bg-sky-100 p-2 text-sky-700">
                            <ClipboardList className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-lg font-semibold text-slate-900">
                              {process.name}
                            </span>
                            <span className="mt-0.5 block text-sm text-slate-500">
                              {getJobDescriptionProcessTypeLabel(process.processType)} · {" "}
                              {process.positions.length} puesto
                              {process.positions.length === 1 ? "" : "s"} de
                              trabajo
                            </span>
                          </span>
                        </span>
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${
                            isProcessExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {isProcessExpanded && (
                        <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-4">
                          {process.positions.length === 0 ? (
                            <p className="rounded-lg border border-dashed bg-white px-4 py-6 text-center text-sm text-slate-500">
                              Este proceso todavía no tiene puestos de trabajo
                              definidos en Participantes.
                            </p>
                          ) : (
                            process.positions.map(position => {
                              const isPositionExpanded = expandedPositions.has(
                                position.id
                              );
                              return (
                                <article
                                  key={position.id}
                                  className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                                >
                                  <button
                                    type="button"
                                    onClick={() => togglePosition(position.id)}
                                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset"
                                    aria-expanded={isPositionExpanded}
                                  >
                                    <span className="font-semibold text-slate-900">
                                      {position.position}
                                    </span>
                                    <ChevronDown
                                      className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${
                                        isPositionExpanded ? "rotate-180" : ""
                                      }`}
                                    />
                                  </button>
                                  {isPositionExpanded && (
                                    <Tabs defaultValue="functions" className="border-t border-slate-200 p-4">
                                      <TabsList aria-label="Información del cargo">
                                        <TabsTrigger value="functions">Funciones del cargo</TabsTrigger>
                                        <TabsTrigger value="competencies">Competencias</TabsTrigger>
                                      </TabsList>
                                      <TabsContent value="functions" className="mt-3">
                                        <div className="grid gap-4 md:grid-cols-3">
                                          <DescriptionBlock title="Objetivo" value={position.objective} />
                                          <DescriptionBlock title="Responsabilidades" value={position.responsibility} />
                                          <DescriptionBlock title="Autoridad" value={position.authority} />
                                        </div>
                                      </TabsContent>
                                      <TabsContent value="competencies" className="mt-3">
                                        {position.competencies.length === 0 ? (
                                          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                                            Aún no hay competencias registradas para este puesto.
                                          </p>
                                        ) : (
                                          <div className="overflow-x-auto rounded-lg border border-slate-200">
                                            <table className="min-w-full text-sm">
                                              <thead className="bg-slate-50 text-left text-slate-600">
                                                <tr>
                                                  <th className="px-4 py-3 font-semibold">Competencia</th>
                                                  <th className="px-4 py-3 font-semibold">Tipo</th>
                                                  <th className="px-4 py-3 font-semibold">Nivel requerido</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100 bg-white">
                                                {position.competencies.map(competency => (
                                                  <tr key={competency.id}>
                                                    <td className="px-4 py-3 font-medium text-slate-900">{competency.name}</td>
                                                    <td className="px-4 py-3 text-slate-600">{getProcessParticipantCompetencyTypeLabel(competency.competencyType)}</td>
                                                    <td className="px-4 py-3 text-slate-600">{getProcessParticipantCompetencyLevelLabel(competency.competencyLevel)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </TabsContent>
                                    </Tabs>
                                  )}
                                </article>
                              );
                            })
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function DescriptionBlock({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
        {value?.trim() || "Sin definición registrada."}
      </p>
    </div>
  );
}
