import path from "node:path"
import { BASE_PATH } from "./site.mjs"
import { ROOT } from "./paths.mjs"

/**
 * Bundles the deck's content modules (TypeScript, with the `@` alias) into one ES module and
 * imports it, so the generator reads exactly what the deck renders. esbuild is imported lazily
 * so that importing the generator (tests, vite.config.ts) stays cheap.
 */
export async function loadContent() {
  const { build } = await import("esbuild")
  const { outputFiles } = await build({
    stdin: {
      contents: 'export * from "@/config/content"\nexport * from "@/config/profile"\nexport * from "@/config/scrollDeckPages"',
      resolveDir: ROOT,
      loader: "ts"
    },
    alias: { "@": path.join(ROOT, "src") },
    define: { "import.meta.env.BASE_URL": JSON.stringify(BASE_PATH) },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent"
  })
  const code = Buffer.from(outputFiles[0].text).toString("base64")
  return import(`data:text/javascript;base64,${code}`)
}
