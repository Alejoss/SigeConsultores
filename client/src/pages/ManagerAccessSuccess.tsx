import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Copy, AlertCircle } from "lucide-react";

export default function ManagerAccessSuccess() {
  const [, setLocation] = useLocation();
  const [linkCopied, setLinkCopied] = useState(false);
  const [loginLink, setLoginLink] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Extract login link from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link = params.get("link");
    
    if (link) {
      setLoginLink(link);
    }
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!loginLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Error</CardTitle>
            <CardDescription>No se pudo procesar tu solicitud</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No se encontró el link de acceso. Por favor intenta nuevamente.
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => setLocation("/")}
              className="w-full"
            >
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(loginLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">¡Bienvenido a la plataforma SIGE!</CardTitle>
          <CardDescription className="text-center">
            Tu cuenta ha sido creada exitosamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
            <p className="text-sm text-slate-700 leading-relaxed">
              Copia este link para próximos ingresos. Haz clic en el botón "Ingresar" para acceder a tu plataforma.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 space-y-3">
            <p className="font-medium text-blue-900 text-sm">Tu enlace de acceso permanente:</p>

            <div className="bg-white border border-blue-300 rounded p-3 break-all text-xs font-mono text-gray-700 max-h-24 overflow-y-auto">
              {loginLink}
            </div>

            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="w-full text-sm"
              size="sm"
            >
              <Copy className="h-4 w-4 mr-2" />
              {linkCopied ? "✓ Copiado" : "Copiar enlace"}
            </Button>
          </div>

          <Button
            onClick={() => setLocation("/login")}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Ingresar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
