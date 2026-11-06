import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronRight,
  Compass,
  Download,
  Mail,
  MapPin,
  MessageCircle,
  Monitor,
  Phone,
  Play,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import "./presentation.css";

const media = { logo: "/presentacion/media/logo.png", video: "/presentacion/media/presentacion.mp4", poster: "/presentacion/media/poster.jpg" };
export const whatsappUrl =
  "https://wa.me/593987298644?text=" +
  encodeURIComponent(
    "Hola Esteban, vi la presentación de ISGE 360 y me gustaría coordinar una demostración para mi empresa."
  );
const roles = [
  {
    n: "01",
    icon: Compass,
    name: "Gerente General",
    title: "Define el rumbo. Visualiza el avance.",
    body: "Conecta propósito, misión, visión, política y objetivos estratégicos con la gestión diaria. Consulta el avance de OTG, OTE, sistemas de gestión y cumplimientos.",
    tags: ["Estrategia", "Desempeño"],
  },
  {
    n: "02",
    icon: ShieldCheck,
    name: "Responsable del SIG",
    title: "Coordina el sistema. Cada área responde.",
    body: "Organiza el Sistema Integrado de Gestión y vincula las responsabilidades con los procesos correspondientes. El seguimiento no recae solo en quien coordina el SIG.",
    tags: ["Sistemas de gestión", "Responsabilidades vinculadas"],
  },
  {
    n: "03",
    icon: Workflow,
    name: "Jefes de Proceso",
    title: "Organizan. Ejecutan. Mejoran.",
    body: "Desde la estructura de su área, gestionan sus objetivos tácticos de gestión (OTG) y estratégicos (OTE), acciones, reuniones y control de salidas. Un cronograma reúne su planificación.",
    tags: ["Procesos", "OTG y OTE", "Seguimiento"],
  },
];

export default function Home() {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const playVideo = async () => {
    const el = video.current;
    if (!el) return;
    el.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    try {
      await el.play();
      setStarted(true);
      setVideoError(false);
    } catch {
      setVideoError(true);
    }
  };
  return (
    <div className="p-site">
      <a className="p-skip" href="#contenido">
        Ir al contenido
      </a>
      <header className="p-header">
        <a href="#inicio" className="p-brand" aria-label="ISGE 360 — Inicio">
          <img
            src={media.logo}
            width="886"
            height="591"
            alt="ISGE 360. La estrategia hecha gestión."
          />
        </a>
        <nav aria-label="Navegación principal" className="p-nav">
          <a className="p-nav-link" href="#responsabilidades">
            La plataforma
          </a>
          <a className="p-nav-link" href="#servicios">
            Servicios
          </a>
          <a className="p-nav-link" href="#contacto">
            Contacto
          </a>
          <a
            className="p-nav-cta"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Hablemos <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="contenido">
        <section className="p-hero" id="inicio" aria-labelledby="p-title">
          <div className="p-orbit" aria-hidden="true" />
          <div className="p-hero-grid">
            <div className="p-hero-copy">
              <p className="p-eyebrow">
                <span /> SISTEMA INTEGRADO DE GESTIÓN EMPRESARIAL
              </p>
              <h1 id="p-title">
                La estrategia
                <br />
                hecha <span>gestión.</span>
              </h1>
              <p className="p-lead">
                Sistemas de gestión trabajando para la empresa.
                <br className="p-desktop-break" /> No la empresa trabajando para
                los sistemas de gestión.
              </p>
              <p className="p-sublead">
                Una plataforma. Una dirección compartida.
                <br />
                Cada persona, con su responsabilidad.
                <span className="p-service-promise">
                  Plataforma + asesoría personalizada.
                </span>
              </p>
              <div className="p-hero-actions">
                <a
                  className="p-button p-button-green"
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Solicitar una demostración{" "}
                  <ArrowUpRight size={20} aria-hidden="true" />
                </a>
                <button
                  className="p-text-button"
                  type="button"
                  onClick={playVideo}
                >
                  <Play size={17} aria-hidden="true" /> Ver presentación · 30 s
                </button>
              </div>
              <div className="p-no-login">
                <Check size={15} aria-hidden="true" /> Conoce la plataforma sin
                iniciar sesión.
              </div>
            </div>
            <div className="p-video-column" id="video">
              <div className="p-video-top">
                <span>ISGE 360 EN 30 SEGUNDOS</span>
                <span className="p-video-dot" />
              </div>
              <div className="p-video-frame">
                <video
                  ref={video}
                  controls={started || videoError}
                  playsInline
                  preload="none"
                  poster={media.poster}
                  onPlay={() => setStarted(true)}
                  onError={() => setVideoError(true)}
                  aria-label="Presentación de ISGE 360 con pantallas reales de Masa Viva y contacto de Esteban Román"
                >
                  <source src={media.video} type="video/mp4" />
                  <track
                    kind="captions"
                    src={`${import.meta.env.BASE_URL}presentation-es.vtt`}
                    srcLang="es"
                    label="Español"
                  />
                  Tu navegador no puede reproducir el video. Puedes abrirlo con
                  el enlace que aparece debajo.
                </video>
                {!started && !videoError && (
                  <button
                    type="button"
                    className="p-play"
                    onClick={playVideo}
                    aria-label="Reproducir presentación de 30 segundos"
                  >
                    <Play size={26} fill="currentColor" aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="p-video-caption">
                Pantallas reales · Masa Viva, empresa ficticia de demostración.
              </p>
              {videoError && (
                <p role="alert" className="p-video-error">
                  No se pudo iniciar el video.{" "}
                  <a
                    href={media.video}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir video directamente
                  </a>{" "}
                  o{" "}
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    contactar a Esteban
                  </a>
                  .
                </p>
              )}
            </div>
          </div>
          <a className="p-hero-bottom" href="#responsabilidades">
            <span>
              ESTRATEGIA <b>→</b> GESTIÓN <b>→</b> RESULTADOS
            </span>
            <ArrowDown size={18} aria-hidden="true" />
          </a>
        </section>
        <section
          className="p-roles"
          id="responsabilidades"
          aria-labelledby="p-roles-title"
        >
          <div className="p-section-heading">
            <p className="p-eyebrow p-eyebrow-dark">UNA VISIÓN COMPARTIDA</p>
            <h2 id="p-roles-title">
              Tres responsabilidades.
              <br />
              <span>Una sola dirección.</span>
            </h2>
            <p>
              La estrategia se convierte en acciones cuando cada área sabe qué
              le corresponde y puede dar seguimiento.
            </p>
          </div>
          <div className="p-role-list">
            {roles.map(role => (
              <article className="p-role" key={role.n}>
                <div className="p-role-number">{role.n}</div>
                <div className="p-role-name">
                  <role.icon size={25} strokeWidth={1.6} aria-hidden="true" />
                  <h3>{role.name}</h3>
                </div>
                <div className="p-role-content">
                  <h4>{role.title}</h4>
                  <p>{role.body}</p>
                  <ul
                    className="p-tags"
                    aria-label={`Herramientas de ${role.name}`}
                  >
                    {role.tags.map(tag => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section
          className="p-services"
          id="servicios"
          aria-labelledby="p-services-title"
        >
          <div className="p-services-inner">
            <div className="p-section-heading">
              <p className="p-eyebrow p-eyebrow-dark">NUESTROS SERVICIOS</p>
              <h2 id="p-services-title">
                Plataforma y<br />
                <span>asesoría personalizada.</span>
              </h2>
              <p>
                La herramienta para gestionar tu empresa y el acompañamiento
                para llevarla a la práctica.
              </p>
            </div>
            <div className="p-service-grid">
              <article className="p-service-card">
                <div className="p-service-label">
                  <Monitor size={25} strokeWidth={1.6} aria-hidden="true" />
                  <span>01 · LA HERRAMIENTA</span>
                </div>
                <h3>Acceso y uso de la Plataforma ISGE 360</h3>
                <p>
                  Una herramienta que conecta la estrategia, los sistemas de
                  gestión y la operación diaria, con responsabilidades claras y
                  seguimiento del avance.
                </p>
              </article>
              <article className="p-service-card p-service-card-advice">
                <div className="p-service-label">
                  <MessageCircle
                    size={25}
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <span>02 · EL ACOMPAÑAMIENTO</span>
                </div>
                <h3>Asesoría personalizada</h3>
                <p>
                  Acompañamiento para la implementación de la plataforma y de
                  los Sistemas Integrados de Gestión, adaptado a la realidad y
                  las necesidades de tu empresa.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section
          className="p-contact"
          id="contacto"
          aria-labelledby="p-contact-title"
        >
          <div className="p-contact-intro">
            <p className="p-eyebrow">
              <span /> CONVERSEMOS SOBRE TU EMPRESA
            </p>
            <h2 id="p-contact-title">
              De la dirección
              <br />a los resultados.
            </h2>
            <p>
              Conoce la plataforma y conversemos sobre la asesoría que necesita
              tu empresa. Coordinemos una demostración.
            </p>
            <a
              className="p-button p-button-green"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={21} aria-hidden="true" /> Solicitar por
              WhatsApp <ArrowUpRight size={19} aria-hidden="true" />
            </a>
          </div>
          <div className="p-contact-card">
            <div className="p-contact-avatar" aria-hidden="true">
              ER
            </div>
            <p className="p-contact-name">Esteban Román</p>
            <p className="p-contact-brand">
              ISGE 360 · La estrategia hecha gestión.
            </p>
            <address>
              <a href="tel:+593987298644">
                <Phone size={18} aria-hidden="true" />
                <span>+593 98 729 8644</span>
                <ChevronRight size={16} aria-hidden="true" />
              </a>
              <a href="mailto:esteban@isge360.com">
                <Mail size={18} aria-hidden="true" />
                <span>esteban@isge360.com</span>
                <ChevronRight size={16} aria-hidden="true" />
              </a>
              <p>
                <MapPin size={18} aria-hidden="true" />
                <span>Quito – Ecuador</span>
              </p>
            </address>
            <a
              className="p-save-contact"
              href={`${import.meta.env.BASE_URL}esteban-roman.vcf`}
              download="Esteban-Roman-ISGE360.vcf"
            >
              <Download size={16} aria-hidden="true" /> Guardar contacto
            </a>
          </div>
        </section>
      </main>
      <footer className="p-footer">
        <span>ISGE 360</span>
        <p>La estrategia hecha gestión.</p>
        <a
          href="https://isge360.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ingresar a la plataforma <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
