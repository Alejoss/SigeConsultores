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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Copy, Loader2, Mail } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface CreateManagerInvitationProps {
  companies: Array<{ id: number; name: string }>;
  onSuccess?: () => void;
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
  const [invitationResult, setInvitationResult] = useState<{
    success: boolean;
    invitationUrl: string;
    emailSent: boolean;
    message: string;
  } | null>(null);
  /** Guardamos el correo antes de limpiar el formulario para el mensaje de éxito */
  const [invitedManagerEmail, setInvitedManagerEmail] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const createMutation = trpc.managerInvitations.create.useMutation({
    onSuccess: (data) => {
      setInvitationResult({
        success: data.success,
        invitationUrl: data.invitationUrl,
        emailSent: data.emailSent,
        message: data.message,
      });
      setError(null);
      // Reset form
      setSelectedCompanyId("");
      setManagerEmail("");
      setExpirationDays(30);
    },
    onError: (error: any) => {
      setError(error.message || "Error al crear la invitación");
      setInvitationResult(null);
    },
  });

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInvitationResult(null);

    if (!selectedCompanyId || !managerEmail) {
      setError("Por favor completa todos los campos requeridos");
      return;
    }

    const companyId = parseInt(selectedCompanyId);
    setInvitedManagerEmail(managerEmail.trim().toLowerCase());
    createMutation.mutate({
      companyId,
      managerEmail,
      expirationDays,
    });
  };

  const handleCopyLink = () => {
    if (invitationResult?.invitationUrl) {
      navigator.clipboard.writeText(invitationResult.invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setError(null);
    setInvitationResult(null);
    setInvitedManagerEmail("");
    setSelectedCompanyId("");
    setManagerEmail("");
    setExpirationDays(30);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="bg-blue-600 hover:bg-blue-700">
          <Mail className="w-4 h-4 mr-2" />
          Invitar Gerente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invitar Gerente a la Plataforma</DialogTitle>
          <DialogDescription>
            Crea una invitación para que un gerente se registre en la plataforma
          </DialogDescription>
        </DialogHeader>

        {!invitationResult ? (
          <form onSubmit={handleCreateInvitation} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Company Selection */}
            <div className="space-y-2">
              <Label htmlFor="company">Empresa *</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger id="company">
                  <SelectValue placeholder="Selecciona una empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id.toString()}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Manager Email */}
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

            {/* Expiration Days */}
            <div className="space-y-2">
              <Label htmlFor="expiration">Días de Expiración</Label>
              <Input
                id="expiration"
                type="number"
                min="1"
                max="365"
                value={expirationDays}
                onChange={(e) => setExpirationDays(parseInt(e.target.value))}
                disabled={createMutation.isPending}
              />
              <p className="text-xs text-gray-500">
                La invitación expirará en {expirationDays} días
              </p>
            </div>

            {/* Submit Button */}
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
        ) : (
          <div className="space-y-4">
            {/* Success Message */}
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{invitationResult.message}</span>
            </div>

            {/* Invitation Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detalles de la Invitación</CardTitle>
                <CardDescription>
                  Comparte este link con el gerente para que pueda aceptar la invitación
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Email Status */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-700">
                    {invitationResult.emailSent ? (
                      <>
                        <CheckCircle className="w-4 h-4 inline mr-2" />
                        Email enviado exitosamente a {invitedManagerEmail}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        El email no pudo ser enviado. Comparte el link manualmente.
                      </>
                    )}
                  </p>
                </div>

                {/* Invitation Link */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Link de Invitación</Label>
                  <div className="flex gap-2 min-w-0">
                    <Input
                      type="text"
                      value={invitationResult.invitationUrl}
                      readOnly
                      className="bg-gray-50 text-sm min-w-0 flex-1 font-mono break-all"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLink}
                      className="flex-shrink-0"
                    >
                      {copied ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Instructions */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                  <p className="font-medium mb-2">¿Cómo funciona?</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Comparte el link de invitación con el gerente</li>
                    <li>El gerente abre el link y acepta la invitación</li>
                    <li>El gerente crea su contraseña y accede a la plataforma</li>
                    <li>Podrá gestionar la empresa desde el panel de administración</li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* Close Button */}
            <Button
              type="button"
              onClick={handleClose}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
