import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatCourseScore } from "@shared/onlineCourses";
import { coursePath } from "./coursePaths";
import { Shell } from "./PortalPage";

type LessonView = {
  id: number;
  number: number;
  title: string;
  objetivo?: string;
  icono?: string;
  intro?: string;
  bloques?: { t: string; html: string }[];
  cierre?: string;
  ejemplo?: string;
  lecturas?: string;
  nota?: string;
  questions: { q: string; orden: { id: string; text: string }[] }[];
  result: { passed: boolean; scoreTenths: number; code: string | null } | null;
};

export default function CourseViewerPage() {
  const [location, setLocation] = useLocation();
  const moduleId = Number(location.split("/").filter(Boolean).pop());
  const moduleQuery = trpc.onlineCourses.module.useQuery({ moduleId }, { enabled: Number.isInteger(moduleId) && moduleId > 0, retry: false });
  const evaluate = trpc.onlineCourses.evaluate.useMutation();
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Record<number, { correct: string }[]>>({});
  const [notice, setNotice] = useState("");

  const lessons = (moduleQuery.data?.lessons || []) as LessonView[];
  const lesson = lessons[active];
  const approvedCount = lessons.filter(item => item.result?.passed).length;
  const progress = lessons.length ? Math.round((approvedCount / lessons.length) * 100) : 0;
  const firstPending = useMemo(() => {
    const index = lessons.findIndex(item => !item.result?.passed);
    return index === -1 ? Math.max(lessons.length - 1, 0) : index;
  }, [lessons]);

  if (!Number.isInteger(moduleId) || moduleId <= 0) return <Shell><p>Módulo no válido.</p></Shell>;
  if (moduleQuery.isLoading) return <Shell><p>Cargando…</p></Shell>;
  if (moduleQuery.error || !lesson) {
    return (
      <Shell>
        <p>{moduleQuery.error?.message || "No se pudo cargar el módulo."}</p>
        <a className="underline" href={coursePath("/")}>Volver al portal</a>
      </Shell>
    );
  }

  async function grade(index: number) {
    const current = lessons[index];
    if (!current) return;
    const response = current.questions.map((_, questionIndex) => answers[`${current.id}-${questionIndex}`] || "");
    try {
      const result = await evaluate.mutateAsync({ lessonId: current.id, answers: response });
      setDetail(prev => ({ ...prev, [current.id]: result.detail }));
      setNotice(result.passed ? `Aprobado con ${formatCourseScore(result.scoreTenths)}.` : `No aprobado (${formatCourseScore(result.scoreTenths)}). Necesitas 80%.`);
      await moduleQuery.refetch();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo calificar.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center gap-4 border-b bg-white px-4 py-3">
        <a href={coursePath("/")} className="text-sm">← Portal</a>
        <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200"><div className="h-full bg-emerald-600" style={{ width: `${progress}%` }} /></div>
        <span className="text-sm">{progress}%</span>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[240px_1fr]">
        <aside>
          <p className="mb-2 text-sm font-semibold">{moduleQuery.data?.module.field} · {moduleQuery.data?.module.name}</p>
          <ol className="space-y-1 text-sm">
            {lessons.map((item, index) => (
              <li key={item.id}>
                <button className={`w-full rounded px-2 py-1 text-left ${index === active ? "bg-emerald-700 text-white" : "hover:bg-white"}`} onClick={() => { setActive(index); setNotice(""); }}>
                  {item.number}. {item.title} {item.result?.passed ? "✓" : ""}
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-500">Cada capacitación se habilita cuando apruebas la anterior.</p>
          {moduleQuery.data?.moduleCertificate && (
            <a className="mt-3 block rounded bg-emerald-700 px-3 py-2 text-center text-sm text-white" href={coursePath(`/certificado/modulo/${moduleId}`)}>Certificado del módulo</a>
          )}
          {active !== firstPending && !lesson.result?.passed && <button className="mt-2 text-xs underline" onClick={() => setActive(firstPending)}>Ir a la pendiente</button>}
        </aside>
        <article className="rounded-xl border bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Capacitación {lesson.number} de {lessons.length}</p>
          <h1 className="mb-3 text-2xl font-semibold">{lesson.title}</h1>
          {lesson.objetivo && <p className="mb-4 rounded bg-emerald-50 p-3 text-sm"><b>Al terminar podrás </b>{lesson.objetivo}</p>}
          {lesson.intro && <div className="prose mb-4 text-sm" dangerouslySetInnerHTML={{ __html: lesson.intro }} />}
          {(lesson.bloques || []).map((block, index) => (
            <section key={index} className="mb-4">
              <h2 className="font-semibold">{index + 1}. {block.t}</h2>
              <div className="text-sm" dangerouslySetInnerHTML={{ __html: block.html }} />
            </section>
          ))}
          {lesson.cierre && <div className="mb-4 rounded bg-slate-50 p-3 text-sm" dangerouslySetInnerHTML={{ __html: lesson.cierre }} />}
          {lesson.ejemplo && <div className="mb-4 text-sm" dangerouslySetInnerHTML={{ __html: lesson.ejemplo }} />}
          {lesson.lecturas && <div className="mb-4 text-sm" dangerouslySetInnerHTML={{ __html: lesson.lecturas }} />}
          {lesson.nota && <p className="mb-4 text-xs text-slate-500">{lesson.nota}</p>}
          <h2 className="mb-2 font-semibold">Evaluación de esta capacitación</h2>
          <p className="mb-3 text-sm text-slate-500">Necesitas el 80% de aciertos para aprobar.</p>
          {lesson.questions.map((question, questionIndex) => {
            const revealed = detail[lesson.id]?.[questionIndex]?.correct;
            return (
              <fieldset key={questionIndex} className="mb-4" disabled={Boolean(lesson.result?.passed)}>
                <legend className="mb-1 text-sm font-medium">{questionIndex + 1}. {question.q}</legend>
                {question.orden.map(option => (
                  <label key={option.id} className="mb-1 flex gap-2 text-sm">
                    <input
                      type="radio"
                      name={`q-${lesson.id}-${questionIndex}`}
                      value={option.id}
                      checked={answers[`${lesson.id}-${questionIndex}`] === option.id}
                      onChange={() => setAnswers(prev => ({ ...prev, [`${lesson.id}-${questionIndex}`]: option.id }))}
                    />
                    <span>{option.text}{revealed === option.id ? " · correcta" : ""}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
          {notice && <p className="mb-3 text-sm">{notice}</p>}
          {!lesson.result?.passed && <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white" onClick={() => void grade(active)}>Calificar</button>}
          {lesson.result?.passed && (
            <a className="inline-block rounded-md border px-4 py-2 text-sm" href={coursePath(`/certificado/capacitacion/${lesson.id}`)}>Imprimir certificado</a>
          )}
          <button className="ml-2 text-sm underline" onClick={() => setLocation(coursePath("/"))}>Volver</button>
        </article>
      </div>
    </div>
  );
}
