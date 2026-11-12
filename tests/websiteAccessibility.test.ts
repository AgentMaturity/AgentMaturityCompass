import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
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

  // Pages serves 404.html at whatever nested path was missed, so its links are root-absolute (the site is the domain root).
  test("404 page uses root-absolute, domain-agnostic links", () => {
    const html = readFileSync(join(process.cwd(), "website", "404.html"), "utf8");

    expect(html).not.toContain('href="/AgentMaturityCompass/');
    expect(html).not.toMatch(/(?:href|src)="(?!\/|#|https:)/);
    expect(html).toContain('href="/brand.css"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/playground.html"');
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

// LIVE-UX-11: the phone menu never opened (.nav-mobile stayed display:none), plain pages that hide .nav-links on a
// phone had no menu at all, and verify.html scrolled sideways on its unbroken fingerprint.
describe("website phone navigation", () => {
  const website = join(process.cwd(), "website");
  const pages = readdirSync(website).filter((file) => file.endsWith(".html"));
  const plain = pages.filter((file) => readFileSync(join(website, file), "utf8").includes('class="nav-links"'));

  test("every page with the plain nav links has the menu button, the menu and script.js", () => {
    expect(plain.length).toBeGreaterThanOrEqual(11);
    for (const file of plain) {
      const html = readFileSync(join(website, file), "utf8");
      expect(html, file).toContain('class="nav-hamburger"');
      expect(html, file).toMatch(/<div class="nav-mobile" id="navMobile"[^>]*>/);
      expect(html, file).toMatch(/<script src="script\.js(?:\?v=[\w.]+)?"><\/script>/);
      const desktop = new Set([...html.slice(html.indexOf('class="nav-links"'), html.indexOf("</ul>", html.indexOf('class="nav-links"'))).matchAll(/href="([^"]+)"/g)].map((match) => match[1]));
      const menu = html.slice(html.indexOf('class="nav-mobile"'), html.indexOf("</div>", html.indexOf('class="nav-mobile"')));
      for (const href of desktop) expect(menu, `${file} menu lacks ${href}`).toContain(`href="${href}"`);
    }
  });

  test("the menu opens: .open changes display, and script.js announces and closes it", () => {
    const style = readFileSync(join(website, "style.css"), "utf8");
    expect(style).toMatch(/\.nav-mobile\.open\{[^}]*display:flex/);
    const script = readFileSync(join(website, "script.js"), "utf8");
    const nav = script.slice(script.indexOf("function initMobileNav()"), script.indexOf("function initTheme()"));
    expect(nav).toContain("setAttribute('aria-expanded'");
    expect(nav).toContain("setAttribute('aria-controls'");
    expect(nav).toMatch(/key===?'Escape'/);
  });

  test("script.js drives the menu: closed and announced at load, opens, closes on Escape and on a link", () => {
    type Stub = ReturnType<typeof element>;
    function element() {
      const attributes = new Map<string, string>(), classes = new Set<string>(), handlers: Record<string, Array<(event: unknown) => void>> = {};
      return {
        id: "", focused: false, attributes,
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => { attributes.set(name, String(value)); },
        classList: { contains: (name: string) => classes.has(name), add: (name: string) => { classes.add(name); }, remove: (name: string) => { classes.delete(name); },
          toggle: (name: string, force?: boolean) => { const on = force ?? !classes.has(name); if (on) classes.add(name); else classes.delete(name); return on; } },
        addEventListener: (type: string, handler: (event: unknown) => void) => { (handlers[type] ??= []).push(handler); },
        fire: (type: string, event: unknown = {}) => { for (const handler of handlers[type] ?? []) handler(event); },
        focus() { this.focused = true; }
      };
    }
    const button: Stub = element(), menu: Stub = element(), page: Stub = element();
    const document = { readyState: "complete", body: page, querySelector: (selector: string) => selector === ".nav-hamburger" ? button : selector === ".nav-mobile" ? menu : null,
      querySelectorAll: () => [], getElementById: () => null, addEventListener: page.addEventListener };
    runInNewContext(readFileSync(join(website, "script.js"), "utf8"), { document, window: {} });
    expect(menu.id).toBe("navMobile");
    expect(button.getAttribute("aria-controls")).toBe("navMobile");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.fire("click");
    expect(menu.classList.contains("open")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    page.fire("keydown", { key: "Escape" });
    expect(menu.classList.contains("open")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.focused).toBe(true);
    button.fire("click");
    menu.fire("click", { target: { closest: (selector: string) => (selector === "a" ? {} : null) } });
    expect(menu.classList.contains("open")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  test("verify.html wraps inline code, so its fingerprint cannot widen the page", () => {
    const verify = readFileSync(join(website, "verify.html"), "utf8");
    expect(verify).toContain(".plain-page code{font-size:.9rem;overflow-wrap:anywhere}");
    expect(verify).toContain(".plain-page pre code{overflow-wrap:normal}");
  });
});

// LIVE-UX-13: two pages kept sub-AA grey literals (#555 on #111/#050505, #666 on #0a0a0a); both load only brand.css.
describe("website colour contrast literals", () => {
  const website = join(process.cwd(), "website");
  test("no page uses the #555 or #666 text colour; demo and methodology use brand.css's --amc-dim", () => {
    for (const file of readdirSync(website).filter((name) => name.endsWith(".html"))) {
      expect(readFileSync(join(website, file), "utf8"), file).not.toMatch(/color:\s*#(?:555|666)\b/i);
    }
    for (const file of ["demo.html", "methodology.html"]) {
      const html = readFileSync(join(website, file), "utf8");
      expect(html, file).not.toContain("--text-dim");
      expect(html, file).toContain("var(--amc-dim)");
    }
    expect(readFileSync(join(website, "brand.css"), "utf8")).toMatch(/--amc-dim:/);
  });
});
