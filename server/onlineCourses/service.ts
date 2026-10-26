import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { parse as parseCookieHeader } from "cookie";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import {
  COURSE_COOKIE,
  COURSE_SESSION_HOURS,
  COURSE_TIME_ZONE,
  courseDateTimeLocalToDate,
  formatCourseScore,
  gradeAnswers,
  toPublicQuestions,
  validateLessonFile,
  type LessonContent,
  type LessonQuestion,
} from "@shared/onlineCourses";
import { getDb } from "../db";
import { findActiveAuthSessionByPlainToken } from "../authSessionRepository";
import {
  accounts,
  accountRoles,
  companies,
  courseCompanySettings,
  courseFieldCertificates,
  courseFields,
  courseLessons,
  courseModuleAccess,
  courseModuleCertificates,
  courseModuleVisits,
  courseModules,
  courseResults,
  courseSessions,
  courseWorkerOverrides,
  courseWorkers,
  roles,
} from "../../drizzle/schema";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type CourseActor =
  | { role: "platform_admin"; accountId: number; name: string }
  | { role: "company_admin"; accountId: number; companyId: number; name: string }
  | {
      role: "worker";
      workerId: number;
      companyId: number;
      name: string;
      cedula: string;
      jobTitle: string;
      workCenter: string;
    };

type CookieReq = {
  headers: {
    cookie?: string;
    "x-forwarded-proto"?: string | string[];
    "x-forwarded-for"?: string | string[];
  };
  socket?: { remoteAddress?: string };
};

type CookieRes = { setHeader(name: string, value: string): void };

const attempts = new Map<string, number[]>();

export function resetCourseLoginLimiter() {
  attempts.clear();
}

async function database(): Promise<Db> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  }
  return db;
}

function fail(code: ConstructorParameters<typeof TRPCError>[0]["code"], message: string): never {
  throw new TRPCError({ code, message });
}

function clientIp(req: CookieReq): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) {
    const hops = raw.split(",").map(hop => hop.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket?.remoteAddress || "local";
}

function limited(key: string): boolean {
  const recent = (attempts.get(key) || []).filter(time => Date.now() - time < 600_000);
  if (recent.length) attempts.set(key, recent);
  else attempts.delete(key);
  return recent.length >= 10;
}

function recordFailure(key: string) {
  const recent = (attempts.get(key) || []).filter(time => Date.now() - time < 600_000);
  recent.push(Date.now());
  attempts.set(key, recent);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashWorkerPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

function workerPasswordMatches(password: string, salt: string, hash: string): boolean {
  try {
    const actual = Buffer.from(hashWorkerPassword(password, salt), "hex");
    const expected = Buffer.from(hash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function readCookie(req: CookieReq, name: string): string {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return "";
    }
  }
  return "";
}

function isDuplicate(error: unknown): boolean {
  const current = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return current.code === "ER_DUP_ENTRY" || current.errno === 1062 || current.cause?.code === "ER_DUP_ENTRY" || current.cause?.errno === 1062;
}

function secureCookie(req: CookieReq): boolean {
  const proto = req.headers["x-forwarded-proto"];
  const value = Array.isArray(proto) ? proto[0] : proto;
  return process.env.COOKIE_SECURE === "1" || value === "https";
}

function writeSessionCookie(res: CookieRes, req: CookieReq, token: string, maxAge: number) {
  const secure = secureCookie(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COURSE_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
  );
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCourseWhen(value: Date | string | null | undefined): string | null {
  const date = asDate(value);
  if (!date) return null;
  return date.toLocaleString("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: process.env.TZ_LOCAL || "America/Guayaquil",
  });
}

function parseQuestions(raw: string): LessonQuestion[] {
  const parsed = JSON.parse(raw) as LessonQuestion[];
  if (!Array.isArray(parsed)) throw new Error("Preguntas inválidas.");
  return parsed;
}

function parseContent(raw: string): LessonContent {
  return JSON.parse(raw) as LessonContent;
}

function certCode(prefix: string, seed: string): string {
  return `${prefix}-${createHash("sha256").update(seed + randomBytes(4).toString("hex")).digest("hex").slice(0, 10).toUpperCase()}`;
}

function makeRegCode(name: string): string {
  const stem = (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) || "EMP").toUpperCase();
  return `${stem}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

async function lessonPassed(db: Db, workerId: number, lessonId: number): Promise<boolean> {
  const rows = await db
    .select({ passed: courseResults.passed })
    .from(courseResults)
    .where(and(eq(courseResults.workerId, workerId), eq(courseResults.lessonId, lessonId)))
    .limit(1);
  return Boolean(rows[0]?.passed);
}

async function modulePassed(db: Db, workerId: number, moduleId: number): Promise<boolean> {
  const lessons = await db.select({ id: courseLessons.id }).from(courseLessons).where(eq(courseLessons.moduleId, moduleId));
  if (!lessons.length) return false;
  for (const lesson of lessons) {
    if (!(await lessonPassed(db, workerId, lesson.id))) return false;
  }
  return true;
}

async function issueModuleCertificate(db: Db, workerId: number, moduleId: number) {
  if (!(await modulePassed(db, workerId, moduleId))) return;
  const existing = await db
    .select({ code: courseModuleCertificates.code })
    .from(courseModuleCertificates)
    .where(and(eq(courseModuleCertificates.workerId, workerId), eq(courseModuleCertificates.moduleId, moduleId)))
    .limit(1);
  if (existing.length) return;
  const moduleRow = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
  if (!moduleRow.length) return;
  try {
    await db.insert(courseModuleCertificates).values({
      workerId,
      moduleId,
      issuedAt: new Date(),
      code: certCode("MOD", `${workerId}:${moduleId}`),
    });
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    return;
  }
  await issueFieldCertificate(db, workerId, moduleRow[0].fieldId);
}

async function issueFieldCertificate(db: Db, workerId: number, fieldId: number) {
  const modules = await db.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.fieldId, fieldId));
  let required = 0;
  for (const moduleRow of modules) {
    const lessonCount = await db
      .select({ n: sql<number>`count(*)` })
      .from(courseLessons)
      .where(eq(courseLessons.moduleId, moduleRow.id));
    if (!Number(lessonCount[0]?.n || 0)) continue;
    required += 1;
    if (!(await modulePassed(db, workerId, moduleRow.id))) return;
  }
  if (!required) return;
  const existing = await db
    .select({ code: courseFieldCertificates.code })
    .from(courseFieldCertificates)
    .where(and(eq(courseFieldCertificates.workerId, workerId), eq(courseFieldCertificates.fieldId, fieldId)))
    .limit(1);
  if (existing.length) return;
  try {
    await db.insert(courseFieldCertificates).values({
      workerId,
      fieldId,
      issuedAt: new Date(),
      code: certCode("CERT", `${workerId}:${fieldId}`),
    });
  } catch (error) {
    if (!isDuplicate(error)) throw error;
  }
}

type ModuleGate = { state: "aprobado" | "disponible" | "cerrado" | "bloqueado"; reason: string; closesLabel: string | null };

async function moduleGate(db: Db, worker: Extract<CourseActor, { role: "worker" }>, moduleRow: { id: number; fieldId: number; sortOrder: number }): Promise<ModuleGate> {
  if (await modulePassed(db, worker.workerId, moduleRow.id)) return { state: "aprobado", reason: "", closesLabel: null };
  const previous = await db
    .select({ id: courseModules.id })
    .from(courseModules)
    .where(and(eq(courseModules.fieldId, moduleRow.fieldId), sql`${courseModules.sortOrder} < ${moduleRow.sortOrder}`))
    .orderBy(sql`${courseModules.sortOrder} desc`);
  for (const row of previous) {
    const lessonCount = await db
      .select({ n: sql<number>`count(*)` })
      .from(courseLessons)
      .where(eq(courseLessons.moduleId, row.id));
    if (!Number(lessonCount[0]?.n || 0)) continue;
    if (!(await modulePassed(db, worker.workerId, row.id))) {
      return { state: "bloqueado", reason: "Debes aprobar el módulo anterior de este campo para continuar.", closesLabel: null };
    }
    break;
  }
  const override = await db
    .select({ value: courseWorkerOverrides.value })
    .from(courseWorkerOverrides)
    .where(and(eq(courseWorkerOverrides.workerId, worker.workerId), eq(courseWorkerOverrides.moduleId, moduleRow.id)))
    .limit(1);
  if (override.length) {
    if (override[0].value === "cerrar") {
      return { state: "cerrado", reason: "El administrador cerró tu acceso a este módulo.", closesLabel: null };
    }
    return { state: "disponible", reason: "", closesLabel: null };
  }
  const access = await db
    .select()
    .from(courseModuleAccess)
    .where(and(eq(courseModuleAccess.companyId, worker.companyId), eq(courseModuleAccess.moduleId, moduleRow.id)))
    .limit(1);
  if (!access.length || !access[0].open) {
    return { state: "cerrado", reason: "El administrador cerró el acceso a este módulo.", closesLabel: null };
  }
  const opensAt = asDate(access[0].opensAt);
  const closesAt = asDate(access[0].closesAt);
  const now = Date.now();
  if (opensAt && now < opensAt.getTime()) {
    return { state: "cerrado", reason: `Este módulo se abre el ${formatCourseWhen(opensAt)}.`, closesLabel: null };
  }
  if (closesAt && now > closesAt.getTime()) {
    return { state: "cerrado", reason: `El plazo de este módulo terminó el ${formatCourseWhen(closesAt)}.`, closesLabel: null };
  }
  return { state: "disponible", reason: "", closesLabel: closesAt ? formatCourseWhen(closesAt) : null };
}

async function visibleField(db: Db, companyId: number, fieldId: number) {
  const rows = await db.select().from(courseFields).where(eq(courseFields.id, fieldId)).limit(1);
  const field = rows[0];
  if (!field) return null;
  if (field.companyId !== null && field.companyId !== companyId) return null;
  return field;
}

async function openSession(db: Db, req: CookieReq, res: CookieRes, input: { role: CourseActor["role"]; accountId?: number | null; workerId?: number | null; companyId?: number | null }) {
  const token = randomBytes(24).toString("hex");
  await db.delete(courseSessions).where(sql`${courseSessions.expiresAt} < NOW()`);
  if (input.workerId) await db.delete(courseSessions).where(eq(courseSessions.workerId, input.workerId));
  if (input.accountId) await db.delete(courseSessions).where(eq(courseSessions.accountId, input.accountId));
  await db.insert(courseSessions).values({
    tokenHash: hashToken(token),
    role: input.role,
    accountId: input.accountId ?? null,
    workerId: input.workerId ?? null,
    companyId: input.companyId ?? null,
    expiresAt: new Date(Date.now() + COURSE_SESSION_HOURS * 60 * 60 * 1000),
  });
  writeSessionCookie(res, req, token, COURSE_SESSION_HOURS * 60 * 60);
}

export async function readCourseActor(req: CookieReq): Promise<CourseActor | null> {
  const fromCourse = await readCourseSessionActor(req);
  if (fromCourse) return fromCourse;
  return readPlatformSessionActor(req);
}

async function readCourseSessionActor(req: CookieReq): Promise<CourseActor | null> {
  const token = readCookie(req, COURSE_COOKIE);
  if (!token) return null;
  const db = await database();
  const sessions = await db
    .select()
    .from(courseSessions)
    .where(and(eq(courseSessions.tokenHash, hashToken(token)), sql`${courseSessions.expiresAt} > NOW()`))
    .limit(1);
  const session = sessions[0];
  if (!session) return null;
  if (session.role === "worker" && session.workerId) {
    const workers = await db.select().from(courseWorkers).where(eq(courseWorkers.id, session.workerId)).limit(1);
    const worker = workers[0];
    if (!worker) return null;
    return {
      role: "worker",
      workerId: worker.id,
      companyId: worker.companyId,
      name: worker.name,
      cedula: worker.cedula,
      jobTitle: worker.jobTitle,
      workCenter: worker.workCenter,
    };
  }
  if (!session.accountId) return null;
  const accountRows = await db.select().from(accounts).where(eq(accounts.id, session.accountId)).limit(1);
  const account = accountRows[0];
  if (!account || account.status !== "active") return null;
  if (session.role === "platform_admin") {
    return { role: "platform_admin", accountId: account.id, name: account.name || account.email || "Administrador" };
  }
  if (session.role === "company_admin" && session.companyId) {
    return {
      role: "company_admin",
      accountId: account.id,
      companyId: session.companyId,
      name: account.name || account.email || "Administrador de empresa",
    };
  }
  return null;
}

async function readPlatformSessionActor(req: CookieReq): Promise<CourseActor | null> {
  const token = parseCookieHeader(req.headers.cookie || "")[COOKIE_NAME];
  if (typeof token !== "string" || !token) return null;
  const row = await findActiveAuthSessionByPlainToken(token);
  if (!row?.accountId) return null;
  const db = await database();
  const accountRows = await db.select().from(accounts).where(eq(accounts.id, row.accountId)).limit(1);
  const account = accountRows[0];
  if (!account || account.status !== "active") return null;
  const assigned = await staffRoles(db, account.id);
  const name = account.name || account.email || "Administrador";
  if (assigned.some(role => role.slug === "platform_admin")) {
    return { role: "platform_admin", accountId: account.id, name };
  }
  const managed = assigned.find(role => role.slug === "company_manager" && role.companyId > 0);
  if (!managed) return null;
  return { role: "company_admin", accountId: account.id, companyId: managed.companyId, name };
}

async function staffRoles(db: Db, accountId: number) {
  return db
    .select({ slug: roles.slug, companyId: accountRoles.companyId })
    .from(accountRoles)
    .innerJoin(roles, eq(roles.id, accountRoles.roleId))
    .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.status, "active")));
}

export async function loginCourse(req: CookieReq, res: CookieRes, input: { identificacion: string; password: string; codigo?: string }) {
  const db = await database();
  const identificacion = input.identificacion.trim();
  const key = `${clientIp(req)}|${identificacion.toLowerCase()}`;
  if (limited(key)) fail("TOO_MANY_REQUESTS", "Demasiados intentos. Espera unos minutos.");
  if (identificacion.includes("@")) {
    const email = identificacion.toLowerCase();
    const candidates = await db
      .select()
      .from(accounts)
      .where(and(sql`LOWER(${accounts.email}) = ${email}`, eq(accounts.status, "active")));
    const matches = [];
    for (const candidate of candidates) {
      if (candidate.passwordHash && (await bcrypt.compare(input.password, candidate.passwordHash))) matches.push(candidate);
    }
    if (matches.length !== 1) {
      recordFailure(key);
      fail("UNAUTHORIZED", "Correo o clave incorrecta.");
    }
    const account = matches[0];
    const assigned = await staffRoles(db, account.id);
    if (assigned.some(role => role.slug === "platform_admin")) {
      await openSession(db, req, res, { role: "platform_admin", accountId: account.id });
      return { role: "platform_admin" as const };
    }
    const managed = assigned.filter(role => role.slug === "company_manager" && role.companyId > 0);
    let companyId = managed.length === 1 ? managed[0].companyId : 0;
    if (managed.length > 1) {
      const code = (input.codigo || "").trim();
      if (!code) fail("UNAUTHORIZED", "Esa cuenta administra varias empresas. Ingresa también el código de la empresa.");
      const settings = await db.select().from(courseCompanySettings).where(eq(courseCompanySettings.regCode, code)).limit(1);
      const match = settings[0];
      if (!match || !managed.some(role => role.companyId === match.companyId)) {
        recordFailure(key);
        fail("UNAUTHORIZED", "Correo, clave o código de empresa incorrectos.");
      }
      companyId = match.companyId;
    }
    if (!companyId) fail("FORBIDDEN", "Tu cuenta no administra capacitaciones.");
    await openSession(db, req, res, { role: "company_admin", accountId: account.id, companyId });
    return { role: "company_admin" as const };
  }

  const cedula = identificacion;
  const workers = await db.select().from(courseWorkers).where(sql`LOWER(${courseWorkers.cedula}) = ${cedula.toLowerCase()}`);
  let worker = workers.length === 1 ? workers[0] : undefined;
  if (!worker && input.codigo) {
    const settings = await db.select().from(courseCompanySettings).where(eq(courseCompanySettings.regCode, input.codigo.trim())).limit(1);
    worker = settings[0] ? workers.find(row => row.companyId === settings[0].companyId) : undefined;
  }
  if (!worker) {
    recordFailure(key);
    fail("UNAUTHORIZED", workers.length > 1 ? "Esa cédula existe en varias empresas; ingresa también el código de tu empresa." : "Cédula o clave incorrecta.");
  }
  if (!workerPasswordMatches(input.password, worker.passwordSalt, worker.passwordHash)) {
    recordFailure(key);
    fail("UNAUTHORIZED", "Cédula o clave incorrecta.");
  }
  await openSession(db, req, res, { role: "worker", workerId: worker.id, companyId: worker.companyId });
  return { role: "worker" as const };
}

export async function registerWorker(
  req: CookieReq,
  res: CookieRes,
  input: { cedula: string; nombre: string; password: string; codigo: string; cargo?: string; centro?: string }
) {
  const cedula = input.cedula.trim();
  const nombre = input.nombre.trim();
  const codigo = input.codigo.trim();
  if (cedula.length < 5 || nombre.length < 3 || input.password.length < 6) {
    fail("BAD_REQUEST", "Revisa los datos: cédula, nombre completo y una clave de al menos 6 caracteres.");
  }
  if (!codigo) fail("BAD_REQUEST", "Ingresa el código de tu empresa (te lo entrega Desarrollo Humano).");
  const db = await database();
  const settings = await db.select().from(courseCompanySettings).where(eq(courseCompanySettings.regCode, codigo)).limit(1);
  if (!settings.length) fail("FORBIDDEN", "El código de empresa no es válido.");
  const companyId = settings[0].companyId;
  const existing = await db
    .select({ id: courseWorkers.id })
    .from(courseWorkers)
    .where(and(eq(courseWorkers.companyId, companyId), sql`LOWER(${courseWorkers.cedula}) = ${cedula.toLowerCase()}`))
    .limit(1);
  if (existing.length) fail("CONFLICT", "Ya existe una cuenta con esa cédula en tu empresa. Inicia sesión.");
  const salt = randomBytes(8).toString("hex");
  let workerId = 0;
  try {
    const inserted = await db.insert(courseWorkers).values({
      companyId,
      cedula,
      name: nombre.slice(0, 100),
      jobTitle: (input.cargo || "").trim().slice(0, 80),
      workCenter: (input.centro || "").trim().slice(0, 80) || "No aplica",
      passwordSalt: salt,
      passwordHash: hashWorkerPassword(input.password, salt),
    });
    workerId = Number(inserted[0].insertId);
  } catch (error) {
    if (isDuplicate(error)) fail("CONFLICT", "Ya existe una cuenta con esa cédula en tu empresa. Inicia sesión.");
    throw error;
  }
  await openSession(db, req, res, { role: "worker", workerId, companyId });
  return { ok: true };
}

export async function logoutCourse(req: CookieReq, res: CookieRes) {
  const token = readCookie(req, COURSE_COOKIE);
  if (token) {
    const db = await database();
    await db.delete(courseSessions).where(eq(courseSessions.tokenHash, hashToken(token)));
  }
  writeSessionCookie(res, req, "", 0);
  return { ok: true };
}

export async function changeWorkerPassword(actor: CourseActor, input: { actual: string; nueva: string }) {
  if (actor.role !== "worker") fail("FORBIDDEN", "La clave de personal se cambia en ISGE 360.");
  const key = `pw|${actor.workerId}`;
  if (limited(key)) fail("TOO_MANY_REQUESTS", "Demasiados intentos.");
  const db = await database();
  const rows = await db.select().from(courseWorkers).where(eq(courseWorkers.id, actor.workerId)).limit(1);
  const worker = rows[0];
  if (!worker || !workerPasswordMatches(input.actual, worker.passwordSalt, worker.passwordHash)) {
    recordFailure(key);
    fail("UNAUTHORIZED", "La clave actual no es correcta.");
  }
  if (input.nueva.length < 6) fail("BAD_REQUEST", "La nueva clave debe tener al menos 6 caracteres.");
  const salt = randomBytes(8).toString("hex");
  await db
    .update(courseWorkers)
    .set({ passwordSalt: salt, passwordHash: hashWorkerPassword(input.nueva, salt) })
    .where(eq(courseWorkers.id, worker.id));
  return { ok: true };
}

async function lessonCounts(db: Db) {
  const rows = await db
    .select({ moduleId: courseLessons.moduleId, n: sql<number>`count(*)` })
    .from(courseLessons)
    .groupBy(courseLessons.moduleId);
  const map = new Map<number, number>();
  for (const row of rows) map.set(row.moduleId, Number(row.n));
  return map;
}

type StaffActor = Exclude<CourseActor, { role: "worker" }>;

/** Company the staff member previews: the manager's own, none for the general admin. */
function previewCompanyId(actor: StaffActor): number {
  return actor.role === "company_admin" ? actor.companyId : 0;
}

/**
 * Lets the general admin open the company panel for one company. Without companyId, or for any
 * other role, the actor is returned unchanged.
 */
export async function actAsCompany(actor: CourseActor, companyId?: number): Promise<CourseActor> {
  if (actor.role !== "platform_admin" || !companyId) return actor;
  const db = await database();
  const name = await companyName(db, companyId);
  if (!name) fail("BAD_REQUEST", "Empresa no encontrada.");
  return { role: "company_admin", accountId: actor.accountId, companyId, name: actor.name };
}

/** Staff review: every visible module with lessons, all open, no progress. */
async function staffTree(actor: StaffActor) {
  const db = await database();
  const companyId = previewCompanyId(actor);
  const fields = await db
    .select()
    .from(courseFields)
    .where(companyId ? or(isNull(courseFields.companyId), eq(courseFields.companyId, companyId)) : isNull(courseFields.companyId))
    .orderBy(asc(courseFields.sortOrder), asc(courseFields.name));
  const counts = await lessonCounts(db);
  const out = [];
  for (const field of fields) {
    const modules = await db.select().from(courseModules).where(eq(courseModules.fieldId, field.id)).orderBy(asc(courseModules.sortOrder));
    const list = modules
      .filter(moduleRow => (counts.get(moduleRow.id) || 0) > 0)
      .map(moduleRow => ({
        id: moduleRow.id,
        name: moduleRow.name,
        lessonCount: counts.get(moduleRow.id) || 0,
        state: "disponible" as ModuleGate["state"],
        reason: "",
        closesLabel: null as string | null,
        done: 0,
        certificate: false,
      }));
    if (!list.length) continue;
    out.push({ id: field.id, name: field.name, modules: list, certificate: false, approved: 0 });
  }
  return { user: { name: actor.name, cedula: "" }, fields: out };
}

export async function workerTree(actor: CourseActor) {
  if (actor.role !== "worker") return staffTree(actor);
  const db = await database();
  const fields = await db
    .select()
    .from(courseFields)
    .where(or(isNull(courseFields.companyId), eq(courseFields.companyId, actor.companyId)))
    .orderBy(asc(courseFields.sortOrder), asc(courseFields.name));
  const counts = await lessonCounts(db);
  const out = [];
  for (const field of fields) {
    const modules = await db.select().from(courseModules).where(eq(courseModules.fieldId, field.id)).orderBy(asc(courseModules.sortOrder));
    const list = [];
    for (const moduleRow of modules) {
      const n = counts.get(moduleRow.id) || 0;
      if (!n) continue;
      const gate = await moduleGate(db, actor, moduleRow);
      const doneRows = await db
        .select({ n: sql<number>`count(*)` })
        .from(courseResults)
        .innerJoin(courseLessons, eq(courseLessons.id, courseResults.lessonId))
        .where(and(eq(courseLessons.moduleId, moduleRow.id), eq(courseResults.workerId, actor.workerId), eq(courseResults.passed, true)));
      const certificate = await db
        .select({ code: courseModuleCertificates.code })
        .from(courseModuleCertificates)
        .where(and(eq(courseModuleCertificates.workerId, actor.workerId), eq(courseModuleCertificates.moduleId, moduleRow.id)))
        .limit(1);
      list.push({
        id: moduleRow.id,
        name: moduleRow.name,
        lessonCount: n,
        state: gate.state,
        reason: gate.reason,
        closesLabel: gate.closesLabel,
        done: Number(doneRows[0]?.n || 0),
        certificate: certificate.length > 0,
      });
    }
    if (!list.length) continue;
    const fieldCertificate = await db
      .select({ code: courseFieldCertificates.code })
      .from(courseFieldCertificates)
      .where(and(eq(courseFieldCertificates.workerId, actor.workerId), eq(courseFieldCertificates.fieldId, field.id)))
      .limit(1);
    out.push({
      id: field.id,
      name: field.name,
      modules: list,
      certificate: fieldCertificate.length > 0,
      approved: list.filter(item => item.state === "aprobado").length,
    });
  }
  return { user: { name: actor.name, cedula: actor.cedula }, fields: out };
}

export async function searchLessons(actor: CourseActor, query: string) {
  const scope = actor.role === "platform_admin" ? isNull(courseFields.companyId) : or(isNull(courseFields.companyId), eq(courseFields.companyId, actor.companyId));
  const text = query.trim();
  if (text.length < 2) return { results: [] as { lessonId: number; title: string; moduleId: number; moduleName: string; fieldName: string }[] };
  const db = await database();
  const needle = `%${text.replace(/[\\%_]/g, character => `\\${character}`)}%`;
  const rows = await db
    .select({
      lessonId: courseLessons.id,
      title: courseLessons.title,
      moduleId: courseModules.id,
      moduleName: courseModules.name,
      fieldName: courseFields.name,
    })
    .from(courseLessons)
    .innerJoin(courseModules, eq(courseModules.id, courseLessons.moduleId))
    .innerJoin(courseFields, eq(courseFields.id, courseModules.fieldId))
    .where(and(sql`${courseLessons.title} LIKE ${needle}`, scope))
    .orderBy(asc(courseFields.sortOrder), asc(courseModules.sortOrder), asc(courseLessons.sortOrder))
    .limit(12);
  return { results: rows };
}

/** Staff review of a module: every lesson open, nothing recorded. */
async function staffModule(actor: StaffActor, moduleId: number) {
  const db = await database();
  const modules = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
  const moduleRow = modules[0];
  if (!moduleRow) fail("NOT_FOUND", "Módulo no encontrado.");
  const field = await visibleField(db, previewCompanyId(actor), moduleRow.fieldId);
  if (!field) fail("FORBIDDEN", "Este módulo es privado de otra empresa.");
  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.moduleId, moduleId)).orderBy(asc(courseLessons.sortOrder), asc(courseLessons.id));
  return {
    module: { id: moduleRow.id, name: moduleRow.name, field: field.name, fieldId: field.id },
    lessons: lessons.map(lesson => ({
      id: lesson.id,
      number: lesson.number,
      title: lesson.title,
      ...parseContent(lesson.contentJson),
      questions: toPublicQuestions(parseQuestions(lesson.questionsJson)),
      result: null,
    })),
    moduleCertificate: null,
  };
}

export async function workerModule(actor: CourseActor, moduleId: number) {
  if (actor.role !== "worker") return staffModule(actor, moduleId);
  const db = await database();
  const modules = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
  const moduleRow = modules[0];
  if (!moduleRow) fail("NOT_FOUND", "Módulo no encontrado.");
  const field = await visibleField(db, actor.companyId, moduleRow.fieldId);
  if (!field) fail("FORBIDDEN", "No tienes acceso a este módulo.");
  const gate = await moduleGate(db, actor, moduleRow);
  if (gate.state !== "disponible" && gate.state !== "aprobado") fail("FORBIDDEN", gate.reason || "Módulo no disponible.");
  await db
    .insert(courseModuleVisits)
    .values({ workerId: actor.workerId, moduleId, firstAccessAt: new Date(), lastAccessAt: new Date() })
    .onDuplicateKeyUpdate({ set: { lastAccessAt: new Date() } });
  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.moduleId, moduleId)).orderBy(asc(courseLessons.sortOrder), asc(courseLessons.id));
  const payload = [];
  for (const lesson of lessons) {
    const result = await db
      .select({
        correctCount: courseResults.correctCount,
        questionCount: courseResults.questionCount,
        scoreTenths: courseResults.scoreTenths,
        passed: courseResults.passed,
        code: courseResults.code,
      })
      .from(courseResults)
      .where(and(eq(courseResults.workerId, actor.workerId), eq(courseResults.lessonId, lesson.id)))
      .limit(1);
    payload.push({
      id: lesson.id,
      number: lesson.number,
      title: lesson.title,
      ...parseContent(lesson.contentJson),
      questions: toPublicQuestions(parseQuestions(lesson.questionsJson)),
      result: result[0] ? { ...result[0], passed: Boolean(result[0].passed) } : null,
    });
  }
  const certificate = await db
    .select({ code: courseModuleCertificates.code })
    .from(courseModuleCertificates)
    .where(and(eq(courseModuleCertificates.workerId, actor.workerId), eq(courseModuleCertificates.moduleId, moduleId)))
    .limit(1);
  return {
    module: { id: moduleRow.id, name: moduleRow.name, field: field.name, fieldId: field.id },
    lessons: payload,
    moduleCertificate: certificate[0]?.code || null,
  };
}

export async function evaluateLesson(actor: CourseActor, input: { lessonId: number; answers: string[] }) {
  if (actor.role !== "worker") return previewEvaluation(actor, input);
  const db = await database();
  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.id, input.lessonId)).limit(1);
  const lesson = lessons[0];
  if (!lesson) fail("BAD_REQUEST", "Capacitación no válida.");
  const modules = await db.select().from(courseModules).where(eq(courseModules.id, lesson.moduleId)).limit(1);
  const moduleRow = modules[0];
  if (!moduleRow) fail("BAD_REQUEST", "Capacitación no válida.");
  const field = await visibleField(db, actor.companyId, moduleRow.fieldId);
  if (!field) fail("FORBIDDEN", "No tienes acceso a esta capacitación.");
  const gate = await moduleGate(db, actor, moduleRow);
  if (gate.state !== "disponible" && gate.state !== "aprobado") fail("FORBIDDEN", gate.reason || "Módulo no disponible.");
  const ordered = await db
    .select({ id: courseLessons.id })
    .from(courseLessons)
    .where(eq(courseLessons.moduleId, lesson.moduleId))
    .orderBy(asc(courseLessons.sortOrder), asc(courseLessons.id));
  const index = ordered.findIndex(row => row.id === lesson.id);
  if (index > 0 && !(await lessonPassed(db, actor.workerId, ordered[index - 1].id))) {
    fail("FORBIDDEN", "Aprueba primero la capacitación anterior.");
  }
  const questions = parseQuestions(lesson.questionsJson);
  let graded;
  try {
    graded = gradeAnswers(questions, input.answers);
  } catch (error) {
    fail("BAD_REQUEST", error instanceof Error ? error.message : "Solicitud no válida.");
  }
  const previous = await db
    .select()
    .from(courseResults)
    .where(and(eq(courseResults.workerId, actor.workerId), eq(courseResults.lessonId, lesson.id)))
    .limit(1);
  const detail = questions.map(question => ({ correct: question.correct }));
  if (previous[0]?.passed) {
    return {
      scoreTenths: previous[0].scoreTenths,
      passed: true,
      correct: graded.correct,
      total: graded.total,
      alreadyPassed: true,
      preview: false,
      detail,
    };
  }
  const attempts = (previous[0]?.attempts || 0) + 1;
  const code = graded.passed ? certCode("CAP", `${actor.workerId}:${lesson.id}`) : null;
  await db
    .insert(courseResults)
    .values({
      workerId: actor.workerId,
      lessonId: lesson.id,
      correctCount: graded.correct,
      questionCount: graded.total,
      scoreTenths: graded.scoreTenths,
      passed: graded.passed,
      attempts,
      takenAt: new Date(),
      code,
    })
    .onDuplicateKeyUpdate({
      set: {
        correctCount: graded.correct,
        questionCount: graded.total,
        scoreTenths: graded.scoreTenths,
        passed: graded.passed,
        attempts,
        takenAt: new Date(),
        code: sql`COALESCE(${courseResults.code}, ${code})`,
      },
    });
  if (graded.passed) await issueModuleCertificate(db, actor.workerId, lesson.moduleId);
  return { scoreTenths: graded.scoreTenths, passed: graded.passed, correct: graded.correct, total: graded.total, alreadyPassed: false, preview: false, detail };
}

/** Grades a staff review attempt without saving results or issuing certificates. */
async function previewEvaluation(actor: StaffActor, input: { lessonId: number; answers: string[] }) {
  const db = await database();
  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.id, input.lessonId)).limit(1);
  const lesson = lessons[0];
  if (!lesson) fail("BAD_REQUEST", "Capacitación no válida.");
  const modules = await db.select({ fieldId: courseModules.fieldId }).from(courseModules).where(eq(courseModules.id, lesson.moduleId)).limit(1);
  if (!modules[0] || !(await visibleField(db, previewCompanyId(actor), modules[0].fieldId))) {
    fail("FORBIDDEN", "No tienes acceso a esta capacitación.");
  }
  const questions = parseQuestions(lesson.questionsJson);
  let graded;
  try {
    graded = gradeAnswers(questions, input.answers);
  } catch (error) {
    fail("BAD_REQUEST", error instanceof Error ? error.message : "Solicitud no válida.");
  }
  return {
    scoreTenths: graded.scoreTenths,
    passed: graded.passed,
    correct: graded.correct,
    total: graded.total,
    alreadyPassed: false,
    preview: true,
    detail: questions.map(question => ({ correct: question.correct })),
  };
}

async function companyName(db: Db, companyId: number) {
  const rows = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return rows[0]?.name || "";
}

export async function certificateView(actor: CourseActor, kind: "capacitacion" | "modulo" | "campo", id: number) {
  if (actor.role !== "worker") fail("FORBIDDEN", "Certificado no disponible.");
  const db = await database();
  const company = await companyName(db, actor.companyId);
  if (kind === "capacitacion") {
    const results = await db
      .select()
      .from(courseResults)
      .where(and(eq(courseResults.workerId, actor.workerId), eq(courseResults.lessonId, id), eq(courseResults.passed, true)))
      .limit(1);
    const result = results[0];
    if (!result?.code) fail("FORBIDDEN", "Certificado no disponible.");
    const lesson = await db
      .select({ title: courseLessons.title, moduleName: courseModules.name, fieldName: courseFields.name })
      .from(courseLessons)
      .innerJoin(courseModules, eq(courseModules.id, courseLessons.moduleId))
      .innerJoin(courseFields, eq(courseFields.id, courseModules.fieldId))
      .where(eq(courseLessons.id, id))
      .limit(1);
    return {
      kind,
      workerName: actor.name,
      cedula: actor.cedula,
      companyName: company,
      title: lesson[0]?.title || "Capacitación",
      subtitle: `${lesson[0]?.moduleName || ""} · ${lesson[0]?.fieldName || ""}`,
      lines: [] as { label: string; detail: string }[],
      hours: 1,
      scoreLabel: formatCourseScore(result.scoreTenths),
      issuedOn: formatCourseWhen(result.takenAt),
      code: result.code,
    };
  }
  if (kind === "modulo") {
    const certs = await db
      .select()
      .from(courseModuleCertificates)
      .where(and(eq(courseModuleCertificates.workerId, actor.workerId), eq(courseModuleCertificates.moduleId, id)))
      .limit(1);
    if (!certs.length) fail("FORBIDDEN", "Certificado no disponible.");
    const moduleRow = await db
      .select({ name: courseModules.name, fieldName: courseFields.name })
      .from(courseModules)
      .innerJoin(courseFields, eq(courseFields.id, courseModules.fieldId))
      .where(eq(courseModules.id, id))
      .limit(1);
    const lessons = await db
      .select({ number: courseLessons.number, title: courseLessons.title, scoreTenths: courseResults.scoreTenths })
      .from(courseLessons)
      .innerJoin(courseResults, and(eq(courseResults.lessonId, courseLessons.id), eq(courseResults.workerId, actor.workerId)))
      .where(eq(courseLessons.moduleId, id))
      .orderBy(asc(courseLessons.sortOrder));
    const average = lessons.length ? Math.round(lessons.reduce((sum, lesson) => sum + lesson.scoreTenths, 0) / lessons.length) : 0;
    return {
      kind,
      workerName: actor.name,
      cedula: actor.cedula,
      companyName: company,
      title: moduleRow[0]?.name || "Módulo",
      subtitle: moduleRow[0]?.fieldName || "",
      lines: lessons.map(lesson => ({ label: `${lesson.number}. ${lesson.title}`, detail: formatCourseScore(lesson.scoreTenths) })),
      hours: lessons.length,
      scoreLabel: formatCourseScore(average),
      issuedOn: formatCourseWhen(certs[0].issuedAt),
      code: certs[0].code,
    };
  }
  const certs = await db
    .select()
    .from(courseFieldCertificates)
    .where(and(eq(courseFieldCertificates.workerId, actor.workerId), eq(courseFieldCertificates.fieldId, id)))
    .limit(1);
  if (!certs.length) fail("FORBIDDEN", "Certificado no disponible todavía.");
  const field = await db.select({ name: courseFields.name }).from(courseFields).where(eq(courseFields.id, id)).limit(1);
  const modules = await db.select().from(courseModules).where(eq(courseModules.fieldId, id)).orderBy(asc(courseModules.sortOrder));
  const lines = [];
  let hours = 0;
  const scores: number[] = [];
  for (const moduleRow of modules) {
    const lessons = await db
      .select({ number: courseLessons.number, title: courseLessons.title, scoreTenths: courseResults.scoreTenths })
      .from(courseLessons)
      .innerJoin(courseResults, and(eq(courseResults.lessonId, courseLessons.id), eq(courseResults.workerId, actor.workerId)))
      .where(eq(courseLessons.moduleId, moduleRow.id))
      .orderBy(asc(courseLessons.sortOrder));
    hours += lessons.length;
    if (lessons.length) scores.push(lessons.reduce((sum, lesson) => sum + lesson.scoreTenths, 0) / lessons.length);
    for (const lesson of lessons) lines.push({ label: `${moduleRow.name} · ${lesson.number}. ${lesson.title}`, detail: "1 hora" });
  }
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  return {
    kind,
    workerName: actor.name,
    cedula: actor.cedula,
    companyName: company,
    title: field[0]?.name || "Campo",
    subtitle: "",
    lines,
    hours,
    scoreLabel: formatCourseScore(average),
    issuedOn: formatCourseWhen(certs[0].issuedAt),
    code: certs[0].code,
  };
}

async function editableField(db: Db, actor: CourseActor, fieldId: number) {
  const rows = await db.select().from(courseFields).where(eq(courseFields.id, fieldId)).limit(1);
  const field = rows[0];
  if (!field) return null;
  if (actor.role === "platform_admin") return field.companyId === null ? field : null;
  if (actor.role === "company_admin") return field.companyId === actor.companyId ? field : null;
  return null;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  return courseDateTimeLocalToDate(value, process.env.TZ_LOCAL || COURSE_TIME_ZONE);
}

export async function companyOverview(actor: CourseActor) {
  if (actor.role !== "company_admin") fail("FORBIDDEN", "Solo el administrador de la empresa.");
  const db = await database();
  const company = await companyName(db, actor.companyId);
  const settings = await db.select().from(courseCompanySettings).where(eq(courseCompanySettings.companyId, actor.companyId)).limit(1);
  const fields = await db
    .select()
    .from(courseFields)
    .where(or(isNull(courseFields.companyId), eq(courseFields.companyId, actor.companyId)))
    .orderBy(asc(courseFields.sortOrder), asc(courseFields.name));
  const counts = await lessonCounts(db);
  const accessRows = await db.select().from(courseModuleAccess).where(eq(courseModuleAccess.companyId, actor.companyId));
  const accessByModule = new Map(accessRows.map(row => [row.moduleId, row]));
  const fieldViews = [];
  for (const field of fields) {
    const own = field.companyId === actor.companyId;
    const modules = await db.select().from(courseModules).where(eq(courseModules.fieldId, field.id)).orderBy(asc(courseModules.sortOrder));
    const visible = modules.filter(moduleRow => own || (counts.get(moduleRow.id) || 0) > 0);
    if (!visible.length && !own) continue;
    fieldViews.push({
      id: field.id,
      name: field.name,
      own,
      modules: visible.map(moduleRow => {
        const access = accessByModule.get(moduleRow.id);
        return {
          id: moduleRow.id,
          name: moduleRow.name,
          lessonCount: counts.get(moduleRow.id) || 0,
          open: Boolean(access?.open),
          opensAt: access?.opensAt ? asDate(access.opensAt)?.toISOString() || null : null,
          closesAt: access?.closesAt ? asDate(access.closesAt)?.toISOString() || null : null,
        };
      }),
    });
  }
  const workers = await db.select().from(courseWorkers).where(eq(courseWorkers.companyId, actor.companyId)).orderBy(asc(courseWorkers.name));
  const moduleIds = fieldViews.flatMap(field => field.modules.map(moduleRow => moduleRow.id));
  const workerViews = [];
  for (const worker of workers) {
    const mods: Record<number, { done: number; total: number; scoreTenths: number | null; status: string; override: string }> = {};
    let moduleCertificates = 0;
    for (const moduleId of moduleIds) {
      const doneRows = await db
        .select({ n: sql<number>`count(*)` })
        .from(courseResults)
        .innerJoin(courseLessons, eq(courseLessons.id, courseResults.lessonId))
        .where(and(eq(courseLessons.moduleId, moduleId), eq(courseResults.workerId, worker.id), eq(courseResults.passed, true)));
      const scoreRows = await db
        .select({ score: sql<number>`avg(${courseResults.scoreTenths})` })
        .from(courseResults)
        .innerJoin(courseLessons, eq(courseLessons.id, courseResults.lessonId))
        .where(and(eq(courseLessons.moduleId, moduleId), eq(courseResults.workerId, worker.id), eq(courseResults.passed, true)));
      const visit = await db
        .select({ workerId: courseModuleVisits.workerId })
        .from(courseModuleVisits)
        .where(and(eq(courseModuleVisits.workerId, worker.id), eq(courseModuleVisits.moduleId, moduleId)))
        .limit(1);
      const override = await db
        .select({ value: courseWorkerOverrides.value })
        .from(courseWorkerOverrides)
        .where(and(eq(courseWorkerOverrides.workerId, worker.id), eq(courseWorkerOverrides.moduleId, moduleId)))
        .limit(1);
      const cert = await db
        .select({ code: courseModuleCertificates.code })
        .from(courseModuleCertificates)
        .where(and(eq(courseModuleCertificates.workerId, worker.id), eq(courseModuleCertificates.moduleId, moduleId)))
        .limit(1);
      if (cert.length) moduleCertificates += 1;
      const done = Number(doneRows[0]?.n || 0);
      const total = fieldViews.flatMap(field => field.modules).find(moduleRow => moduleRow.id === moduleId)?.lessonCount || 0;
      mods[moduleId] = {
        done,
        total,
        scoreTenths: scoreRows[0]?.score == null ? null : Math.round(Number(scoreRows[0].score)),
        status: done === total && total > 0 ? "aprobado" : done || visit.length ? "en_curso" : "sin_iniciar",
        override: override[0]?.value || "auto",
      };
    }
    const fieldCert = await db
      .select({ code: courseFieldCertificates.code })
      .from(courseFieldCertificates)
      .where(eq(courseFieldCertificates.workerId, worker.id))
      .limit(1);
    workerViews.push({
      id: worker.id,
      name: worker.name,
      cedula: worker.cedula,
      jobTitle: worker.jobTitle,
      workCenter: worker.workCenter,
      modules: mods,
      moduleCertificates,
      fieldCertificate: fieldCert.length > 0,
    });
  }
  return { companyName: company, regCode: settings[0]?.regCode || "", workerCount: workers.length, fields: fieldViews, workers: workerViews };
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function exportCompanyCsv(actor: CourseActor) {
  const overview = await companyOverview(actor);
  const columns = overview.fields.flatMap(field => field.modules.map(moduleRow => ({ id: moduleRow.id, label: `${field.name} · ${moduleRow.name}` })));
  const statusLabel: Record<string, string> = { aprobado: "Aprobado", en_curso: "En curso", sin_iniciar: "Sin iniciar" };
  const head = ["Cédula", "Nombre", "Cargo", "Centro de trabajo", ...columns.flatMap(column => [`${column.label} estado`, `${column.label} nota`]), "Certificados de módulo", "Certificado de campo"];
  const rows = overview.workers.map(worker => [
    worker.cedula,
    worker.name,
    worker.jobTitle,
    worker.workCenter,
    ...columns.flatMap(column => {
      const moduleRow = worker.modules[column.id];
      return [statusLabel[moduleRow?.status || ""] || "", moduleRow?.scoreTenths == null ? "" : formatCourseScore(moduleRow.scoreTenths)];
    }),
    worker.moduleCertificates,
    worker.fieldCertificate ? "Sí" : "No",
  ]);
  return { filename: "avance-capacitaciones.csv", csv: `\ufeff${[head, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}` };
}

async function assertVisibleModule(db: Db, companyId: number, moduleId: number) {
  const modules = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
  const moduleRow = modules[0];
  if (!moduleRow) fail("BAD_REQUEST", "Módulo no válido.");
  const field = await visibleField(db, companyId, moduleRow.fieldId);
  if (!field) fail("FORBIDDEN", "Ese módulo no pertenece a tu empresa.");
  return moduleRow;
}

export async function setModuleAccess(actor: CourseActor, input: { moduleId: number; open: boolean; opensAt?: string | null; closesAt?: string | null }) {
  if (actor.role !== "company_admin") fail("FORBIDDEN", "Solo el administrador de la empresa.");
  const db = await database();
  await assertVisibleModule(db, actor.companyId, input.moduleId);
  const opensAt = parseOptionalDate(input.opensAt);
  const closesAt = parseOptionalDate(input.closesAt);
  await db
    .insert(courseModuleAccess)
    .values({ companyId: actor.companyId, moduleId: input.moduleId, open: input.open, opensAt, closesAt })
    .onDuplicateKeyUpdate({ set: { open: input.open, opensAt, closesAt } });
  return { ok: true };
}

export async function setWorkerOverride(actor: CourseActor, input: { workerId: number; moduleId: number; value: "abrir" | "cerrar" | "auto" }) {
  if (actor.role !== "company_admin") fail("FORBIDDEN", "Solo el administrador de la empresa.");
  const db = await database();
  const workers = await db
    .select({ id: courseWorkers.id })
    .from(courseWorkers)
    .where(and(eq(courseWorkers.id, input.workerId), eq(courseWorkers.companyId, actor.companyId)))
    .limit(1);
  if (!workers.length) fail("BAD_REQUEST", "Trabajador no encontrado.");
  await assertVisibleModule(db, actor.companyId, input.moduleId);
  if (input.value === "auto") {
    await db.delete(courseWorkerOverrides).where(and(eq(courseWorkerOverrides.workerId, input.workerId), eq(courseWorkerOverrides.moduleId, input.moduleId)));
  } else {
    await db
      .insert(courseWorkerOverrides)
      .values({ workerId: input.workerId, moduleId: input.moduleId, value: input.value })
      .onDuplicateKeyUpdate({ set: { value: input.value } });
  }
  return { ok: true };
}

export async function setCompanyRegCode(actor: CourseActor, codigo: string) {
  if (actor.role !== "company_admin") fail("FORBIDDEN", "Solo el administrador de la empresa.");
  const code = codigo.trim();
  if (code.length < 4) fail("BAD_REQUEST", "El código debe tener al menos 4 caracteres.");
  const db = await database();
  const taken = await db
    .select({ companyId: courseCompanySettings.companyId })
    .from(courseCompanySettings)
    .where(eq(courseCompanySettings.regCode, code))
    .limit(1);
  if (taken.length && taken[0].companyId !== actor.companyId) fail("CONFLICT", "Ese código ya lo usa otra empresa.");
  const current = await db.select().from(courseCompanySettings).where(eq(courseCompanySettings.companyId, actor.companyId)).limit(1);
  if (!current.length) fail("BAD_REQUEST", "Esta empresa todavía no está habilitada en capacitaciones.");
  try {
    await db.update(courseCompanySettings).set({ regCode: code }).where(eq(courseCompanySettings.companyId, actor.companyId));
  } catch (error) {
    if (isDuplicate(error)) fail("CONFLICT", "Ese código ya lo usa otra empresa.");
    throw error;
  }
  return { ok: true };
}

export async function resetWorkerPassword(actor: CourseActor, input: { workerId: number; password: string }) {
  if (actor.role !== "company_admin") fail("FORBIDDEN", "Solo el administrador de la empresa.");
  if (input.password.length < 6) fail("BAD_REQUEST", "Clave no válida.");
  const db = await database();
  const workers = await db
    .select({ id: courseWorkers.id })
    .from(courseWorkers)
    .where(and(eq(courseWorkers.id, input.workerId), eq(courseWorkers.companyId, actor.companyId)))
    .limit(1);
  if (!workers.length) fail("BAD_REQUEST", "Trabajador no encontrado.");
  const salt = randomBytes(8).toString("hex");
  await db.update(courseWorkers).set({ passwordSalt: salt, passwordHash: hashWorkerPassword(input.password, salt) }).where(eq(courseWorkers.id, input.workerId));
  return { ok: true };
}

export async function createCourseField(actor: CourseActor, name: string) {
  const trimmed = name.trim();
  if (!trimmed) fail("BAD_REQUEST", "Falta el nombre del campo.");
  if (actor.role !== "platform_admin" && actor.role !== "company_admin") fail("FORBIDDEN", "No puedes crear campos.");
  const db = await database();
  const companyId = actor.role === "company_admin" ? actor.companyId : null;
  const current = await db
    .select({ sortOrder: courseFields.sortOrder })
    .from(courseFields)
    .where(companyId === null ? isNull(courseFields.companyId) : eq(courseFields.companyId, companyId))
    .orderBy(sql`${courseFields.sortOrder} desc`)
    .limit(1);
  const inserted = await db.insert(courseFields).values({
    companyId,
    name: trimmed,
    sortOrder: (current[0]?.sortOrder || 0) + 1,
  });
  return { id: Number(inserted[0].insertId) };
}

export async function createCourseModule(actor: CourseActor, input: { fieldId: number; name: string }) {
  const trimmed = input.name.trim();
  if (!trimmed) fail("BAD_REQUEST", "Falta el nombre del módulo.");
  const db = await database();
  const field = await editableField(db, actor, input.fieldId);
  if (!field) fail("FORBIDDEN", "Ese campo no es tuyo para editarlo.");
  const current = await db
    .select({ sortOrder: courseModules.sortOrder })
    .from(courseModules)
    .where(eq(courseModules.fieldId, input.fieldId))
    .orderBy(sql`${courseModules.sortOrder} desc`)
    .limit(1);
  const inserted = await db.insert(courseModules).values({
    fieldId: input.fieldId,
    name: trimmed,
    sortOrder: (current[0]?.sortOrder || 0) + 1,
  });
  return { id: Number(inserted[0].insertId) };
}

export async function createCourseLesson(actor: CourseActor, input: { moduleId: number; file: unknown }) {
  const db = await database();
  const modules = await db.select().from(courseModules).where(eq(courseModules.id, input.moduleId)).limit(1);
  if (!modules.length) fail("BAD_REQUEST", "Módulo no válido.");
  const field = await editableField(db, actor, modules[0].fieldId);
  if (!field) fail("FORBIDDEN", actor.role === "platform_admin" ? "Ese módulo no es del catálogo general." : "Ese módulo no es tuyo para editarlo.");
  let parsed;
  try {
    parsed = validateLessonFile(input.file);
  } catch (error) {
    fail("BAD_REQUEST", error instanceof Error ? error.message : "El archivo no tiene el formato esperado.");
  }
  if (JSON.stringify(parsed).length > 200_000) fail("BAD_REQUEST", "El archivo de la capacitación es demasiado grande.");
  const current = await db
    .select({ sortOrder: courseLessons.sortOrder, number: courseLessons.number })
    .from(courseLessons)
    .where(eq(courseLessons.moduleId, input.moduleId))
    .orderBy(sql`${courseLessons.sortOrder} desc`)
    .limit(1);
  const inserted = await db.insert(courseLessons).values({
    moduleId: input.moduleId,
    number: (current[0]?.number || 0) + 1,
    title: parsed.title,
    contentJson: JSON.stringify(parsed.content),
    questionsJson: JSON.stringify(parsed.questions),
    sortOrder: (current[0]?.sortOrder || 0) + 1,
  });
  return { id: Number(inserted[0].insertId), number: (current[0]?.number || 0) + 1 };
}

export async function catalogOverview() {
  const db = await database();
  const fields = await db.select().from(courseFields).where(isNull(courseFields.companyId)).orderBy(asc(courseFields.sortOrder), asc(courseFields.name));
  const counts = await lessonCounts(db);
  const fieldViews = [];
  for (const field of fields) {
    const modules = await db.select().from(courseModules).where(eq(courseModules.fieldId, field.id)).orderBy(asc(courseModules.sortOrder));
    fieldViews.push({
      id: field.id,
      name: field.name,
      modules: modules.map(moduleRow => ({ id: moduleRow.id, name: moduleRow.name, lessonCount: counts.get(moduleRow.id) || 0 })),
    });
  }
  const companyRows = await db
    .select({ id: companies.id, name: companies.name, regCode: courseCompanySettings.regCode })
    .from(companies)
    .leftJoin(courseCompanySettings, eq(courseCompanySettings.companyId, companies.id))
    .orderBy(asc(companies.name));
  const workerCounts = await db
    .select({ companyId: courseWorkers.companyId, n: sql<number>`count(*)` })
    .from(courseWorkers)
    .groupBy(courseWorkers.companyId);
  const ownCounts = await db
    .select({ companyId: courseFields.companyId, n: sql<number>`count(*)` })
    .from(courseFields)
    .groupBy(courseFields.companyId);
  const workersByCompany = new Map(workerCounts.map(row => [row.companyId, Number(row.n)]));
  const ownByCompany = new Map(ownCounts.filter(row => row.companyId != null).map(row => [row.companyId as number, Number(row.n)]));
  return {
    fields: fieldViews,
    companies: companyRows.map(row => ({
      id: row.id,
      name: row.name,
      regCode: row.regCode,
      workers: workersByCompany.get(row.id) || 0,
      ownFields: ownByCompany.get(row.id) || 0,
    })),
  };
}

/** Every ISGE 360 company with its course registration code ("" when none is set yet). */
export async function listCompanyRegCodes() {
  const db = await database();
  const rows = await db
    .select({ companyId: companies.id, companyName: companies.name, regCode: courseCompanySettings.regCode })
    .from(companies)
    .leftJoin(courseCompanySettings, eq(courseCompanySettings.companyId, companies.id))
    .orderBy(asc(companies.name));
  return rows.map(row => ({ ...row, regCode: row.regCode || "" }));
}

export async function getCompanyRegCode(companyId: number) {
  const db = await database();
  const rows = await db
    .select({ companyId: companies.id, companyName: companies.name, regCode: courseCompanySettings.regCode })
    .from(companies)
    .leftJoin(courseCompanySettings, eq(courseCompanySettings.companyId, companies.id))
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!rows.length) fail("NOT_FOUND", "Empresa no encontrada.");
  return { ...rows[0], regCode: rows[0].regCode || "" };
}

/** Sets the code workers type on "Crear cuenta". A blank code is generated only when generateIfBlank is set. */
export async function saveCompanyRegCode(companyId: number, codigo: string | undefined, opts: { generateIfBlank?: boolean } = {}) {
  const db = await database();
  const companyRows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!companyRows.length) fail("BAD_REQUEST", "Empresa no encontrada.");
  const typed = (codigo || "").trim();
  if (!typed && !opts.generateIfBlank) fail("BAD_REQUEST", "Escribe el código de la empresa.");
  const code = typed || makeRegCode(companyRows[0].name);
  if (code.length < 4) fail("BAD_REQUEST", "El código debe tener al menos 4 caracteres.");
  if (code.length > 32) fail("BAD_REQUEST", "El código puede tener hasta 32 caracteres.");
  const taken = await db.select().from(courseCompanySettings).where(eq(courseCompanySettings.regCode, code)).limit(1);
  if (taken.length && taken[0].companyId !== companyId) fail("CONFLICT", "Ese código ya lo usa otra empresa.");
  const current = await db.select().from(courseCompanySettings).where(eq(courseCompanySettings.companyId, companyId)).limit(1);
  try {
    if (current.length) {
      await db.update(courseCompanySettings).set({ regCode: code }).where(eq(courseCompanySettings.companyId, companyId));
    } else {
      await db.insert(courseCompanySettings).values({ companyId, regCode: code });
    }
  } catch (error) {
    if (isDuplicate(error)) fail("CONFLICT", "Ese código ya lo usa otra empresa.");
    throw error;
  }
  return { regCode: code };
}
