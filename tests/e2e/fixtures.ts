import { resolve } from "node:path";
import { expect, test as base } from "@playwright/test";

const fontSources = new Map([
  ["inter-latin-400-normal.woff2", resolve(process.cwd(), "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2")],
  ["inter-latin-500-normal.woff2", resolve(process.cwd(), "node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2")],
  ["inter-latin-600-normal.woff2", resolve(process.cwd(), "node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2")],
  ["inter-latin-700-normal.woff2", resolve(process.cwd(), "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2")],
  ["inter-latin-800-normal.woff2", resolve(process.cwd(), "node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2")],
  ["space-mono-latin-400-normal.woff2", resolve(process.cwd(), "node_modules/@fontsource/space-mono/files/space-mono-latin-400-normal.woff2")],
  ["space-mono-latin-700-normal.woff2", resolve(process.cwd(), "node_modules/@fontsource/space-mono/files/space-mono-latin-700-normal.woff2")],
]);

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/fonts/*.woff2", async route => {
      const filename = new URL(route.request().url()).pathname.split("/").pop() || "";
      const path = fontSources.get(filename);
      if (!path) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({ path, contentType: "font/woff2" });
    });
    await use(page);
  },
});

export { expect };
export type { Page } from "@playwright/test";
