import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recovering: boolean;
}

/**
 * ErrorBoundary global de la aplicación.
 *
 * Maneja dos tipos de errores:
 * 1. "insertBefore on Node" — causado por extensiones del navegador (Chrome Password Manager,
 *    LastPass, Bitwarden, etc.) que inyectan nodos DOM dentro de componentes React, rompiendo
 *    el reconciler. Se recupera automáticamente sin mostrar pantalla de error.
 * 2. Cualquier otro error — muestra la pantalla de error genérica con botón de recarga.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, recovering: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Si es el error de extensiones del navegador, entrar en modo recuperación silenciosa
    if (error.message && error.message.includes("insertBefore")) {
      return { hasError: true, error, recovering: true };
    }
    return { hasError: true, error, recovering: false };
  }

  componentDidCatch(error: Error) {
    if (error.message && error.message.includes("insertBefore")) {
      // Recuperar automáticamente después de un tick — el DOM ya se estabilizó
      setTimeout(() => {
        this.setState({ hasError: false, error: null, recovering: false });
      }, 80);
    }
  }

  render() {
    if (this.state.hasError) {
      // Para errores de extensiones del navegador: mostrar spinner de recuperación
      if (this.state.recovering) {
        return (
          <div className="flex items-center justify-center min-h-screen p-8 bg-background">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="text-sm">Cargando...</p>
            </div>
          </div>
        );
      }

      // Para otros errores: pantalla de error genérica
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Se ha producido un error inesperado.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.message}
                {"\n\n"}
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
