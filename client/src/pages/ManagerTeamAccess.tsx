import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  GraduationCap,
  Loader2,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  AccessSummary,
  TeamAccessDialog,
} from "@/components/TeamAccessDialogs";
import { defaultModuleAccess } from "@/lib/teamAccess";

export default function ManagerTeamAccess() {
  const [, navigate] = useLocation();
  const { isManagerLogin, managerCompanyId, isLoading } = useManagerAuth();
  const companyId = managerCompanyId || 0;
  const utils = trpc.useUtils();
  const leadersQuery = trpc.teamAccess.listProcessLeaders.useQuery(
    { companyId },
    { enabled: isManagerLogin && companyId > 0 }
  );
  const processesQuery = trpc.processMap.list.useQuery(
    { companyId },
    { enabled: isManagerLogin && companyId > 0 }
  );
  type Leader = NonNullable<typeof leadersQuery.data>[number];
  const [dialog, setDialog] = useState<{
    mode: "assign" | "restrict";
    leader: Leader;
  } | null>(null);
  const [reassignAccountId, setReassignAccountId] = useState<number | null>(
    null
  );
  const [targetProcessId, setTargetProcessId] = useState("");
  const refresh = async () => {
    await Promise.all([
      utils.teamAccess.listProcessLeaders.invalidate({ companyId }),
      utils.processMap.list.invalidate({ companyId }),
      utils.teamAccess.getMyDetailedAccess.invalidate(),
    ]);
  };
  const onError = (error: { message: string }) => toast.error(error.message);
  const suspend = trpc.teamAccess.suspendProcessLeader.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Acceso suspendido. Los datos del proceso se conservan.");
    },
    onError,
  });
  const reactivate = trpc.teamAccess.reactivateProcessLeader.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Acceso reactivado.");
    },
    onError,
  });
  const reassign = trpc.teamAccess.reassignProcessLeader.useMutation({
    onSuccess: async () => {
      setReassignAccountId(null);
      setTargetProcessId("");
      await refresh();
      toast.success("Jefe de Proceso reasignado.");
    },
    onError,
  });
  const detailed = trpc.teamAccess.setDetailedAccess.useMutation({
    onSuccess: async () => {
      setDialog(null);
      await refresh();
      toast.success("Permisos actualizados.");
    },
    onError,
  });
  const online = trpc.teamAccess.setOnlineCourseManagementAccess.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(
        "Autorización de cursos en línea actualizada de forma independiente."
      );
    },
    onError,
  });
  if (isLoading)
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!isManagerLogin || !companyId)
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>
              Disponible únicamente para el Gerente General de esta empresa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/login")}>
              Ir al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  const leaders = leadersQuery.data || [];
  const processes = processesQuery.data || [];
  const activeProcessIds = new Set(
    leaders
      .filter(leader => leader.status === "active")
      .map(leader => leader.processId)
  );
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Volver al panel"
              onClick={() => navigate("/manager-dashboard")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Accesos del equipo</h1>
              <p className="mt-1 text-sm text-slate-600">
                Todos los procesos de la empresa y sus cuentas de Jefes.
                Gestiona permisos sin borrar información ni historial.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            disabled={leadersQuery.isFetching || processesQuery.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </header>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-5 text-sm text-blue-950">
            Cada cuenta conserva{" "}
            <strong>consulta y edición de su proceso propio</strong>. Asigna
            módulos o procesos adicionales y restringe módulos de forma
            independiente. Los nuevos procesos adicionales son{" "}
            <strong>Solo consulta</strong>, salvo elección expresa de edición.
            Capacitaciones en Línea es independiente. Visitar esta página no
            cambia autorizaciones anteriores.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5" />
              Procesos y Jefes de Proceso
            </CardTitle>
            <CardDescription>
              {processes.length} procesos · {leaders.length} cuentas asociadas a
              esta empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {leadersQuery.isLoading || processesQuery.isLoading ? (
              <p role="status">Cargando procesos y accesos…</p>
            ) : leadersQuery.error || processesQuery.error ? (
              <p role="alert" className="text-red-700">
                No se pudieron cargar los accesos. Actualiza para reintentar.
              </p>
            ) : processes.length === 0 ? (
              <p>No hay procesos registrados.</p>
            ) : (
              processes.map(process => {
                const accounts = leaders.filter(
                  leader => leader.processId === process.id
                );
                return (
                  <section
                    key={process.id}
                    aria-label={`Proceso ${process.name}`}
                    className="rounded-xl border border-slate-200"
                  >
                    <h2 className="rounded-t-xl bg-slate-100 px-4 py-3 font-semibold">
                      {process.name}
                    </h2>
                    <div className="space-y-4 p-4">
                      {accounts.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          Sin Jefe de Proceso asignado. No hay una cuenta a la
                          que asignar o restringir acceso.
                        </p>
                      ) : (
                        accounts.map(leader => {
                          const suspended = leader.status === "suspended";
                          const onlineManager =
                            leader.onlineCourseAccessLevel ===
                            "online_course_manager";
                          const eligible = processes.filter(
                            item =>
                              item.id !== process.id &&
                              !activeProcessIds.has(item.id)
                          );
                          return (
                            <article
                              key={leader.accountRoleId}
                              aria-label={`Cuenta ${leader.email || leader.accountId}`}
                              className="rounded-lg border bg-white p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <h3 className="font-semibold">
                                    {leader.leaderName || "Jefe de Proceso"}
                                  </h3>
                                  <p className="text-sm text-slate-600">
                                    {leader.email || "Sin correo registrado"}
                                  </p>
                                  <p className="mt-1 text-xs font-medium">
                                    {suspended ? "Suspendido" : "Activo"}
                                    {leader.accessLevel === "coordinator"
                                      ? " · Coordinación anterior conservada"
                                      : ""}
                                    {onlineManager
                                      ? " · Administra cursos en línea"
                                      : ""}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    disabled={suspended || detailed.isPending}
                                    onClick={() =>
                                      setDialog({ mode: "assign", leader })
                                    }
                                  >
                                    Asignar acceso
                                  </Button>
                                  <Button
                                    variant="outline"
                                    disabled={suspended || detailed.isPending}
                                    onClick={() =>
                                      setDialog({ mode: "restrict", leader })
                                    }
                                  >
                                    Restringir acceso
                                  </Button>
                                  {suspended ? (
                                    <Button
                                      variant="outline"
                                      disabled={reactivate.isPending}
                                      onClick={() =>
                                        reactivate.mutate({
                                          companyId,
                                          processId: process.id,
                                          accountId: leader.accountId,
                                        })
                                      }
                                    >
                                      Reactivar
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      disabled={suspend.isPending}
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `¿Suspender el acceso de ${leader.email || leader.leaderName}? La información del proceso se conserva.`
                                          )
                                        )
                                          suspend.mutate({
                                            companyId,
                                            processId: process.id,
                                            accountId: leader.accountId,
                                          });
                                      }}
                                    >
                                      Suspender
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setReassignAccountId(
                                        reassignAccountId === leader.accountId
                                          ? null
                                          : leader.accountId
                                      );
                                      setTargetProcessId("");
                                    }}
                                  >
                                    Reasignar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    disabled={suspended || online.isPending}
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `${onlineManager ? "¿Revocar" : "¿Autorizar"} la administración de Capacitaciones en Línea para ${leader.email}? No cambia módulos ni procesos.`
                                        )
                                      )
                                        online.mutate({
                                          companyId,
                                          accountId: leader.accountId,
                                          accessLevel: onlineManager
                                            ? "standard"
                                            : "online_course_manager",
                                        });
                                    }}
                                  >
                                    <GraduationCap className="mr-1 h-4 w-4" />
                                    {onlineManager
                                      ? "Revocar cursos en línea"
                                      : "Autorizar cursos en línea"}
                                  </Button>
                                </div>
                              </div>
                              <section
                                aria-label="Acceso efectivo"
                                className="mt-4 rounded-lg bg-slate-50 p-3"
                              >
                                <h4 className="mb-2 text-sm font-semibold">
                                  Acceso efectivo
                                  {suspended
                                    ? " (no disponible mientras esté suspendido)"
                                    : ""}
                                </h4>
                                <AccessSummary
                                  modules={
                                    leader.moduleAccess ||
                                    defaultModuleAccess(
                                      leader.accessLevel === "coordinator"
                                    )
                                  }
                                  extras={leader.processAccess || []}
                                  processes={processes}
                                  ownProcessId={process.id}
                                />
                              </section>
                              {reassignAccountId === leader.accountId && (
                                <div className="mt-4 flex flex-wrap items-end gap-3">
                                  <label className="text-sm">
                                    Nuevo proceso
                                    <select
                                      aria-label={`Reasignar ${leader.email}`}
                                      className="ml-2 rounded-md border p-2"
                                      value={targetProcessId}
                                      onChange={event =>
                                        setTargetProcessId(event.target.value)
                                      }
                                    >
                                      <option value="">
                                        Seleccionar proceso disponible
                                      </option>
                                      {eligible.map(item => (
                                        <option key={item.id} value={item.id}>
                                          {item.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <Button
                                    disabled={
                                      !targetProcessId || reassign.isPending
                                    }
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `¿Reasignar ${leader.email} al proceso seleccionado?`
                                        )
                                      )
                                        reassign.mutate({
                                          companyId,
                                          accountId: leader.accountId,
                                          fromProcessId: process.id,
                                          toProcessId: Number(targetProcessId),
                                        });
                                    }}
                                  >
                                    Confirmar reasignación
                                  </Button>
                                </div>
                              )}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })
            )}
          </CardContent>
        </Card>
        {dialog && (
          <TeamAccessDialog
            key={`${dialog.mode}:${dialog.leader.accountId}`}
            mode={dialog.mode}
            leader={dialog.leader}
            processes={processes}
            pending={detailed.isPending}
            onClose={() => setDialog(null)}
            onApply={changes =>
              detailed.mutate({
                companyId,
                accountId: dialog.leader.accountId,
                ...changes,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
