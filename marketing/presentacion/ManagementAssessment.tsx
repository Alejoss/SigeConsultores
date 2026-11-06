import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  MessageCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "./assessmentControls";
import { RadioGroup, RadioGroupItem } from "./assessmentControls";
import {
  ASSESSMENT_QUESTIONS,
  ANSWER_OPTIONS,
  calculateAssessment,
  buildAssessmentWhatsAppUrl,
  type AssessmentAnswers,
} from "./managementAssessment";
import "./management-assessment.css";

export default function ManagementAssessment() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AssessmentAnswers>({});
  const [finished, setFinished] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const question = ASSESSMENT_QUESTIONS[step];
  const result = finished ? calculateAssessment(answers) : null;
  const completed = ASSESSMENT_QUESTIONS.filter(
    q => answers[q.id] !== undefined
  ).length;
  const last = step === ASSESSMENT_QUESTIONS.length - 1;

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, step, finished]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => startButton.current?.focus());
  };

  return (
    <section
      className="p-assessment"
      id="autoevaluacion"
      aria-labelledby="assessment-title"
    >
      <div className="p-assessment-inner">
        <div className="p-assessment-intro">
          <div>
            <p className="p-eyebrow p-eyebrow-dark">
              UNA PAUSA PARA MIRAR TU EMPRESA
            </p>
            <h2 id="assessment-title">
              ¿Tu sistema trabaja para tu estrategia… <span>o al revés?</span>
            </h2>
            <p>
              Seis preguntas para reconocer fortalezas y oportunidades de
              mejora. Sin registro y sin pedirte datos personales.
            </p>
          </div>
          {!open && (
            <Button
              ref={startButton}
              className="p-button p-button-green p-assessment-start"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="assessment-panel"
            >
              <ClipboardCheck size={19} aria-hidden="true" /> Evalúa tu gestión
              en 1 minuto <ArrowRight size={18} aria-hidden="true" />
            </Button>
          )}
        </div>
        {!open && (
          <p className="p-assessment-privacy">
            <ShieldCheck size={15} aria-hidden="true" /> Tus respuestas no se
            envían a ISGE 360. Tú decides si compartes el resultado.
          </p>
        )}
        {open && (
          <div className="p-assessment-panel" id="assessment-panel">
            <div className="p-assessment-top">
              <span>
                {result
                  ? "TU RESULTADO ORIENTATIVO"
                  : `PREGUNTA ${step + 1} DE ${ASSESSMENT_QUESTIONS.length}`}
              </span>
              <button
                type="button"
                className="p-assessment-close"
                onClick={close}
              >
                <X size={16} aria-hidden="true" /> Cerrar evaluación
              </button>
            </div>
            {!result ? (
              <div className="p-question-panel">
                <div
                  className="p-assessment-progress"
                  aria-label={`${completed} de ${ASSESSMENT_QUESTIONS.length} preguntas respondidas`}
                >
                  {ASSESSMENT_QUESTIONS.map((q, index) => (
                    <span
                      key={q.id}
                      className={
                        index === step
                          ? "current"
                          : answers[q.id] !== undefined
                            ? "answered"
                            : ""
                      }
                    />
                  ))}
                </div>
                <p className="p-question-label">{question.label}</p>
                <h3 ref={heading} tabIndex={-1} id="assessment-question">
                  {question.question}
                </h3>
                <p className="p-question-help" id="assessment-help">
                  Piensa en cómo funciona tu empresa hoy, no en lo que tiene
                  previsto hacer.
                </p>
                <RadioGroup
                  className="p-answer-grid"
                  value={answers[question.id] ?? ""}
                  onValueChange={value => {
                    const option = ANSWER_OPTIONS.find(
                      option => option.value === value
                    );
                    if (option)
                      setAnswers(previous => ({
                        ...previous,
                        [question.id]: option.value,
                      }));
                  }}
                  aria-labelledby="assessment-question"
                  aria-describedby="assessment-help"
                >
                  {ANSWER_OPTIONS.map(option => (
                    <label
                      key={option.value}
                      className={`p-answer ${answers[question.id] === option.value ? "selected" : ""}`}
                      htmlFor={`assessment-${question.id}-${option.value}`}
                    >
                      <RadioGroupItem
                        id={`assessment-${question.id}-${option.value}`}
                        value={option.value}
                      />
                      <span>{option.label}</span>
                      <small>
                        {option.value === "yes"
                          ? "Ocurre de forma habitual"
                          : option.value === "partial"
                            ? "Existe, pero falta consolidarlo"
                            : "Todavía no ocurre"}
                      </small>
                    </label>
                  ))}
                </RadioGroup>
                <div className="p-question-actions">
                  <Button
                    variant="ghost"
                    className="p-assessment-back"
                    disabled={step === 0}
                    onClick={() => setStep(previous => previous - 1)}
                  >
                    <ArrowLeft size={16} aria-hidden="true" /> Anterior
                  </Button>
                  <span>{completed} de 6 respondidas</span>
                  <Button
                    className="p-button p-button-green"
                    disabled={answers[question.id] === undefined}
                    onClick={() =>
                      last
                        ? setFinished(true)
                        : setStep(previous => previous + 1)
                    }
                  >
                    {last ? "Ver mi resultado" : "Siguiente"}{" "}
                    <ArrowRight size={17} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className={`p-result p-result-${result.level}`}>
                <div className="p-result-heading">
                  <div className="p-result-score">
                    <strong>
                      {result.score}
                      <span> / {result.maxScore}</span>
                    </strong>
                    <small>PUNTOS ORIENTATIVOS</small>
                  </div>
                  <div>
                    <h3 ref={heading} tabIndex={-1}>
                      {result.title}
                    </h3>
                    <p>{result.description}</p>
                  </div>
                </div>
                <div className="p-result-grid">
                  <div className="p-result-list">
                    <h4>Fortalezas que reconoces</h4>
                    {result.strengths.length ? (
                      <ul>
                        {result.strengths.map(text => (
                          <li key={text}>
                            <Check size={16} aria-hidden="true" />
                            {text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        Tus respuestas permiten identificar un punto de partida
                        para organizar mejoras. No determinan que tu empresa
                        carezca de fortalezas.
                      </p>
                    )}
                  </div>
                  <div className="p-result-list">
                    <h4>Oportunidades para trabajar</h4>
                    {result.opportunities.length ? (
                      <ul>
                        {result.opportunities.map(text => (
                          <li key={text}>
                            <ChevronRight size={16} aria-hidden="true" />
                            {text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        Las seis prácticas aparecen presentes según tus
                        respuestas. Conviene comprobar su consistencia y
                        sostenerlas en el tiempo.
                      </p>
                    )}
                  </div>
                </div>
                <div className="p-result-recommendation">
                  <span>TU SIGUIENTE PASO</span>
                  <p>{result.recommendation}</p>
                </div>
                <details className="p-result-summary">
                  <summary>Revisar el resumen que puedo compartir</summary>
                  <ul>
                    {result.responses.map(response => (
                      <li key={response.label}>
                        <span>{response.label}</span>
                        <strong>{response.answer}</strong>
                      </li>
                    ))}
                  </ul>
                </details>
                <details className="p-result-summary">
                  <summary>Cómo se interpreta este resultado</summary>
                  <p>Sí: 2 puntos · Parcialmente: 1 punto · No: 0 puntos.</p>
                  <p>
                    0–4: gestión fragmentada · 5–8: en proceso de integración ·
                    9–12: gestión integrada. Es una lectura inicial de seis
                    prácticas, no un porcentaje de cumplimiento ni una
                    certificación.
                  </p>
                </details>
                <div className="p-result-actions">
                  <a
                    className="p-button p-button-green"
                    href={buildAssessmentWhatsAppUrl(result)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={19} aria-hidden="true" /> Contactarme
                    con ISGE 360 sobre mi resultado{" "}
                    <ArrowRight size={17} aria-hidden="true" />
                  </a>
                  <Button
                    variant="ghost"
                    className="p-assessment-back"
                    onClick={() => {
                      setFinished(false);
                      setStep(0);
                    }}
                  >
                    Revisar mis respuestas
                  </Button>
                </div>
                <p className="p-result-sharing">
                  Se abrirá WhatsApp con un borrador de tu resultado y
                  respuestas. Puedes revisarlo o editarlo; solo se envía si tú
                  lo decides en WhatsApp.
                </p>
              </div>
            )}
            <p className="p-assessment-disclaimer">
              Resultado orientativo basado en tus respuestas. No sustituye una
              auditoría ni una evaluación de cumplimiento normativo.
            </p>
            <p className="p-assessment-privacy">
              <ShieldCheck size={15} aria-hidden="true" /> La evaluación se
              realiza en tu navegador. No guardamos ni enviamos tus respuestas;
              se descartan al recargar o salir de esta página.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
