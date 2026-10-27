import { useState } from "react";
import { Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ContentKind = "campo" | "modulo" | "capacitacion";
type RemovalOutcome = "archived" | "deleted";

const kindLabel: Record<ContentKind, string> = {
  campo: "campo",
  modulo: "módulo",
  capacitacion: "capacitación",
};

type Props = {
  kind: ContentKind;
  id: number;
  name: string;
  companyId?: number;
  onRemoved: (outcome: RemovalOutcome) => Promise<void> | void;
};

/** A confirmed removal keeps learner history safe by archiving used content. */
export function CourseContentRemovalButton({
  kind,
  id,
  name,
  companyId,
  onRemoved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const removeContent = trpc.onlineCourses.removeContent.useMutation();
  const label = kindLabel[kind];

  async function remove() {
    setError("");
    try {
      const result = await removeContent.mutateAsync({ kind, id, companyId });
      setOpen(false);
      await onRemoved(result.outcome);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo retirar el contenido."
      );
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="rounded-md p-2 text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          aria-label={`Retirar ${label}: ${name}`}
          title={`Retirar ${label}`}
          disabled={removeContent.isPending}
        >
          <Trash2 size={16} />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Retirar este {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se retirará “{name}” de las pantallas activas. Si ya tiene avances,
            visitas o certificados, se archivará para conservar ese historial;
            si aún no se ha usado, se eliminará definitivamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeContent.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            disabled={removeContent.isPending}
            onClick={event => {
              event.preventDefault();
              void remove();
            }}
          >
            {removeContent.isPending ? "Retirando…" : "Sí, retirar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
