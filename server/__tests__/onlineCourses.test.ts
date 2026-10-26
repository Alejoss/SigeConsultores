import { describe, expect, it } from "vitest";
import {
  courseDateTimeLocalToDate,
  courseDateTimeLocalValue,
  courseEntryUrl,
  gradeAnswers,
  isCourseHostname,
  toPublicQuestions,
  validateLessonFile,
  type LessonQuestion,
} from "@shared/onlineCourses";

const questions: LessonQuestion[] = [
  { q: "Una", orden: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct: "a" },
  { q: "Dos", orden: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct: "a" },
  { q: "Tres", orden: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct: "a" },
  { q: "Cuatro", orden: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct: "a" },
  { q: "Cinco", orden: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct: "b" },
];

describe("online courses grading", () => {
  it("passes at 80 percent and fails below it", () => {
    expect(gradeAnswers(questions, ["a", "a", "a", "a", "b"])).toMatchObject({
      correct: 5,
      total: 5,
      scoreTenths: 100,
      passed: true,
    });
    expect(gradeAnswers(questions, ["a", "a", "a", "a", "a"])).toMatchObject({
      correct: 4,
      total: 5,
      scoreTenths: 80,
      passed: true,
    });
    expect(gradeAnswers(questions, ["a", "a", "a", "b", "a"])).toMatchObject({
      correct: 3,
      total: 5,
      scoreTenths: 60,
      passed: false,
    });
  });

  it("rejects an answer list that does not match the question count", () => {
    expect(() => gradeAnswers(questions, ["a"])).toThrow(/no válida/);
  });

  it("hides the correct option before grading", () => {
    const pub = toPublicQuestions(questions);
    expect(pub).toHaveLength(5);
    expect(pub.every(question => !("correct" in question))).toBe(true);
  });
});

describe("online courses lesson file", () => {
  it("accepts the sample shape and rejects a broken answer key", () => {
    const parsed = validateLessonFile({
      title: "Qué es SSO",
      objetivo: "Entender",
      preguntas: questions.slice(0, 2),
    });
    expect(parsed.title).toBe("Qué es SSO");
    expect(parsed.questions).toHaveLength(2);
    expect(() =>
      validateLessonFile({
        title: "Incompleta",
        preguntas: [
          { q: "¿Sí?", orden: [{ id: "a", text: "Sí" }, { id: "b", text: "No" }], correct: "z" },
          { q: "¿Dos?", orden: [{ id: "a", text: "Sí" }, { id: "b", text: "No" }], correct: "a" },
        ],
      })
    ).toThrow(/no coincide/);
    expect(() => validateLessonFile({ title: "Corta", preguntas: [questions[0]] })).toThrow(/al menos 2/);
  });
});

describe("online courses host", () => {
  it("sends every management site to the course subdomain", () => {
    expect(isCourseHostname("capacitaciones.isge360.com")).toBe(true);
    expect(isCourseHostname("isge360.com")).toBe(false);
    expect(isCourseHostname("localhost")).toBe(false);
    expect(courseEntryUrl("/empresa", { hostname: "localhost" })).toBe(
      "https://capacitaciones.isge360.com/empresa"
    );
    expect(courseEntryUrl("/empresa", { hostname: "isge360.com" })).toBe(
      "https://capacitaciones.isge360.com/empresa"
    );
    expect(courseEntryUrl("/catalogo", { publicUrl: "https://capacitaciones.example" })).toBe(
      "https://capacitaciones.example/catalogo"
    );
  });

  it("reads a course date as Ecuador time", () => {
    expect(courseDateTimeLocalToDate("2026-10-23T18:00")?.toISOString()).toBe("2026-10-23T23:00:00.000Z");
    expect(courseDateTimeLocalValue("2026-10-23T23:00:00.000Z")).toBe("2026-10-23T18:00");
    expect(courseDateTimeLocalToDate("2026-10-23T23:00:00.000Z")?.toISOString()).toBe("2026-10-23T23:00:00.000Z");
  });
});
