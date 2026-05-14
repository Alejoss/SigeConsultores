import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ProcessLeaderPINRecovery() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    navigate(token ? `/forgot-password-manager?token=${encodeURIComponent(token)}` : "/forgot-password-manager");
  }, [navigate]);

  return null;
}
