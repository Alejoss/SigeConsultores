import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ResetProcessLeaderPIN() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    setLocation(token ? `/forgot-password-manager?token=${encodeURIComponent(token)}` : "/forgot-password-manager");
  }, [setLocation]);

  return null;
}
