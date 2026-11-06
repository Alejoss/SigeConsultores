// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  ANSWER_OPTIONS,
  ASSESSMENT_QUESTIONS,
  buildAssessmentWhatsAppUrl,
  calculateAssessment,
  type AnswerValue,
  type AssessmentAnswers,
  type AssessmentResult,
} from "../../marketing/presentacion/managementAssessment";

const approvedQuestions = [
  {
    label: "Visibilidad",
    question:
      "¿Gerencia puede consultar el avance de los objetivos y compromisos sin reunir información de diferentes archivos?",
  },
  {
    label: "Alineación",
    question:
      "¿Las acciones de los procesos y de los sistemas de gestión contribuyen a la estrategia de la empresa?",
  },
  {
    label: "Responsabilidades",
    question:
      "¿Cada compromiso tiene un responsable claramente identificado y una fecha de cumplimiento?",
  },
  {
    label: "Integración",
    question:
      "¿Las áreas aprovechan información y controles comunes, evitando registrar lo mismo varias veces?",
  },
  {
    label: "Seguimiento",
    question:
      "¿Pueden identificar oportunamente pendientes, atrasos y desviaciones?",
  },
  {
    label: "Calidad de las salidas",
    question:
      "¿Los procesos tienen criterios para comprobar que sus resultados cumplen lo esperado y actuar cuando no cumplen?",
  },
];

function answersFor(...values: AnswerValue[]): AssessmentAnswers {
  return Object.fromEntries(
    values.map((value, index) => [ASSESSMENT_QUESTIONS[index].id, value])
  );
}

function allAnswers(value: AnswerValue): AssessmentAnswers {
  return answersFor(...ASSESSMENT_QUESTIONS.map(() => value));
}

function completedResult(answers: AssessmentAnswers): AssessmentResult {
  const result = calculateAssessment(answers);
  expect(result).not.toBeNull();
  return result!;
}

function answersForScore(score: number): AssessmentAnswers {
  let remaining = score;
  return Object.fromEntries(
    ASSESSMENT_QUESTIONS.map(question => {
      const option = ANSWER_OPTIONS.find(
        candidate => candidate.points <= remaining
      )!;
      remaining -= option.points;
      return [question.id, option.value];
    })
  );
}

function expectedScore(answers: AssessmentAnswers): number {
  return ASSESSMENT_QUESTIONS.reduce(
    (total, question) =>
      total +
      ANSWER_OPTIONS.find(option => option.value === answers[question.id])!
        .points,
    0
  );
}

describe("assessment contracts", () => {
  it("exports exactly the six approved questions with distinct IDs and useful copy", () => {
    expect(
      ASSESSMENT_QUESTIONS.map(({ label, question }) => ({ label, question }))
    ).toEqual(approvedQuestions);
    expect(
      new Set(ASSESSMENT_QUESTIONS.map(question => question.id)).size
    ).toBe(6);
    for (const question of ASSESSMENT_QUESTIONS) {
      expect(question.id).toBeTruthy();
      expect(question.strength).toBeTruthy();
      expect(question.recommendation).toBeTruthy();
    }
  });

  it("exports the approved answer labels and points", () => {
    expect(ANSWER_OPTIONS).toEqual([
      { value: "yes", label: "Sí", points: 2 },
      { value: "partial", label: "Parcialmente", points: 1 },
      { value: "no", label: "No", points: 0 },
    ]);
  });
});

describe("calculateAssessment", () => {
  it("does not calculate empty, incomplete, or unknown-only submissions", () => {
    expect(calculateAssessment({})).toBeNull();
    expect(calculateAssessment({ unrelated: "yes" })).toBeNull();
    expect(calculateAssessment(answersFor("yes", "partial"))).toBeNull();
    for (const question of ASSESSMENT_QUESTIONS) {
      const answers = allAnswers("yes");
      delete answers[question.id];
      expect(calculateAssessment(answers)).toBeNull();
    }
  });

  it.each([undefined, null, "", "Sí", "YES", "invalid", 2, false, {}, []])(
    "rejects an invalid answer %j in any question",
    invalid => {
      for (const question of ASSESSMENT_QUESTIONS) {
        const answers = { ...allAnswers("yes"), [question.id]: invalid };
        expect(calculateAssessment(answers as AssessmentAnswers)).toBeNull();
      }
    }
  );

  it("does not accept inherited answers as completed responses", () => {
    const inherited = Object.create(allAnswers("yes")) as AssessmentAnswers;
    expect(calculateAssessment(inherited)).toBeNull();
  });

  it.each([null, undefined, [], "yes"])(
    "defensively rejects an invalid answer collection %j",
    answers => {
      expect(
        calculateAssessment(answers as unknown as AssessmentAnswers)
      ).toBeNull();
    }
  );

  it("returns the minimum score without strengths or alarmist conclusions", () => {
    const result = completedResult(allAnswers("no"));
    expect(result).toMatchObject({
      score: 0,
      maxScore: 12,
      level: "fragmented",
      title: "Gestión fragmentada",
      strengths: [],
      opportunities: ASSESSMENT_QUESTIONS.map(
        question => question.recommendation
      ),
    });
    expect(result.description).toContain("Puedes avanzar de forma gradual");
    expect(result.description).not.toMatch(/crisis|fracaso|peligro|urgente/i);
  });

  it("returns the maximum score with only self-reported strengths", () => {
    const result = completedResult(allAnswers("yes"));
    expect(result).toMatchObject({
      score: 12,
      maxScore: 12,
      level: "integrated",
      title: "Gestión integrada",
      strengths: ASSESSMENT_QUESTIONS.map(question => question.strength),
      opportunities: [],
    });
    expect(result.recommendation).toContain("revisarlas periódicamente");
    expect(result.description).not.toMatch(/todo.*óptim|perfect|garantiza/i);
  });

  it.each(Array.from({ length: 13 }, (_, score) => score))(
    "classifies score %i according to the approved thresholds",
    score => {
      const result = completedResult(answersForScore(score));
      const level =
        score <= 4 ? "fragmented" : score <= 8 ? "developing" : "integrated";
      const titles = {
        fragmented: "Gestión fragmentada",
        developing: "Gestión en proceso de integración",
        integrated: "Gestión integrada",
      };
      expect(result.score).toBe(score);
      expect(result.maxScore).toBe(12);
      expect(result.level).toBe(level);
      expect(result.title).toBe(titles[level]);
      expect(result.description).toContain(
        "Esta autoevaluación es orientativa"
      );
      expect(result.description).toContain(
        "no verifica certificaciones ni cumplimiento normativo"
      );
    }
  );

  it("treats partial answers as opportunities, never as strengths", () => {
    const answers = allAnswers("partial");
    const result = completedResult(answers);
    expect(result.score).toBe(expectedScore(answers));
    expect(result.level).toBe("developing");
    expect(result.strengths).toEqual([]);
    expect(result.opportunities).toEqual(
      ASSESSMENT_QUESTIONS.map(question => question.recommendation)
    );
    expect(
      result.responses.every(response => response.answer === "Parcialmente")
    ).toBe(true);
  });

  it("connects strengths, opportunities, and recommendations to mixed answers", () => {
    const answers = answersFor("yes", "partial", "no", "yes", "partial", "no");
    const result = completedResult(answers);
    expect(result.score).toBe(expectedScore(answers));
    expect(result.strengths).toEqual(
      ASSESSMENT_QUESTIONS.filter(
        question => answers[question.id] === "yes"
      ).map(question => question.strength)
    );
    expect(result.opportunities).toEqual(
      ASSESSMENT_QUESTIONS.filter(
        question => answers[question.id] !== "yes"
      ).map(question => question.recommendation)
    );
    for (const question of ASSESSMENT_QUESTIONS) {
      if (answers[question.id] === "yes") {
        expect(result.recommendation).not.toContain(question.recommendation);
      }
    }
    expect(result.recommendation).toContain(result.opportunities[0]);
    expect(result.recommendation).toContain("un responsable, una fecha");
    expect(result.responses).toEqual(
      ASSESSMENT_QUESTIONS.map(question => ({
        label: question.label,
        answer: ANSWER_OPTIONS.find(
          option => option.value === answers[question.id]
        )!.label,
      }))
    );
  });

  it.each(["partial", "no"] as const)(
    "retains a %s gap in an integrated result instead of claiming everything is optimal",
    gap => {
      const answers = allAnswers("yes");
      const question = ASSESSMENT_QUESTIONS[5];
      answers[question.id] = gap;
      const result = completedResult(answers);
      expect(result.score).toBe(expectedScore(answers));
      expect(result.level).toBe("integrated");
      expect(result.opportunities).toEqual([question.recommendation]);
      expect(result.strengths).not.toContain(question.strength);
      expect(result.description).toContain("oportunidades concretas");
      expect(result.recommendation).toContain(question.recommendation);
      expect(`${result.description} ${result.recommendation}`).not.toMatch(
        /todo.*óptim|sin brechas|sin oportunidades|perfect|garantiza/i
      );
    }
  );

  it("ignores unrelated keys, preserves inputs, and returns independent results", () => {
    const answers = Object.freeze({
      ...allAnswers("yes"),
      unrelated: "no" as const,
    });
    const snapshot = { ...answers };
    const first = completedResult(answers);
    const second = completedResult(answers);
    expect(first).toEqual(second);
    expect(answers).toEqual(snapshot);
    first.strengths.length = 0;
    first.responses[0].answer = "Changed";
    expect(second.strengths).toHaveLength(ASSESSMENT_QUESTIONS.length);
    expect(second.responses[0].answer).toBe("Sí");
  });
});

describe("buildAssessmentWhatsAppUrl", () => {
  it("returns only the authorized recipient URL and the correctly encoded Spanish draft", () => {
    const result = completedResult(
      answersFor("yes", "partial", "no", "yes", "partial", "no")
    );
    const url = buildAssessmentWhatsAppUrl(result);
    const parsed = new URL(url);
    const draft = [
      "Hola ISGE 360, realicé la autoevaluación orientativa de gestión de mi empresa.",
      `Nivel: ${result.title}`,
      `Puntaje: ${result.score}/12`,
      "Respuestas:",
      "Visibilidad: Sí",
      "Alineación: Parcialmente",
      "Responsabilidades: No",
      "Integración: Sí",
      "Seguimiento: Parcialmente",
      "Calidad de las salidas: No",
      "Me gustaría conversar sobre oportunidades de mejora para mi empresa.",
    ].join("\n");
    expect(parsed.origin).toBe("https://wa.me");
    expect(parsed.pathname).toBe("/593987298644");
    expect([...parsed.searchParams.keys()]).toEqual(["text"]);
    expect(parsed.hash).toBe("");
    expect(url).toBe(
      `https://wa.me/593987298644?text=${encodeURIComponent(draft)}`
    );
    expect(parsed.searchParams.get("text")).toBe(draft);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(draft);
    expect(url).toContain("S%C3%AD");
    expect(url).toContain("Alineaci%C3%B3n");
    expect(url).toContain("Me%20gustar%C3%ADa");
  });

  it.each(["yes", "partial", "no"] as const)(
    "includes the calculated level and score for all %s answers",
    answer => {
      const result = completedResult(allAnswers(answer));
      const draft = new URL(
        buildAssessmentWhatsAppUrl(result)
      ).searchParams.get("text")!;
      expect(draft).toContain(`Nivel: ${result.title}`);
      expect(draft).toContain(`Puntaje: ${result.score}/12`);
      for (const response of result.responses) {
        expect(draft).toContain(`${response.label}: ${response.answer}`);
      }
    }
  );

  it("does not send requests, use storage, or mutate the result", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    try {
      const result = completedResult(allAnswers("yes"));
      const snapshot = JSON.stringify(result);
      expect(buildAssessmentWhatsAppUrl(result)).toBe(
        buildAssessmentWhatsAppUrl(result)
      );
      expect(JSON.stringify(result)).toBe(snapshot);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
