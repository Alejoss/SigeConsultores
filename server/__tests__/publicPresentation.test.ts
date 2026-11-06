import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "client/public/presentacion");

describe("Public commercial presentation (static only)", () => {
  it("uses its own assets and does not replace the platform entry point", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    expect(html).toContain('https://isge360.com/presentacion/');
    const scripts = [...html.matchAll(/src="(\/presentacion\/assets\/[^\"]+)"/g)];
    const styles = [...html.matchAll(/href="(\/presentacion\/assets\/[^\"]+)"/g)];
    expect(scripts.length).toBeGreaterThan(0);
    expect(styles.length).toBeGreaterThan(0);
    for (const match of [...scripts, ...styles]) expect(fs.existsSync(path.join(root, match[1].replace("/presentacion/", "")))).toBe(true);
    expect(html).not.toContain('/src/main.tsx');
    expect(html).not.toContain('__manus__');
    expect(fs.existsSync(path.resolve(process.cwd(), "client/index.html"))).toBe(true);
  });
  it("keeps the video and contact available under the same domain", () => {
    expect(fs.statSync(path.join(root, "media/presentacion.mp4")).size).toBeGreaterThan(100000);
    const js = fs.readdirSync(path.join(root, "assets")).filter(f => f.endsWith(".js")).map(f => fs.readFileSync(path.join(root, "assets", f), "utf8")).join("\n");
    expect(js).toContain('/presentacion/media/presentacion.mp4');
    expect(js).toContain('/presentacion/media/logo.png');
    expect(js).toContain('https://wa.me/593987298644');
    expect(js).not.toMatch(/manus-storage|manuscdn|BUILT_IN_FORGE|\/api\/trpc|\/api\/auth/);
    expect(fs.readFileSync(path.join(root, "esteban-roman.vcf"), "utf8")).toContain('EMAIL;TYPE=INTERNET:esteban@isge360.com');
    expect(fs.readFileSync(path.join(root, "presentation-es.vtt"), "utf8")).toMatch(/^WEBVTT/);
  });
  it("does not request authentication or collect data", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "marketing/presentacion/Home.tsx"), "utf8");
    expect(source).not.toMatch(/<form|<input|useQuery|useMutation|localStorage|document\.cookie/);
    expect(source).toContain('Masa Viva, empresa ficticia de demostración');
    expect(source).toContain('preload="none"');
    expect(source).toContain('playsInline');
  });
});
