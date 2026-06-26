import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

function htmlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...htmlFiles(path));
    } else if (path.endsWith(".html")) {
      files.push(path);
    }
  }
  return files.sort();
}

function allFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...allFiles(path));
    } else {
      files.push(path);
    }
  }
  return files.sort();
}

function linkedLocalCss(html: string, file: string): string[] {
  const links = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)];
  return links
    .map(([, href]) => href.split("?")[0])
    .filter((href) => href && !href.startsWith("http") && !href.startsWith("//") && !href.startsWith("data:"))
    .map((href) => resolve(dirname(file), href));
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function blend(foreground: [number, number, number], alpha: number, background: [number, number, number]): [number, number, number] {
  return foreground.map((channel, index) => (channel * alpha) + (background[index]! * (1 - alpha))) as [number, number, number];
}

function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: [number, number, number]): number {
  return (0.2126 * linearize(rgb[0]!)) + (0.7152 * linearize(rgb[1]!)) + (0.0722 * linearize(rgb[2]!));
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("website accessibility", () => {
  test("every static HTML page has a skip link target", () => {
    const files = htmlFiles(join(process.cwd(), "website"));
    expect(files.length).toBeGreaterThan(0);

    const failures = files.flatMap((file) => {
      const html = readFileSync(file, "utf8");
      const skipCount = html.match(/class="skip-link"/g)?.length ?? 0;
      const targetCount = html.match(/id="main-content"/g)?.length ?? 0;
      const hrefOk = html.includes('href="#main-content"');
      return skipCount === 1 && targetCount === 1 && hrefOk
        ? []
        : [{ file, skipCount, targetCount, hrefOk }];
    });

    expect(failures).toEqual([]);
  });

  test("404 page uses domain-agnostic navigation links", () => {
    const html = readFileSync(join(process.cwd(), "website", "404.html"), "utf8");

    expect(html).not.toContain('href="/AgentMaturityCompass/');
    expect(html).toContain('href="./"');
    expect(html).toContain('href="./playground.html"');
  });

  test("every static HTML page has keyboard focus-visible coverage", () => {
    const files = htmlFiles(join(process.cwd(), "website"));
    expect(files.length).toBeGreaterThan(0);

    const failures = files.flatMap((file) => {
      const html = readFileSync(file, "utf8");
      const linkedCss = linkedLocalCss(html, file)
        .map((cssFile) => readFileSync(cssFile, "utf8"))
        .join("\n");
      const pageSurface = `${html}\n${linkedCss}`;
      const hasFocusVisible = pageSurface.includes(":focus-visible");
      const hasTwoPixelOutline = /outline:\s*2px\s+solid/i.test(pageSurface);
      return hasFocusVisible && hasTwoPixelOutline ? [] : [{ file, hasFocusVisible, hasTwoPixelOutline }];
    });

    expect(failures).toEqual([]);
  });

  test("website tree does not ship backup or copy artifacts", () => {
    const files = allFiles(join(process.cwd(), "website"));
    const backupFiles = files
      .map((file) => file.replace(`${process.cwd()}/`, ""))
      .filter((file) => /(^|[-_.])(backup|bak|copy|old)([-_.]|$)/i.test(basename(file)));

    expect(backupFiles).toEqual([]);
  });

  test("non-decorative canvas charts expose accessible names", () => {
    const targetFiles = [
      ...htmlFiles(join(process.cwd(), "website")),
      ...allFiles(join(process.cwd(), "src", "console", "assets")).filter((file) => file.endsWith(".js"))
    ];
    const failures: Array<{ file: string; canvas: string; hasRole: boolean; hasName: boolean }> = [];

    for (const file of targetFiles) {
      const body = readFileSync(file, "utf8");
      for (const match of body.matchAll(/<canvas\b([^>]*)>/gi)) {
        const attrs = match[1] ?? "";
        if (/aria-hidden=["']true["']/i.test(attrs)) {
          continue;
        }
        const hasRole = /\brole=["']img["']/i.test(attrs);
        const hasName = /\baria-label=["'][^"']+["']/i.test(attrs) || /\baria-labelledby=["'][^"']+["']/i.test(attrs);
        if (!hasRole || !hasName) {
          failures.push({
            file: file.replace(`${process.cwd()}/`, ""),
            canvas: match[0]!,
            hasRole,
            hasName
          });
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("generated dashboard secondary text meets WCAG AA contrast on dark background", () => {
    const css = readFileSync(join(process.cwd(), "src", "dashboard", "templates", "styles.css"), "utf8");
    const bgMatch = css.match(/--bg:\s*(#[0-9a-fA-F]{6})/);
    const textMatch = css.match(/--text-secondary:\s*rgba\((\d+),(\d+),(\d+),\.(\d+)\)/);
    expect(bgMatch?.[1]).toBeTruthy();
    expect(textMatch).toBeTruthy();

    const bg = hexToRgb(bgMatch![1]!);
    const foreground: [number, number, number] = [
      Number(textMatch![1]),
      Number(textMatch![2]),
      Number(textMatch![3])
    ];
    const alpha = Number(`0.${textMatch![4]}`);
    const blended = blend(foreground, alpha, bg);

    expect(contrastRatio(blended, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("generated dashboard exposes high-contrast theme controls", () => {
    const css = readFileSync(join(process.cwd(), "src", "dashboard", "templates", "styles.css"), "utf8");
    const app = readFileSync(join(process.cwd(), "src", "dashboard", "templates", "app.js"), "utf8");

    expect(css).toContain('[data-theme="high-contrast"]');
    expect(css).toContain("--text-secondary: #ffffff");
    expect(app).toContain("data-t=\"high-contrast\"");
    expect(app).toContain("'dark', 'light', 'high-contrast'");
    expect(app).toContain("themeButtonLabel");
  });

  test("generated dashboard question heatmap does not rely on color alone", () => {
    const css = readFileSync(join(process.cwd(), "src", "dashboard", "templates", "styles.css"), "utf8");
    const app = readFileSync(join(process.cwd(), "src", "dashboard", "templates", "app.js"), "utf8");

    expect(app).toContain('role="grid"');
    expect(app).toContain('role="gridcell"');
    expect(app).toContain('aria-label="Question heatmap');
    expect(app).toContain('aria-label="${rowLabel}"');
    expect(app).toContain("const gapLabel");
    expect(app).toContain("const scoreLabel");
    expect(app).toContain("hm-level-label");
    expect(app).toContain("hm-conf-label");
    expect(app).toContain('role="meter"');
    expect(app).toContain('aria-valuenow="${conf}"');
    expect(app).toContain("hm-legend");
    expect(css).toContain(".hm-sr");
    expect(css).toContain(".hm-row:focus-visible");
  });

  test("generated dashboard onboarding dialog traps and restores focus", () => {
    const html = readFileSync(join(process.cwd(), "src", "dashboard", "templates", "index.html"), "utf8");
    const app = readFileSync(join(process.cwd(), "src", "dashboard", "templates", "app.js"), "utf8");

    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(app).toContain("function trapOnboardingFocus");
    expect(app).toContain("e.key !== 'Tab'");
    expect(app).toContain("G_onboardReturnFocus.focus()");
    expect(app).toContain("overlay.addEventListener('keydown', trapOnboardingFocus)");
  });

  test("accessibility statement is published and discoverable", () => {
    const docs = readFileSync(join(process.cwd(), "docs", "ACCESSIBILITY.md"), "utf8");
    const page = readFileSync(join(process.cwd(), "website", "accessibility.html"), "utf8");
    const homepage = readFileSync(join(process.cwd(), "website", "index.html"), "utf8");
    const docsHub = readFileSync(join(process.cwd(), "website", "docs", "docs.js"), "utf8");

    expect(docs).toContain("W3C WCAG 2.2");
    expect(docs).toContain("NO_COLOR=1");
    expect(docs).toContain("High contrast");
    expect(docs).toContain("traps keyboard focus");
    expect(page).toContain("id=\"main-content\"");
    expect(page).toContain("high-contrast theme");
    expect(homepage).toContain("accessibility.html");
    expect(docsHub).toContain("'ACCESSIBILITY'");
  });

  test("Open Graph image references resolve to shipped website assets", () => {
    const files = htmlFiles(join(process.cwd(), "website"));
    const failures = files.flatMap((file) => {
      const html = readFileSync(file, "utf8");
      return [...html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)].flatMap((match) => {
        const url = match[1]!;
        if (!url.startsWith("https://agentmaturity.co/")) {
          return [];
        }
        const path = url.replace("https://agentmaturity.co/", "").replace(/^\//, "");
        const assetPath = join(process.cwd(), "website", path);
        try {
          return statSync(assetPath).isFile() ? [] : [{ file: file.replace(`${process.cwd()}/`, ""), url }];
        } catch {
          return [{ file: file.replace(`${process.cwd()}/`, ""), url }];
        }
      });
    });

    expect(failures).toEqual([]);
  });
});
