import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface CreateManagerInvitationProps {
  companies: Array<{ id: number; name: string }>;
  onSuccess?: () => void;
}

function resetFormState(setters: {
  setSelectedCompanyId: (v: string) => void;
  setManagerEmail: (v: string) => void;
  setExpirationDays: (v: number) => void;
  setError: (v: string | null) => void;
}) {
  setters.setSelectedCompanyId("");
  setters.setManagerEmail("");
  setters.setExpirationDays(30);
  setters.setError(null);
}

export default function CreateManagerInvitation({
  companies,
  onSuccess,
}: CreateManagerInvitationProps) {
  const [open, setOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [managerEmail, setManagerEmail] = useState("");
  const [expirationDays, setExpirationDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.managerInvitations.create.useMutation({
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || "Error al crear la invitación");
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && !createMutation.isPending) {
      resetFormState({
        setSelectedCompanyId,
        setManagerEmail,
        setExpirationDays,
        setError,
      });
    }
  };

  const handleCreateInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCompanyId || !managerEmail) {
      setError("Por favor completa todos los campos requeridos");
      return;
    }

    const invitedEmail = managerEmail.trim().toLowerCase();
    createMutation.mutate(
      {
        companyId: parseInt(selectedCompanyId, 10),
        managerEmail: invitedEmail,
        expirationDays,
      },
      {
        onSuccess: (data) => {
          setOpen(false);
          resetFormState({
            setSelectedCompanyId,
            setManagerEmail,
            setExpirationDays,
            setError,
          });

          toast.success(data.message, {
            description: data.emailSent
              ? `Email en cola para ${invitedEmail}`
              : "Comparte el enlace manualmente con el gerente",
            duration: 12_000,
            action: {
              label: "Copiar enlace",
              onClick: () => {
                void navigator.clipboard.writeText(data.invitationUrl);
                toast.message("Enlace copiado al portapapeles");
              },
            },
          });

          onSuccess?.();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" className="bg-blue-600 hover:bg-blue-700">
          <Mail className="w-4 h-4 mr-2" />
          Invitar Gerente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invitar Gerente a la Plataforma</DialogTitle>
          <DialogDescription>
            Crea una invitación para que un gerente se registre en la plataforma
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreateInvitation} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="company">Empresa *</Label>
            <NativeSelect
              id="company"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              disabled={createMutation.isPending}
            >
              <option value="">Selecciona una empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id.toString()}>
                  {company.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico del Gerente *</Label>
            <Input
              id="email"
              type="email"
              placeholder="gerente@empresa.com"
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
              disabled={createMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiration">Días de Expiración</Label>
            <Input
              id="expiration"
              type="number"
              min={1}
              max={365}
              value={expirationDays}
              onChange={(e) => setExpirationDays(parseInt(e.target.value, 10) || 30)}
              disabled={createMutation.isPending}
            />
            <p className="text-xs text-gray-500">
              La invitación expirará en {expirationDays} días
            </p>
          </div>

          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creando invitación...
              </>
            ) : (
              "Crear Invitación"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
