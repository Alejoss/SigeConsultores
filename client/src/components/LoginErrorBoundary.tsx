import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * ErrorBoundary específico para el formulario de login.
 * Captura el crash "insertBefore on Node" causado por extensiones del navegador
 * (Chrome Password Manager, LastPass, Bitwarden) que inyectan nodos DOM
 * dentro del formulario, rompiendo el reconciler de React.
 *
 * En lugar de mostrar la pantalla de error genérica, muestra el mensaje
 * de error del login y recarga el componente limpiamente.
 */
export class LoginErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Solo capturar errores de insertBefore (causados por extensiones)
    if (error.message && error.message.includes("insertBefore")) {
      return { hasError: true, errorMessage: null };
    }
    // Re-lanzar otros errores
    throw error;
  }

  componentDidCatch(error: Error) {
    if (error.message && error.message.includes("insertBefore")) {
      // Recargar el componente después de un tick para limpiar el estado
      setTimeout(() => {
        this.setState({ hasError: false, errorMessage: null });
      }, 50);
    }
  }

  render() {
    if (this.state.hasError) {
      // Mostrar un spinner mientras se recarga
      return (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      );
    }
    return this.props.children;
  }
}
