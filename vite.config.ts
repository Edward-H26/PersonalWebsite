import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { VitePWA } from "vite-plugin-pwa"
import { SITE_DESCRIPTION } from "./scripts/seo.mjs"

export default defineConfig(({ mode }) => {
  const isProd = mode === "production"
  const basePath = isProd ? "/PersonalWebsite/" : "/"
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
          theme_color: "#0a0a0f",
          background_color: "#0a0a0f",
          scope: basePath,
          start_url: basePath
        },
        workbox: {
          clientsClaim: true,
          skipWaiting: true,
          maximumFileSizeToCacheInBytes: 80 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: new RegExp(`${escapedBasePath}intro/.*\\.mp4$`),
              handler: "CacheFirst",
              options: {
                cacheName: "intro-video",
                expiration: {
                  maxEntries: 2,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            },
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
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "three", "@react-three/fiber"],
    },
    base: basePath,
    build: {
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ["three"],
            r3f: ["@react-three/fiber", "@react-three/drei", "@react-three/postprocessing"],
          },
        },
      },
    },
  }
})
