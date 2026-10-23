import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import {
  assignCompany,
  catalogOverview,
  certificateView,
  changeWorkerPassword,
  companyOverview,
  createCourseField,
  createCourseLesson,
  createCourseModule,
  evaluateLesson,
  exportCompanyCsv,
  loginCourse,
  logoutCourse,
  readCourseActor,
  registerWorker,
  resetWorkerPassword,
  searchLessons,
  setCompanyRegCode,
  setModuleAccess,
  setWorkerOverride,
  workerModule,
  workerTree,
  type CourseActor,
} from "../onlineCourses/service";

async function actorFrom(ctx: { req: Parameters<typeof readCourseActor>[0] }): Promise<CourseActor> {
  const actor = await readCourseActor(ctx.req);
  if (!actor) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Inicia sesión para continuar." });
  }
  return actor;
}

const lessonFile = z.unknown();

export const onlineCoursesRouter = router({
  whoami: publicProcedure.query(async ({ ctx }) => {
    const actor = await readCourseActor(ctx.req);
    if (!actor) return null;
    if (actor.role === "worker") return { role: actor.role, name: actor.name, cedula: actor.cedula };
    return { role: actor.role, name: actor.name };
  }),

  login: publicProcedure
    .input(z.object({ identificacion: z.string().min(1), password: z.string(), codigo: z.string().optional() }))
    .mutation(({ ctx, input }) => loginCourse(ctx.req, ctx.res, input)),

  register: publicProcedure
    .input(
      z.object({
        cedula: z.string(),
        nombre: z.string(),
        password: z.string(),
        codigo: z.string(),
        cargo: z.string().optional(),
        centro: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => registerWorker(ctx.req, ctx.res, input)),

  logout: publicProcedure.mutation(({ ctx }) => logoutCourse(ctx.req, ctx.res)),

  changePassword: publicProcedure
    .input(z.object({ actual: z.string(), nueva: z.string() }))
    .mutation(async ({ ctx, input }) => changeWorkerPassword(await actorFrom(ctx), input)),

  tree: publicProcedure.query(async ({ ctx }) => workerTree(await actorFrom(ctx))),

  search: publicProcedure
    .input(z.object({ q: z.string() }))
    .query(async ({ ctx, input }) => searchLessons(await actorFrom(ctx), input.q)),

  module: publicProcedure
    .input(z.object({ moduleId: z.number().int() }))
    .query(async ({ ctx, input }) => workerModule(await actorFrom(ctx), input.moduleId)),

  evaluate: publicProcedure
    .input(z.object({ lessonId: z.number().int(), answers: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => evaluateLesson(await actorFrom(ctx), input)),

  certificate: publicProcedure
    .input(z.object({ kind: z.enum(["capacitacion", "modulo", "campo"]), id: z.number().int() }))
    .query(async ({ ctx, input }) => certificateView(await actorFrom(ctx), input.kind, input.id)),

  companyOverview: publicProcedure.query(async ({ ctx }) => companyOverview(await actorFrom(ctx))),

  setModuleAccess: publicProcedure
    .input(
      z.object({
        moduleId: z.number().int(),
        open: z.boolean(),
        opensAt: z.string().nullable().optional(),
        closesAt: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => setModuleAccess(await actorFrom(ctx), input)),

  setOverride: publicProcedure
    .input(
      z.object({
        workerId: z.number().int(),
        moduleId: z.number().int(),
        value: z.enum(["abrir", "cerrar", "auto"]),
      })
    )
    .mutation(async ({ ctx, input }) => setWorkerOverride(await actorFrom(ctx), input)),

  setRegCode: publicProcedure
    .input(z.object({ codigo: z.string() }))
    .mutation(async ({ ctx, input }) => setCompanyRegCode(await actorFrom(ctx), input.codigo)),

  resetWorkerPassword: publicProcedure
    .input(z.object({ workerId: z.number().int(), password: z.string() }))
    .mutation(async ({ ctx, input }) => resetWorkerPassword(await actorFrom(ctx), input)),

  exportCsv: publicProcedure.query(async ({ ctx }) => exportCompanyCsv(await actorFrom(ctx))),

  createField: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => createCourseField(await actorFrom(ctx), input.name)),

  createModule: publicProcedure
    .input(z.object({ fieldId: z.number().int(), name: z.string() }))
    .mutation(async ({ ctx, input }) => createCourseModule(await actorFrom(ctx), input)),

  createLesson: publicProcedure
    .input(z.object({ moduleId: z.number().int(), file: lessonFile }))
    .mutation(async ({ ctx, input }) => createCourseLesson(await actorFrom(ctx), input)),

  catalogOverview: publicProcedure.query(async ({ ctx }) => {
    const actor = await actorFrom(ctx);
    if (actor.role !== "platform_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Solo el administrador general." });
    }
    return catalogOverview();
  }),

  assignCompany: publicProcedure
    .input(z.object({ companyId: z.number().int(), regCode: z.string().optional() }))
    .mutation(async ({ ctx, input }) => assignCompany(await actorFrom(ctx), input)),
});
