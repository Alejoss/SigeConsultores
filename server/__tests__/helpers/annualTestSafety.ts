/** Only dedicated disposable test databases may host annual integration fixtures. */
export function isSafeAnnualIntegrationDatabase(rawUrl: string, ci = process.env.CI): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "mysql:" || url.hostname !== "127.0.0.1") return false;
    if (url.port === "3307" && url.pathname === "/isge_annual_test") return true;
    return ci === "true" && url.port === "3306" && url.pathname === "/sige_platform_test";
  } catch {
    return false;
  }
}

export function assertAnnualIntegrationDatabase(rawUrl = process.env.DATABASE_URL ?? "", ci = process.env.CI): void {
  if (!isSafeAnnualIntegrationDatabase(rawUrl, ci)) {
    throw new Error("Pruebas anuales: se requiere 127.0.0.1:3307/isge_annual_test o CI=true con 127.0.0.1:3306/sige_platform_test. Revisión y producción están prohibidas.");
  }
}
