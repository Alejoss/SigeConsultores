import { useEffect } from "react";

/**
 * ManagerConfirmation page
 * Receives a confirmation token and redirects to /login with manager-invitation=true
 * This page acts as a bridge to avoid email-client link rewriting issues
 */
export default function ManagerConfirmation() {
  useEffect(() => {
    // Redirect directly to unified login
    // This page acts as a bridge to avoid email-client link rewriting issues
    window.location.href = "/login";
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Redirigiendo...</h1>
        <p className="text-gray-600">Por favor espere mientras lo redirigimos al formulario de acceso.</p>
      </div>
    </div>
  );
}
