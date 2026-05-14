import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function RequestCompanyAccess() {
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({
    companyName: "",
    rucOrCI: "",
    contactName: "",
    email: "",
    phone: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const createRequestMutation = trpc.companyAccessRequests.create.useMutation({
    onSuccess: () => {
      toast.success("Solicitud enviada exitosamente. Pronto nos pondremos en contacto.");
      setFormData({
        companyName: "",
        rucOrCI: "",
        contactName: "",
        email: "",
        phone: "",
      });
      setTimeout(() => navigate("/"), 3000);
    },
    onError: (error) => {
      toast.error(error.message || "Error al enviar la solicitud");
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validación
    if (!formData.companyName.trim()) {
      toast.error("Por favor ingresa el nombre de la empresa");
      return;
    }
    if (!formData.rucOrCI.trim()) {
      toast.error("Por favor ingresa el RUC o Cédula de Identidad");
      return;
    }
    if (!formData.contactName.trim()) {
      toast.error("Por favor ingresa el nombre del contacto");
      return;
    }
    if (!formData.email.trim()) {
      toast.error("Por favor ingresa el email del contacto");
      return;
    }

    setIsLoading(true);
    createRequestMutation.mutate({
      companyName: formData.companyName,
      rucOrCI: formData.rucOrCI,
      contactName: formData.contactName,
      email: formData.email,
      phone: formData.phone,
    });
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <Card className="shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
            <CardTitle>Solicitar Acceso a SIGE</CardTitle>
            <CardDescription className="text-blue-100">
              Completa el formulario para solicitar acceso a la plataforma
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nombre de la Empresa */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de la Empresa *
                </label>
                <Input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  placeholder="Ej: Mi Empresa S.A."
                  className="w-full"
                />
              </div>

              {/* RUC o Cédula */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RUC o Cédula de Identidad *
                </label>
                <Input
                  type="text"
                  name="rucOrCI"
                  value={formData.rucOrCI}
                  onChange={handleChange}
                  placeholder="Ej: 0123456789"
                  className="w-full"
                />
              </div>

              {/* Nombre del Contacto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Contacto (Gerente General) *
                </label>
                <Input
                  type="text"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleChange}
                  placeholder="Ej: Juan Pérez"
                  className="w-full"
                />
              </div>

              {/* Email del Contacto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email del Contacto *
                </label>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Ej: juan@empresa.com"
                  className="w-full"
                />
              </div>

              {/* Teléfono */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono (Opcional)
                </label>
                <Input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="Ej: +593 99 123 4567"
                  className="w-full"
                />
              </div>

              {/* Botón de Envío */}
              <Button
                type="submit"
                disabled={isLoading || createRequestMutation.isPending}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                {isLoading || createRequestMutation.isPending ? "Enviando..." : "Enviar Solicitud"}
              </Button>

              {/* Nota de seguridad */}
              <p className="text-xs text-gray-500 text-center mt-4">
                Tu información será revisada por nuestro equipo. Recibirás un email de confirmación.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
