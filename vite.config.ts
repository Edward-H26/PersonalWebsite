import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { VitePWA } from "vite-plugin-pwa"
import { BASE_PATH, SITE_DESCRIPTION } from "./scripts/seo.mjs"

/**
 * The vendor chunks. React, the store and the bundler's own helpers stand apart from the scene's libraries: the shell and
 * the loader run on them alone, and in a chunk with r3f they would pull three.js in ahead of the loader.
 */
function vendorChunk(id: string) {
  if (/vite\/preload-helper|commonjsHelpers/.test(id)) return "react"
  if (/node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store)\//.test(id)) return "react"
  if (/node_modules\/three\/build\//.test(id)) return "three"
  if (/node_modules\/(@react-three|three-stdlib|postprocessing)\//.test(id)) return "r3f"
}

export default defineConfig(({ mode }) => {
  const isProd = mode === "production"
  const basePath = isProd ? BASE_PATH : "/"
  const escapedBasePath = basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        includeAssets: [],
        manifest: {
          name: "Qiran Hu | Research Assistant",
          short_name: "Qiran Hu",
          description: SITE_DESCRIPTION,
          theme_color: "#0b1e3f",
          background_color: "#0a0a0f",
          icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml" }],
          scope: basePath,
          start_url: basePath
        },
        workbox: {
          clientsClaim: true,
          skipWaiting: true,
          maximumFileSizeToCacheInBytes: 80 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: new RegExp(`${escapedBasePath}models/.*\\.glb$`),
              handler: "CacheFirst",
              options: {
                cacheName: "models-glb",
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: 60 * 60 * 24 * 90
                }
              }
            },
            {
              urlPattern: new RegExp(`${escapedBasePath}textures/.*\\.(ktx2|jpg|png)$`),
              handler: "CacheFirst",
              options: {
                cacheName: "textures",
                expiration: {
                  maxEntries: 256,
                  maxAgeSeconds: 60 * 60 * 24 * 90
                }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      },
      dedupe: ["react", "react-dom", "three", "@react-three/fiber"]
    },
    base: basePath,
    build: {
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: vendorChunk
        }
      }
    }
  }
})
