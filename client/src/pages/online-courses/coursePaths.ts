import { courseEntryUrl, DEFAULT_COURSE_HOSTS, isCourseHostname } from "@shared/onlineCourses";

export function isOnlineCourseHost(): boolean {
  if (typeof window === "undefined") return false;
  const extra = String(import.meta.env.VITE_COURSE_HOSTS || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  return isCourseHostname(window.location.hostname, [...DEFAULT_COURSE_HOSTS, ...extra]);
}

/** Prefix for course routes. Empty on the subdomain, `/cursos` inside ISGE 360. */
export function courseBase(): string {
  return isOnlineCourseHost() ? "" : "/cursos";
}

export function coursePath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${courseBase()}${suffix === "/" ? "" : suffix}` || "/";
}

/** Button target from the management site. Production goes to the subdomain. */
export function courseEntryHref(path: string): string {
  return courseEntryUrl(path, {
    publicUrl: import.meta.env.VITE_COURSE_PUBLIC_URL as string | undefined,
    hostname: typeof window === "undefined" ? "" : window.location.hostname,
  });
}
