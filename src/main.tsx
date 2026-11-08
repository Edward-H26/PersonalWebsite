import { type ReactNode, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./styles/globals.css"
import { registerSW } from "virtual:pwa-register"

registerSW({ immediate: true })

function mount(content: ReactNode) {
  createRoot(document.getElementById("root")!).render(<StrictMode>{content}</StrictMode>)
}

// `?shot=og` on the dev server renders a still for scripts/capture-og-image.mjs; builds drop this branch.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("shot")) {
  void import("./components/canvas").then(({ StillScene, requestedStillShot }) => {
    const still = requestedStillShot(window.location.search)
    mount(still ? <StillScene shot={still} /> : <App />)
  })
} else {
  mount(<App />)
}
