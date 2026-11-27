import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  TEAM_MODULE_KEYS,
  MODULE_LABELS,
  ACCESS_LABELS,
  changedModules,
  defaultModuleAccess,
  type DetailedTeamAccess,
  type TeamModuleKey,
  type ProcessAccessLevel,
} from "@/lib/teamAccess";
export type TeamAccessLeader = {
  accountId: number;
  processId: number;
  leaderName: string | null;
  accessLevel?: string | null;
  moduleAccess?: DetailedTeamAccess["moduleAccess"];
  processAccess?: DetailedTeamAccess["processAccess"];
};
export type TeamAccessProcess = { id: number; name: string };
export type DetailedAccessChanges = {
  moduleChanges: {
    module: TeamModuleKey;
    accessLevel: "none" | "read" | "write";
  }[];
  processAccess?: DetailedTeamAccess["processAccess"];
};
export function AccessSummary({
  modules,
  extras,
  processes,
  ownProcessId,
}: {
  modules: DetailedTeamAccess["moduleAccess"];
  extras: DetailedTeamAccess["processAccess"];
  processes: TeamAccessProcess[];
  ownProcessId: number;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        <strong>Proceso propio:</strong> Consulta y edición (siempre
        conservado).
      </p>
      <ul className="space-y-1">
        {TEAM_MODULE_KEYS.map(module => (
          <li key={module}>
            {MODULE_LABELS[module]}:{" "}
            <strong>
              {
                ACCESS_LABELS[
                  module === "organization_personnel" &&
                  modules[module] === "write"
                    ? "read"
                    : modules[module]
                ]
              }
            </strong>
          </li>
        ))}
      </ul>
      <p>
        <strong>Procesos adicionales:</strong>{" "}
        {extras.length
          ? extras
              .filter(grant => grant.processId !== ownProcessId)
              .map(
                grant =>
                  `${processes.find(process => process.id === grant.processId)?.name || `Proceso ${grant.processId}`} · ${ACCESS_LABELS[grant.accessLevel]}`
              )
              .join("; ")
          : "Ninguno"}
        .
      </p>
    </div>
  );
}
export function TeamAccessDialog({
  mode,
  leader,
  processes,
  pending,
  onClose,
  onApply,
}: {
  mode: "assign" | "restrict";
  leader: TeamAccessLeader;
  processes: TeamAccessProcess[];
  pending: boolean;
  onClose: () => void;
  onApply: (changes: DetailedAccessChanges) => void;
}) {
  const initialModules = useMemo(
    () =>
      leader.moduleAccess ||
      defaultModuleAccess(leader.accessLevel === "coordinator"),
    [leader]
  );
  const initialExtras = useMemo(
    () =>
      (leader.processAccess || []).filter(
        grant => grant.processId !== leader.processId
      ),
    [leader]
  );
  const [modules, setModules] = useState({ ...initialModules });
  const [extras, setExtras] = useState(
    initialExtras.map(grant => ({ ...grant }))
  );
  const [showProcesses, setShowProcesses] = useState(initialExtras.length > 0);
  const moduleChanges = changedModules(initialModules, modules);
  const extrasChanged =
    JSON.stringify([...extras].sort((a, b) => a.processId - b.processId)) !==
    JSON.stringify(
      [...initialExtras].sort((a, b) => a.processId - b.processId)
    );
  const hasChanges = moduleChanges.length > 0 || extrasChanged;
  const changeAssignment = (
    module: "strategy" | "management_systems",
    checked: boolean
  ) => {
    setModules(current => {
      const next = {
        ...current,
        [module]: checked ? ("write" as const) : ("read" as const),
      };
      // Only the touched key is sent. Backend inherits strategy for children without explicit overrides.
      return next;
    });
  };
  const toggleProcess = (processId: number, checked: boolean) =>
    setExtras(current =>
      checked
        ? [...current, { processId, accessLevel: "read" }]
        : current.filter(grant => grant.processId !== processId)
    );
  const restrictedModules = [
    "change_management",
    "company_foda",
    "management_systems",
    "organization_personnel",
  ] as const;
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "assign" ? "Asignar acceso" : "Restringir acceso"} ·{" "}
            {leader.leaderName || "Jefe de Proceso"}
          </DialogTitle>
          <DialogDescription>
            Los cambios no se guardan automáticamente. Revisa el resumen y pulsa
            Aplicar cambios. El proceso propio conserva consulta y edición.
          </DialogDescription>
        </DialogHeader>
        {mode === "assign" ? (
          <div className="space-y-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={modules.strategy === "write"}
                onChange={event =>
                  changeAssignment("strategy", event.target.checked)
                }
              />
              <span>
                <strong>Estrategia</strong>
                <span className="block text-sm text-slate-600">
                  Consulta y edición de las ventanas de Estrategia. Las
                  restricciones de FODA y Gestión del cambio prevalecen.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={modules.management_systems === "write"}
                onChange={event =>
                  changeAssignment("management_systems", event.target.checked)
                }
              />
              <span>
                <strong>Sistemas de Gestión</strong>
                <span className="block text-sm text-slate-600">
                  Consulta y edición de las seis ventanas corporativas de
                  Sistemas de Gestión.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={showProcesses}
                onChange={event => {
                  setShowProcesses(event.target.checked);
                  if (!event.target.checked) setExtras([]);
                }}
              />
              <strong>Acceso a otros procesos</strong>
            </label>
            <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
              Los nuevos procesos adicionales se asignan en{" "}
              <strong>SOLO CONSULTA</strong>: sin editar, autosave ni cargar
              archivos. Cambia expresamente a Consulta y edición si deseas
              autorizar modificaciones. Desmarcar Estrategia o Sistemas restaura
              Solo consulta, no restringe el módulo.
            </p>
            {showProcesses && (
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">
                  Procesos de esta empresa (el propio es implícito)
                </legend>
                {processes
                  .filter(process => process.id !== leader.processId)
                  .map(process => {
                    const grant = extras.find(
                      item => item.processId === process.id
                    );
                    return (
                      <div
                        key={process.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(grant)}
                            onChange={event =>
                              toggleProcess(process.id, event.target.checked)
                            }
                          />
                          {process.name}
                        </label>
                        {grant && (
                          <select
                            aria-label={`Nivel de acceso a ${process.name}`}
                            className="rounded-md border p-2 text-sm"
                            value={grant.accessLevel}
                            onChange={event =>
                              setExtras(current =>
                                current.map(item =>
                                  item.processId === process.id
                                    ? {
                                        ...item,
                                        accessLevel: event.target
                                          .value as ProcessAccessLevel,
                                      }
                                    : item
                                )
                              )
                            }
                          >
                            <option value="read">Solo consulta</option>
                            <option value="write">Consulta y edición</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
              </fieldset>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              Selecciona varios módulos para bloquear su consulta y edición. Las
              restricciones actuales aparecen marcadas. Al desmarcar una
              restricción se restaura <strong>Solo consulta</strong>, nunca
              edición automática.
            </p>
            {restrictedModules.map(module => (
              <label key={module} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={modules[module] === "none"}
                  onChange={event =>
                    setModules(current => ({
                      ...current,
                      [module]: event.target.checked ? "none" : "read",
                    }))
                  }
                />
                {MODULE_LABELS[module]}
              </label>
            ))}
          </div>
        )}
        <section
          aria-label="Resumen de confirmación"
          className="rounded-lg border bg-slate-50 p-4"
        >
          <h3 className="mb-2 font-semibold">Resumen de confirmación</h3>
          <AccessSummary
            modules={modules}
            extras={extras}
            processes={processes}
            ownProcessId={leader.processId}
          />
          {modules.strategy !== initialModules.strategy && <p className="mt-3 text-sm text-blue-900">Se cambiará únicamente Estrategia a {ACCESS_LABELS[modules.strategy]}. Gestión del cambio y FODA empresarial heredarán este nivel cuando no tengan una regla propia guardada. Las restricciones y reglas individuales existentes no se eliminan.</p>}
        {!hasChanges && (
            <p className="mt-3 text-sm text-slate-500">
              Sin cambios pendientes.
            </p>
          )}
        </section>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={pending || !hasChanges}
            onClick={() =>
              onApply({
                moduleChanges,
                ...(extrasChanged ? { processAccess: extras } : {}),
              })
            }
          >
            {pending ? "Aplicando…" : "Aplicar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
