import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * AxisDesempeno — redirige directamente a /performance sin pantalla intermedia.
 * El eje "Desempeño" solo tiene un módulo, por lo que mostrar la pantalla
 * intermedia de AxisPage es un paso innecesario para el usuario.
 */
export default function AxisDesempeno() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Preservar companyId si viene en la URL o en localStorage
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get("companyId") || localStorage.getItem("managerCompanyId");
    const isManager = localStorage.getItem("managerToken") ? "true" : null;

    // Guardar el origen del eje para que Performance pueda volver correctamente
    localStorage.setItem("axisOrigin", "desempeno");

    const query = new URLSearchParams();
    if (companyId) query.set("companyId", companyId);
    if (isManager) query.set("isManager", isManager);

    const target = query.toString() ? `/performance?${query.toString()}` : "/performance";
    setLocation(target);
  }, [setLocation]);

  return null;
}
