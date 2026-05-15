import { useEffect } from "react";
import { useLocation } from "wouter";

/** Redirects old PIN URLs to the password-based routes. */
export function LegacyPasswordRouteRedirect({ targetPath }: { targetPath: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    setLocation(token ? `${targetPath}?token=${encodeURIComponent(token)}` : targetPath);
  }, [setLocation, targetPath]);

  return null;
}
