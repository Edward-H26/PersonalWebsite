import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { StillScene, requestedStillShot } from "./components/canvas"
import "./styles/globals.css"
import { registerSW } from "virtual:pwa-register"

registerSW({ immediate: true })

// `?shot=og` on the dev server renders a still for scripts/capture-og-image.mjs; builds drop this branch.
const still = import.meta.env.DEV ? requestedStillShot(window.location.search) : null

createRoot(document.getElementById("root")!).render(<StrictMode>{still ? <StillScene shot={still} /> : <App />}</StrictMode>)
