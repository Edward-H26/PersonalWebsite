import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: [],
      workbox: {
        maximumFileSizeToCacheInBytes: 80 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/intro/") && url.pathname.endsWith(".mp4"),
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
            urlPattern: ({ url }) => url.pathname.startsWith("/models/") && url.pathname.endsWith(".glb"),
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
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/textures/") &&
              (url.pathname.endsWith(".ktx2") || url.pathname.endsWith(".jpg") || url.pathname.endsWith(".png")),
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
  base: "/",
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
})
