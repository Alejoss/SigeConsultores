import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(process.cwd(), "client/public/presentacion");
const presentationSource = path.resolve(process.cwd(), "marketing/presentacion");
const readSource = (file: string) =>
  fs.readFileSync(path.join(presentationSource, file), "utf8");
const readPublic = (file: string) =>
  fs.readFileSync(path.join(root, file), "utf8");
const compiledJs = () => fs.readdirSync(path.join(root, "assets"))
  .filter(file => file.endsWith(".js"))
  .map(file => readPublic(`assets/${file}`))
  .join("\n");
const normalize = (source: string) => source.replace(/\s+/g, " ");
const count = (source: string, pattern: RegExp) =>
  [...source.matchAll(pattern)].length;
const sha256 = (content: Buffer | string) =>
  createHash("sha256").update(content).digest("hex");

// Read ISO BMFF metadata directly so CI does not require ffprobe/FFmpeg.
function mp4Boxes(buffer: Buffer, start = 0, end = buffer.length) {
  const boxes: { type: string; data: number; end: number }[] = [];
  for (let offset = start; offset + 8 <= end;) {
    const size32 = buffer.readUInt32BE(offset);
    const header = size32 === 1 ? 16 : 8;
    const size = size32 === 1
      ? Number(buffer.readBigUInt64BE(offset + 8))
      : size32 || end - offset;
    if (size < header || offset + size > end)
      throw new Error("Invalid MP4 box bounds");
    boxes.push({
      type: buffer.toString("ascii", offset + 4, offset + 8),
      data: offset + header,
      end: offset + size,
    });
    offset += size;
  }
  return boxes;
}

describe("Public commercial presentation (static only, approved 2026-11-24)", () => {
  it("keeps the permanent domain link and descriptive 40-second metadata", () => {
    const html = readPublic("index.html");
    expect(html).toMatch(/<html\s+lang="es"/);
    expect(html).toMatch(/<link\s+rel="canonical"\s+href="https:\/\/isge360\.com\/presentacion\/"/);
    expect(html).toMatch(/property="og:url"\s+content="https:\/\/isge360\.com\/presentacion\/"/);
    expect(html).toMatch(/property="og:image"\s+content="https:\/\/isge360\.com\/presentacion\/media\/logo\.png"/);
    expect(html).toContain("Plataforma de Gestión Empresarial Integral");
    expect(html).toContain("Estrategia, gestión y control conectados, con asesoría personalizada.");
    expect(html).toContain("Conoce ISGE 360 en 40 segundos.");
    expect(html).not.toMatch(/manus-storage|manuscdn|__manus__|localhost|\.manus\.space|\.manus\.computer/);
  });

  it("ships self-contained compiled local assets without replacing the platform entry", () => {
    const html = readPublic("index.html");
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)];
    const styles = [...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+)"/g)]
      .filter(match => !match[1].startsWith("https://fonts.googleapis.com/"));
    expect(scripts.length).toBeGreaterThan(0);
    expect(styles.length).toBeGreaterThan(0);
    for (const match of [...scripts, ...styles]) {
      expect(match[1]).toMatch(/^\/presentacion\/assets\/[^/]+\.(?:js|css)$/);
      expect(fs.statSync(path.join(root, match[1].replace("/presentacion/", ""))).size).toBeGreaterThan(0);
    }
    expect(html).not.toMatch(/\/src\/main\.tsx|\/marketing\/|__manus__|\.tsx?["']/);
    expect(fs.existsSync(path.resolve(process.cwd(), "client/index.html"))).toBe(true);
    expect(readSource("main.tsx")).toContain('import Home from "./Home"');
    expect(readSource("main.tsx")).not.toMatch(/App|trpc|AuthProvider|QueryClient|router/i);
    const config = readSource("vite.config.ts");
    expect(config).toContain('base: "/presentacion/"');
    expect(config).toContain('"../../client/public/presentacion"');
    expect(config).toContain("emptyOutDir: false");
  });

  it("uses local-only media in both maintainable source and the compiled release", () => {
    const source = readSource("Home.tsx");
    const js = compiledJs();
    for (const asset of ["media/logo.png", "media/poster.jpg", "media/presentacion-20261124.mp4"]) {
      expect(source).toContain(`/presentacion/${asset}`);
      expect(js).toContain(`/presentacion/${asset}`);
      expect(fs.statSync(path.join(root, asset)).size).toBeGreaterThan(1000);
    }
    expect(source).not.toMatch(/VITE_PRESENTATION_LOCAL_ASSETS|useLocalAssets|manus-storage|manuscdn/);
    expect(source).toContain('from "./ManagementAssessment"');
    expect(source).toContain('from "./ManagementContext"');
    for (const content of [source, js]) {
      expect(content).not.toContain("/presentacion/media/presentacion.mp4");
      expect(content).not.toContain("/presentacion/media/presentacion-20261108.mp4");
      expect(content).not.toMatch(/manus-storage|manuscdn|BUILT_IN_FORGE|\/api\//);
    }
    expect(source).toContain("href={media.video}");
    expect(source).toContain("Abrir video directamente");
    expect(source).toContain("Descargar video");
  });

  it("locks the approved narrated 40-second MP4, updates the legacy alias and retains rollback", () => {
    const video = fs.readFileSync(path.join(root, "media/presentacion-20261124.mp4"));
    expect(video.length).toBeGreaterThan(100000);
    // Exact approved release, including its real narration, not a silent replacement.
    expect(sha256(video)).toBe("3c0c6cdd6e01339ee41d320eb3864f5c35cfb8611a166139c3f1bef9a97d3061");
    expect(fs.readFileSync(path.join(root, "media/presentacion.mp4")).equals(video)).toBe(true);
    const rollback = fs.readFileSync(path.join(root, "media/presentacion-20261108.mp4"));
    expect(rollback.length).toBeGreaterThan(100000);
    expect(sha256(rollback)).toBe("b06b126e39b4a7a98dbebf872a0e8ffc9f475c4062f0977893339ad5dc28998c");
    expect(rollback.equals(video)).toBe(false);

    const moov = mp4Boxes(video).find(box => box.type === "moov");
    expect(moov).toBeDefined();
    const children = mp4Boxes(video, moov!.data, moov!.end);
    const mvhd = children.find(box => box.type === "mvhd");
    expect(mvhd).toBeDefined();
    const version = video[mvhd!.data];
    const timescale = video.readUInt32BE(mvhd!.data + (version === 1 ? 20 : 12));
    const duration = version === 1
      ? Number(video.readBigUInt64BE(mvhd!.data + 24))
      : video.readUInt32BE(mvhd!.data + 16);
    expect(timescale).toBeGreaterThan(0);
    expect(duration / timescale).toBeCloseTo(40, 2);
    const handlers = children.filter(box => box.type === "trak").map(track => {
      const mdia = mp4Boxes(video, track.data, track.end).find(box => box.type === "mdia");
      expect(mdia).toBeDefined();
      const hdlr = mp4Boxes(video, mdia!.data, mdia!.end).find(box => box.type === "hdlr");
      expect(hdlr).toBeDefined();
      return video.toString("ascii", hdlr!.data + 8, hdlr!.data + 12);
    });
    expect(handlers).toEqual(expect.arrayContaining(["vide", "soun"]));
  });

  it("keeps the new VTT aligned with the approved narration and the full 40-second timeline", () => {
    const subtitles = readPublic("presentation-es.vtt");
    expect(subtitles).toMatch(/^WEBVTT/);
    expect(subtitles).toBe(readSource("public/presentation-es.vtt"));
    expect(sha256(subtitles)).toBe("d9dc94e3777ca9e3fa90d15b01b2a83885ff8f48ba7210f7cdc7daca58a530dc");
    for (const copy of [
      "¿Sabes cuánto está avanzando realmente tu empresa?",
      "Objetivos sin seguimiento.",
      "Áreas desconectadas de la estrategia.",
      "Información dispersa.",
      "No se trata de trabajar más.",
      "Se trata de conectar.",
      "Plataforma de Gestión Empresarial Integral.",
      "Estrategia, gestión y control, en un solo lugar.",
      "Define el rumbo.",
      "Cada área sabe qué le toca.",
      "Y tú ves el avance.",
      "La estrategia hecha gestión.",
      "Conversemos.",
    ]) expect(subtitles).toContain(copy);
    expect(subtitles).not.toContain("Nuestra plataforma facilita ese trabajo.");
    const cues = [...subtitles.matchAll(/00:00:(\d{2}\.\d{3}) --> 00:00:(\d{2}\.\d{3})/g)];
    expect(cues).toHaveLength(15);
    let previousEnd = 0;
    for (const cue of cues) {
      const start = Number(cue[1]);
      const end = Number(cue[2]);
      expect(start).toBeGreaterThanOrEqual(previousEnd);
      expect(end).toBeGreaterThan(start);
      expect(end).toBeLessThanOrEqual(40);
      previousEnd = end;
    }
    expect(previousEnd).toBe(40);
    const source = readSource("Home.tsx");
    expect(source).toContain("presentation-es.vtt?v=20261124");
    expect(compiledJs()).toContain("/presentacion/presentation-es.vtt?v=20261124");
    expect(source).toContain('kind="captions"');
    expect(source).toContain('srcLang="es"');
    expect(source).toContain("ISGE 360 EN 40 SEGUNDOS");
    expect(source).toContain("Reproducir presentación de 40 segundos");
  });

  it("states mobile-adapted visuals and fictional progress without implying live company data", () => {
    const source = normalize(readSource("Home.tsx"));
    expect(source).toContain("Las secciones de la plataforma se presentan con un diseño adaptado para celular. Los avances mostrados son ficticios.");
    expect(source).toContain("Secciones de ISGE 360 adaptadas para celular · datos de demostración.");
    expect(source).toContain("secciones de la plataforma adaptadas para celular, datos ficticios y contacto de Esteban Román");
    expect(source).not.toContain("Masa Viva, empresa ficticia de demostración");
    expect(source).toContain('preload="none"');
    expect(source).toContain("playsInline");
    expect(source).toContain("controls={started || videoError}");
    expect(source).not.toMatch(/\bautoPlay\b/);
    expect(source).toContain('(prefers-reduced-motion: reduce)');
  });

  it("renders situations, integral-platform hero, flow, video, roles, services, assessment and contact once in order", () => {
    const source = readSource("Home.tsx");
    const markers = [
      "<ManagementSituations />",
      '<section className="p-hero" id="solucion"',
      "<ManagementFlow />",
      'className="p-video-section"',
      'className="p-roles"',
      'className="p-services"',
      "<ManagementAssessment />",
      'className="p-contact"',
    ];
    let previous = source.indexOf('<main id="contenido">');
    expect(previous).toBeGreaterThanOrEqual(0);
    for (const marker of markers) {
      const position = source.indexOf(marker);
      expect(position, marker).toBeGreaterThan(previous);
      expect(source.indexOf(marker, position + marker.length), marker).toBe(-1);
      previous = position;
    }
    expect(count(source, /<ManagementSituations\s*\/>/g)).toBe(1);
    expect(count(source, /<ManagementFlow\s*\/>/g)).toBe(1);
    expect(count(source, /<ManagementAssessment\s*\/>/g)).toBe(1);
    expect(source).not.toContain("<ManagementContext />");
    expect(source.indexOf('id="servicios"')).toBeLessThan(source.indexOf("<ManagementAssessment />"));
    expect(source.indexOf("<ManagementAssessment />")).toBeLessThan(source.indexOf('id="contacto"'));
  });

  it("keeps the approved bridge and integral-platform promise without duplication", () => {
    const source = normalize(readSource("Home.tsx"));
    const context = normalize(readSource("ManagementContext.tsx"));
    const bridge = "No se trata de trabajar más, sino de conectar la estrategia, la gestión y el trabajo de cada área.";
    const promise = "Conecta la estrategia de tu empresa con los objetivos, las responsabilidades y el trabajo de cada área, y permite ver sus resultados en un solo lugar.";
    const advice = "Integra también los sistemas de gestión al servicio de tu empresa, con asesoría personalizada para llevarlo a la práctica.";
    for (const [content, copy] of [[context, bridge], [source, promise], [source, advice]]) {
      expect(content).toContain(copy);
      expect(content.split(copy)).toHaveLength(2);
    }
    expect(source).toContain('<h2 id="p-title">Plataforma de Gestión Empresarial Integral</h2>');
    expect(source).not.toContain("Para lograrlo, ISGE 360 combina");
    expect(context).not.toContain("conectar la estrategia, los sistemas de gestión y el trabajo");
  });

  it("keeps three opening situations without an assessment CTA or duplicated brand", () => {
    const source = readSource("ManagementContext.tsx");
    const normalized = normalize(source);
    for (const copy of [
      "¿Diriges tu empresa o pasas demasiado tiempo tratando de averiguar qué está pasando en ella?",
      "¿Te identificas con alguna de estas situaciones?",
      'title: "Objetivos sin seguimiento"',
      'body: "¿Sabes cuánto está avanzando realmente tu empresa?"',
      'title: "Áreas y sistemas desconectados de la estrategia"',
      'body: "¿Cada área y cada sistema de gestión trabajan para los objetivos de tu empresa?"',
      'title: "Información dispersa"',
      'body: "Demasiados reportes para saber cómo está la empresa."',
    ]) expect(normalized).toContain(copy);
    const situations = source.slice(source.indexOf("export function ManagementSituations"), source.indexOf("export function ManagementFlow"));
    expect(situations).not.toMatch(/href\s*=|#autoevaluacion|<img\b|ISGE 360|<button\b|<Button\b/);
    expect(situations).toContain('<h1 id="situations-title">');
    expect(situations).toContain('id="inicio"');
    expect(count(source, /className="p-situations"/g)).toBe(1);
    expect(source).not.toContain('title: "Sistemas de gestión desconectados de la estrategia de la empresa"');
  });

  it("keeps the strategy, management and control flow with its approved descriptions", () => {
    const source = readSource("ManagementContext.tsx");
    let previous = source.indexOf("const stages =");
    for (const stage of ["ESTRATEGIA", "GESTIÓN", "CONTROL"]) {
      const index = source.indexOf(`label: "${stage}"`);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    for (const copy of [
      'title: "Direccionamiento"',
      "Define hacia dónde va la empresa y qué objetivos persigue.",
      'title: "Operación"',
      "Gestiona los procesos para llevar la estrategia a la operación.",
      'title: "Desempeño"',
      "Controla el desempeño y mide los resultados obtenidos.",
      "La estrategia se convierte en gestión y la gestión en resultados.",
      'aria-label="Estrategia, gestión y control"',
      'aria-label="Tres dimensiones de la plataforma"',
    ]) expect(source).toContain(copy);
    expect(count(source, /className="p-flow"/g)).toBe(1);
    expect(source).toMatch(/export\s+function\s+ManagementSituations/);
    expect(source).toMatch(/export\s+function\s+ManagementFlow/);
    expect(source).toContain("export default function ManagementContext()");
  });

  it("keeps only the internal video action in the hero, not an opening assessment CTA", () => {
    const source = readSource("Home.tsx");
    const hero = source.slice(source.indexOf('className="p-hero"'), source.indexOf("<ManagementFlow />"));
    expect(hero).toContain("Ver presentación · 40 s");
    expect(hero).toContain("onClick={playVideo}");
    expect(count(hero, /<button\b/g)).toBe(1);
    expect(hero).not.toMatch(/#autoevaluacion|Autoevaluación|whatsappUrl|Solicitar una demostración|Hablemos|href=/);
    // The navigation link remains available; it is not a hero CTA.
    const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
    expect(header).toContain('href="#autoevaluacion"');
    expect(normalize(hero)).toContain("Conoce la plataforma sin iniciar sesión.");
  });

  it("keeps the three responsibilities and the platform-plus-advisory services", () => {
    const source = normalize(readSource("Home.tsx"));
    for (const copy of [
      "Gerente General",
      "Define el rumbo. Visualiza el avance.",
      "Responsable del SIG",
      "Coordina el sistema. Cada área responde.",
      "Jefes de Proceso / Responsables de área",
      "Organizan. Ejecutan. Mejoran.",
      "Acceso y uso de la Plataforma ISGE 360",
      "Asesoría personalizada",
      "La herramienta para gestionar tu empresa y el acompañamiento para llevarla a la práctica.",
      "Acompañamiento para la implementación de la plataforma y de los Sistemas Integrados de Gestión, adaptado a la realidad y las necesidades de tu empresa.",
    ]) expect(source).toContain(copy);
    expect(count(source, /className="p-service-card(?: p-service-card-advice)?"/g)).toBe(2);
  });

  it("does not request authentication, call APIs, persist answers or add tracking in commercial sources", () => {
    for (const file of ["Home.tsx", "ManagementContext.tsx", "ManagementAssessment.tsx", "managementAssessment.ts", "assessmentControls.tsx", "main.tsx"]) {
      const source = readSource(file);
      expect(source, file).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB|navigator\.sendBeacon|\bfetch\s*\(|XMLHttpRequest|WebSocket|useQuery|useMutation|\baxios\b|\/api\//);
      expect(source, file).not.toMatch(/@\/|AuthProvider|QueryClientProvider|trpc|gtag\s*\(|fbq\s*\(/);
    }
    expect(readSource("Home.tsx")).not.toMatch(/<form\b|<input\b/);
    expect(compiledJs()).not.toMatch(/manus-storage|manuscdn|BUILT_IN_FORGE|\/api\/|googletagmanager\.com|google-analytics\.com|connect\.facebook\.net/);
  });

  it("preserves local assessment privacy, accessible controls and voluntary sharing", () => {
    const source = readSource("ManagementAssessment.tsx");
    const normalized = normalize(source);
    expect(normalized).toContain("¿Tu gestión trabaja para tu estrategia…");
    expect(normalized).toContain("Sin registro y sin pedirte datos personales.");
    expect(normalized).toContain("No guardamos ni enviamos tus respuestas;");
    expect(normalized).toContain("se descartan al recargar o salir de esta página.");
    expect(normalized).toContain("no un porcentaje de cumplimiento ni una certificación.");
    expect(normalized).toContain("Contactarme con ISGE 360 sobre mi resultado");
    expect(normalized).toContain("solo se envía si tú lo decides en WhatsApp.");
    expect(source).toContain("href={buildAssessmentWhatsAppUrl(result)}");
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain('from "./assessmentControls"');
    expect(source).toContain('aria-controls="assessment-panel"');
    expect(source).toContain('aria-labelledby="assessment-question"');
    expect(source).toContain('aria-describedby="assessment-help"');
    expect(source).toContain("startButton.current?.focus()");
    expect(source).toContain("disabled={answers[question.id] === undefined}");
    const js = compiledJs();
    for (const level of ["Gestión fragmentada", "Gestión en proceso de integración", "Gestión integrada"])
      expect(js).toContain(level);
    expect(js).toContain("No guardamos ni enviamos tus respuestas");
  });

  it("keeps authorized contact, downloadable vCard and platform link on the permanent domain", () => {
    const source = readSource("Home.tsx");
    const js = compiledJs();
    const vcard = readPublic("esteban-roman.vcf");
    expect(vcard).toBe(readSource("public/esteban-roman.vcf"));
    expect(vcard).toMatch(/^BEGIN:VCARD\r?\nVERSION:3\.0/);
    for (const line of ["FN:Esteban Román", "TEL;TYPE=CELL,VOICE:+593987298644", "EMAIL;TYPE=INTERNET:esteban@isge360.com", "URL:https://isge360.com/presentacion", "END:VCARD"])
      expect(vcard).toContain(line);
    for (const content of [source, js]) {
      expect(content).toContain("https://wa.me/593987298644?text=");
      expect(content).toContain("tel:+593987298644");
      expect(content).toContain("mailto:esteban@isge360.com");
      expect(content).toContain("https://isge360.com/");
    }
    expect(source).toContain("encodeURIComponent(");
    expect(source).toContain('download="Esteban-Roman-ISGE360.vcf"');
    expect(js).toContain("/presentacion/esteban-roman.vcf");
    expect(source).toContain('rel="noopener noreferrer"');
  });
});
