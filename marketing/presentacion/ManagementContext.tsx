import {
  ClipboardCheck,
  Compass,
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
    title: "Áreas y sistemas desconectados de la estrategia",
    body: "¿Cada área y cada sistema de gestión trabajan para los objetivos de tu empresa?",
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
    label: "ESTRATEGIA",
    title: "Direccionamiento",
    body: "Define hacia dónde va la empresa y qué objetivos persigue.",
  },
  {
    icon: Workflow,
    number: "02",
    label: "GESTIÓN",
    title: "Operación",
    body: "Gestiona los procesos para llevar la estrategia a la operación.",
  },
  {
    icon: ClipboardCheck,
    number: "03",
    label: "CONTROL",
    title: "Desempeño",
    body: "Controla el desempeño y mide los resultados obtenidos.",
  },
];

export function ManagementSituations() {
  return (
    <section
      className="p-situations"
      id="inicio"
      aria-labelledby="situations-title"
    >
      <div className="p-context-inner">
        <div className="p-situations-heading">
          <p className="p-eyebrow p-situations-eyebrow">UNA PREGUNTA RÁPIDA</p>
          <h1 id="situations-title">
            ¿Diriges tu empresa o pasas demasiado tiempo tratando de averiguar
            qué está pasando en ella?
          </h1>
          <p>¿Te identificas con alguna de estas situaciones?</p>
        </div>
        <div className="p-situation-grid">
          {situations.map(item => (
            <article key={item.title} className="p-situation">
              <span className="p-situation-icon" aria-hidden="true">
                <item.icon size={25} strokeWidth={1.8} />
              </span>
              <div>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="p-situations-bridge">
          No se trata de trabajar más, sino de conectar la estrategia, la
          gestión y el trabajo de cada área.
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
      aria-label="Estrategia, gestión y control"
    >
      <div className="p-context-inner">
        <ol
          className="p-flow-stages"
          aria-label="Tres dimensiones de la plataforma"
        >
          {stages.map(stage => (
            <li
              key={stage.number}
              className={`p-flow-stage p-flow-stage-${stage.number}`}
            >
              <stage.icon size={29} strokeWidth={1.6} aria-hidden="true" />
              <p className="p-flow-label">{stage.label}</p>
              <h3>{stage.title}</h3>
              <p className="p-flow-description">{stage.body}</p>
            </li>
          ))}
        </ol>
        <p className="p-flow-feedback">
          La estrategia se convierte en gestión y la gestión en resultados.
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
