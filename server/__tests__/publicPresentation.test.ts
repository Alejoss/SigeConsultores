import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "client/public/presentacion");
const presentationSource = path.resolve(process.cwd(), "marketing/presentacion");
const readSource = (file: string) =>
  fs.readFileSync(path.join(presentationSource, file), "utf8");
const count = (source: string, pattern: RegExp) =>
  [...source.matchAll(pattern)].length;

describe("Public commercial presentation (static only)", () => {
  it("uses its own assets and does not replace the platform entry point", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    expect(html).toContain("https://isge360.com/presentacion/");
    const scripts = [...html.matchAll(/src="(\/presentacion\/assets\/[^\"]+)"/g)];
    const styles = [...html.matchAll(/href="(\/presentacion\/assets\/[^\"]+)"/g)];
    expect(scripts.length).toBeGreaterThan(0);
    expect(styles.length).toBeGreaterThan(0);
    for (const match of [...scripts, ...styles])
      expect(fs.existsSync(path.join(root, match[1].replace("/presentacion/", "")))).toBe(true);
    expect(html).not.toContain("/src/main.tsx");
    expect(html).not.toContain("__manus__");
    expect(fs.existsSync(path.resolve(process.cwd(), "client/index.html"))).toBe(true);
  });

  it("keeps the video and contact available under the same domain", () => {
    expect(fs.statSync(path.join(root, "media/presentacion-20261108.mp4")).size).toBeGreaterThan(100000);
    const js = fs.readdirSync(path.join(root, "assets"))
      .filter(f => f.endsWith(".js"))
      .map(f => fs.readFileSync(path.join(root, "assets", f), "utf8"))
      .join("\n");
    expect(js).toContain("/presentacion/media/presentacion-20261108.mp4");
    expect(js).toContain("/presentacion/media/logo.png");
    expect(js).toContain("https://wa.me/593987298644");
    expect(js).not.toMatch(/manus-storage|manuscdn|BUILT_IN_FORGE|\/api\/trpc|\/api\/auth/);
    expect(fs.readFileSync(path.join(root, "esteban-roman.vcf"), "utf8")).toContain("EMAIL;TYPE=INTERNET:esteban@isge360.com");
    expect(fs.readFileSync(path.join(root, "presentation-es.vtt"), "utf8")).toMatch(/^WEBVTT/);
  });

  it("includes the advisory introduction and updated playback metadata", () => {
    const subtitles = fs.readFileSync(path.join(root, "presentation-es.vtt"), "utf8");
    expect(subtitles).toContain("asesoría personalizada");
    expect(subtitles).toContain("alineados con la estrategia de tu empresa.");
    expect(subtitles).toContain("Nuestra plataforma facilita ese trabajo.");
    const source = readSource("Home.tsx");
    expect(source).toContain("presentation-es.vtt?v=20261108");
    expect(source).toContain("ISGE 360 EN 40 SEGUNDOS");
    expect(source).toContain("Reproducir presentación de 40 segundos");
    expect(source).not.toContain("/presentacion/media/presentacion.mp4");
  });

  it("does not request authentication or collect data", () => {
    const source = readSource("Home.tsx");
    expect(source).not.toMatch(/<form|<input|useQuery|useMutation|localStorage|document\.cookie/);
    expect(source).toContain("Masa Viva, empresa ficticia de demostración");
    expect(source).toContain('preload="none"');
    expect(source).toContain("playsInline");
  });

  it("places situations before the hero and the flow after it, exactly once", () => {
    const source = readSource("Home.tsx");
    const situationsImport = source.indexOf("ManagementSituations");
    const flowImport = source.indexOf("ManagementFlow");
    const situationsRender = source.indexOf("<ManagementSituations />");
    const hero = source.indexOf('<section className="p-hero" id="solucion"');
    const flowRender = source.indexOf("<ManagementFlow />");

    expect(situationsImport).toBeGreaterThanOrEqual(0);
    expect(flowImport).toBeGreaterThanOrEqual(0);
    expect(situationsRender).toBeGreaterThan(Math.max(flowImport, situationsImport));
    expect(situationsRender).toBeLessThan(hero);
    expect(hero).toBeLessThan(flowRender);
    expect(count(source, /<ManagementSituations\s*\/>/g)).toBe(1);
    expect(count(source, /<ManagementFlow\s*\/>/g)).toBe(1);
    expect(source).not.toContain("<ManagementContext />");
  });

  it("keeps the approved transition and hero copy without duplication", () => {
    const source = readSource("Home.tsx").replace(/\s+/g, " ");
    const context = readSource("ManagementContext.tsx").replace(/\s+/g, " ");
    const approvedTransition = "No se trata de trabajar más, sino de conectar la estrategia, los sistemas de gestión y el trabajo de cada área.";
    const approvedPromise = "Para lograrlo, ISGE 360 combina asesoría personalizada y una plataforma que facilita la gestión de tus sistemas, alineados con la estrategia de tu empresa.";
    expect(context).toContain(approvedTransition);
    expect(source).toContain(approvedPromise);
    expect(count(context, new RegExp(approvedTransition, "g"))).toBe(1);
    expect(count(source, new RegExp(approvedPromise, "g"))).toBe(1);
  });

  it("keeps the four management pains and the strategy-to-results flow", () => {
    const source = readSource("ManagementContext.tsx");
    for (const pain of [
      "Una carpeta por cada norma",
      "Auditorías a última hora",
      "Objetivos sin seguimiento visible",
      "Información dispersa para decidir",
    ]) expect(source).toContain(pain);
    for (const stage of ["Estrategia", "Procesos", "Resultados"])
      expect(source).toContain(stage);
    expect(count(source, /<section\s+className="p-situations"/g)).toBe(1);
    expect(count(source, /<section\s+className="p-flow"/g)).toBe(1);
    expect(source).toMatch(/export\s+(?:function|const)\s+ManagementSituations/);
    expect(source).toMatch(/export\s+(?:function|const)\s+ManagementFlow/);
  });

  it("keeps the assessment after services and before contact, with internal-only hero actions", () => {
    const source = readSource("Home.tsx");
    expect(source.indexOf('id="servicios"')).toBeLessThan(source.indexOf("<ManagementAssessment />"));
    expect(source.indexOf("<ManagementAssessment />")).toBeLessThan(source.indexOf('id="contacto"'));
    const hero = source.slice(source.indexOf('className="p-hero"'), source.indexOf("<ManagementFlow />"));
    expect(hero).toContain("Ver presentación · 40 s");
    expect(hero).toContain("Autoevaluación · 1 minuto");
    expect(hero).not.toMatch(/whatsappUrl|Solicitar una demostración|Hablemos/);
  });

  it("calculates locally and opens only a voluntary WhatsApp draft", () => {
    const source = readSource("ManagementAssessment.tsx");
    const calculation = readSource("managementAssessment.ts");
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|fetch\(|useQuery|useMutation/);
    expect(calculation).not.toMatch(/localStorage|sessionStorage|document\.cookie|fetch\(/);
    expect(source).toContain("No guardamos ni enviamos tus respuestas");
    expect(source).toContain("no un porcentaje de cumplimiento ni una");
    expect(source).toContain("Contactarme");
    expect(source).toContain("con ISGE 360 sobre mi resultado");
    const js = fs.readdirSync(path.join(root, "assets"))
      .filter(f => f.endsWith(".js"))
      .map(f => fs.readFileSync(path.join(root, "assets", f), "utf8"))
      .join("\n");
    expect(js).toContain("Gestión fragmentada");
    expect(js).toContain("Gestión en proceso de integración");
    expect(js).toContain("Gestión integrada");
  });
});
