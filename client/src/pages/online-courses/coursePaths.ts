import {
  courseEntryUrl,
  DEFAULT_COURSE_HOSTS,
  isCourseHostname,
  managementHomeUrl,
} from "@shared/onlineCourses";

export function isOnlineCourseHost(): boolean {
  if (typeof window === "undefined") return false;
  const extra = String(import.meta.env.VITE_COURSE_HOSTS || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  return isCourseHostname(window.location.hostname, [
    ...DEFAULT_COURSE_HOSTS,
    ...extra,
  ]);
}

/** Course pages live on the subdomain, so their links have no /cursos prefix. */
export function courseBase(): string {
  return "";
}

export function coursePath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${courseBase()}${suffix === "/" ? "" : suffix}` || "/";
}

/** Button on the management site. Hits this host first so the session cookie can be shared. */
export function courseEntryHref(path: string, companyId?: number): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined" && !isOnlineCourseHost()) {
    const params = new URLSearchParams({ to: suffix });
    if (companyId && Number.isInteger(companyId) && companyId > 0) {
      params.set("companyId", String(companyId));
    }
    return `/api/auth/session/continue?${params.toString()}`;
  }
  return courseEntryUrl(suffix, {
    publicUrl: import.meta.env.VITE_COURSE_PUBLIC_URL as string | undefined,
    hostname: typeof window === "undefined" ? "" : window.location.hostname,
  });
}

export function managementHomeHref(): string {
  return managementHomeUrl(
    typeof window === "undefined" ? "" : window.location.hostname
  );
}
