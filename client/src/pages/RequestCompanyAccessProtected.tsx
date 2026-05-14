import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function RequestCompanyAccessProtected() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1]);
  const token = searchParams.get("token");

  const [formData, setFormData] = useState({
    companyName: "",
    rucOrCI: "",
    contactName: "",
    email: "",
    phone: "",
  });

  const [submitted, setSubmitted] = useState(false);

  // Validate token
  const validateTokenQuery = trpc.accessInvitations.validateToken.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  // Create access request
  const markAsUsedMutation = trpc.accessInvitations.markAsUsed.useMutation();
  const createRequestMutation = trpc.companyAccessRequests.create.useMutation({
    onSuccess: async (result: any) => {
      if (token && result.id) {
        try {
          await markAsUsedMutation.mutateAsync({
            token,
            accessRequestId: result.id,
          });
        } catch (error) {
          console.error("Error marking invitation as used:", error);
        }
      }
      setSubmitted(true);
    },
  });

  // Pre-fill form with invitation data
  useEffect(() => {
    if (validateTokenQuery.data?.valid) {
      setFormData((prev) => ({
        ...prev,
        companyName: validateTokenQuery.data.companyName || "",
        email: validateTokenQuery.data.contactEmail || "",
      }));
    }
  }, [validateTokenQuery.data]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      return;
    }

    createRequestMutation.mutate({
      companyName: formData.companyName,
      rucOrCI: formData.rucOrCI,
      contactName: formData.contactName,
      email: formData.email,
      phone: formData.phone,
    });
  };

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acceso Requerido</CardTitle>
            <CardDescription>Token de invitación no proporcionado</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Se requiere un token de invitación válido para solicitar acceso. Por favor, verifica el enlace que recibiste.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Validating token
  if (validateTokenQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Validando Invitación</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token
  if (validateTokenQuery.data && !validateTokenQuery.data.valid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitación Inválida</CardTitle>
            <CardDescription>No pudimos validar tu invitación</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {validateTokenQuery.data.message}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Successfully submitted
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Solicitud Enviada</CardTitle>
            <CardDescription>Tu solicitud ha sido recibida</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Tu solicitud de acceso ha sido enviada exitosamente. Recibirás una respuesta en los próximos días.
              </AlertDescription>
            </Alert>
            <p className="text-sm text-slate-600">
              Nos pondremos en contacto a través del email: <strong>{formData.email}</strong>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Form to submit request
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-md mx-auto pt-8">
        <Card>
          <CardHeader>
            <CardTitle>Solicitar Acceso a la Plataforma</CardTitle>
            <CardDescription>
              Completa el formulario para solicitar acceso a SIGE
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Company Name */}
              <div className="space-y-2">
                <Label htmlFor="companyName">Nombre de la Empresa *</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  placeholder="Ej: Mi Empresa S.A."
                  required
                  disabled={createRequestMutation.isPending}
                />
              </div>

              {/* RUC/CI */}
              <div className="space-y-2">
                <Label htmlFor="rucOrCI">RUC o Cédula *</Label>
                <Input
                  id="rucOrCI"
                  name="rucOrCI"
                  value={formData.rucOrCI}
                  onChange={handleChange}
                  placeholder="Ej: 1234567890"
                  required
                  disabled={createRequestMutation.isPending}
                />
              </div>

              {/* Contact Name */}
              <div className="space-y-2">
                <Label htmlFor="contactName">Nombre del Contacto *</Label>
                <Input
                  id="contactName"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleChange}
                  placeholder="Ej: Juan García"
                  required
                  disabled={createRequestMutation.isPending}
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Ej: juan@empresa.com"
                  required
                  disabled={createRequestMutation.isPending}
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="Ej: +34912345678"
                  disabled={createRequestMutation.isPending}
                />
              </div>

              {/* Error Alert */}
              {createRequestMutation.isError && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    Error al enviar la solicitud. Por favor, intenta nuevamente.
                  </AlertDescription>
                </Alert>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={createRequestMutation.isPending}
              >
                {createRequestMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Solicitud"
                )}
              </Button>

              <p className="text-xs text-slate-500 text-center">
                Los campos marcados con * son obligatorios
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
