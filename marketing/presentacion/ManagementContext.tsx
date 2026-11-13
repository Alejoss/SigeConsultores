import {
  ArrowRight,
  ClipboardCheck,
  Compass,
  CornerUpLeft,
  ChartNoAxesCombined,
  Network,
  Target,
  Workflow,
} from "lucide-react";
import "./management-context.css";

const situations = [
  {
    icon: Target,
    title: "Objetivos sin seguimiento",
    body: "¿Sabes cuánto está avanzando realmente tu empresa?",
  },
  {
    icon: Network,
    title: "Sistemas de gestión desconectados de la estrategia de la empresa",
    body: "¿Los Sistemas de Gestión trabajan para tu empresa o tu empresa trabaja para ellos?",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Información dispersa",
    body: "Demasiados reportes para saber cómo está la empresa.",
  },
];
const stages = [
  {
    icon: Compass,
    number: "01",
    title: "Estrategia",
    subtitle: "Define el rumbo",
    items: [
      "Propósito, misión y visión",
      "Valores y política",
      "Objetivos estratégicos",
    ],
  },
  {
    icon: Workflow,
    number: "02",
    title: "Procesos",
    subtitle: "Convierten el rumbo en gestión",
    items: [
      "Organización de cada área",
      "Objetivos tácticos de gestión (OTG) y estratégicos (OTE)",
      "Gestión con partes interesadas",
      "Control y liberación de salidas",
    ],
  },
  {
    icon: ClipboardCheck,
    number: "03",
    title: "Resultados",
    subtitle: "Hacen visible lo que cambia",
    items: ["Desempeño", "Cumplimiento", "Mejora continua"],
  },
];

export function ManagementSituations() {
  return (
    <section className="p-situations" id="inicio" aria-labelledby="situations-title">
      <div className="p-context-inner">
        <div className="p-situations-heading">
          <h1 id="situations-title">
            ¿Diriges tu empresa o pasas demasiado tiempo tratando de averiguar qué está pasando en ella?
          </h1>
          <p>¿Te identificas con alguna de estas situaciones?</p>
        </div>
        <div className="p-situation-grid">
          {situations.map(item => (
            <article key={item.title} className="p-situation">
              <span className="p-situation-icon" aria-hidden="true">
                <item.icon size={27} strokeWidth={1.8} />
              </span>
              <div>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="p-situations-bridge">
          No se trata de trabajar más, sino de conectar la estrategia, los
          sistemas de gestión y el trabajo de cada área.
        </p>
      </div>
    </section>
  );
}

export function ManagementFlow() {
  return (
    <section
      className="p-flow"
      id="como-funciona"
      aria-labelledby="flow-title"
    >
      <div className="p-context-inner">
        <div className="p-section-heading">
          <p className="p-eyebrow p-eyebrow-dark">
            SISTEMAS DE GESTIÓN ALINEADOS A LA ESTRATEGIA
          </p>
          <h2 id="flow-title">
            Del rumbo compartido
            <br />
            <span>a los resultados.</span>
          </h2>
          <p>
            La estrategia no se queda en una declaración: se convierte en
            gestión dentro de cada área.
          </p>
        </div>
        <ol
          className="p-flow-stages"
          aria-label="Estrategia, procesos y resultados"
        >
          {stages.map(stage => (
            <li
              key={stage.number}
              className={`p-flow-stage p-flow-stage-${stage.number}`}
            >
              <div className="p-flow-stage-top">
                <stage.icon size={24} strokeWidth={1.6} aria-hidden="true" />
                <span>{stage.number}</span>
              </div>
              <h3>{stage.title}</h3>
              <p>{stage.subtitle}</p>
              <ul>
                {stage.items.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {stage.number !== "03" && (
                <span className="p-flow-arrow" aria-hidden="true">
                  <ArrowRight size={20} />
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="p-flow-feedback">
          <CornerUpLeft size={19} aria-hidden="true" />
          <span>
            Los resultados permiten revisar y mejorar tanto los procesos como
            la estrategia.
          </span>
        </p>
      </div>
    </section>
  );
}

export default function ManagementContext() {
  return (
    <>
      <ManagementSituations />
      <ManagementFlow />
    </>
  );
}
