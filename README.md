# PersonalWebsite

Interactive 3D portfolio of Qiran Hu, live at
[edward-h26.github.io/PersonalWebsite](https://edward-h26.github.io/PersonalWebsite/).
The visitor walks along a road on a stylized island while cards for publications, research,
projects, experience, and contact details slide past. The classic version of the site lives in
[Edward-H26.github.io](https://github.com/Edward-H26/Edward-H26.github.io).

## Stack

- React 18, TypeScript, Vite, Tailwind CSS 3
- three.js through `@react-three/fiber`, `@react-three/drei`, and `@react-three/postprocessing`
- Zustand for the world state shared between the deck and the 3D scene
- Vitest and Playwright for tests; GitHub Actions deploys to GitHub Pages on every push to `main`

## Getting started

Requires Node 20 or newer.

```bash
npm ci
npm run dev        # http://localhost:5173
```

| Script                  | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server                                                         |
| `npm run build`         | Regenerates the SEO files, type-checks, and builds `dist/`              |
| `npm run preview`       | Serves `dist/` locally                                                  |
| `npm test`              | Unit tests (Vitest)                                                     |
| `npm run test:e2e`      | Playwright walkthrough on desktop and Pixel 7 viewports                 |
| `npm run lint`          | ESLint                                                                  |
| `npm run seo`           | Regenerates the crawler-facing files without building                   |
| `npm run ktx2:textures` | Re-encodes the PBR textures in `public/textures/hq` to KTX2             |
| `npm run models:fetch`  | Downloads Poly Haven originals into the gitignored cache                |
| `npm run models:bake`   | Bakes cached originals into `public/models/hq/*_web.glb`                |

## How it works

**Navigation.** The page is a vertical deck of full-height slides (`src/components/ui/ScrollDeck.tsx`)
with CSS scroll snapping. `src/hooks/useScrollSnapNavigation.ts` handles the input: wheel and
keyboard page one slide at a time through `src/deck/wheelPager.ts` (a notch or 100px is one step,
momentum never steps), vertical touch scrolls natively and snaps, horizontal wheel, arrow keys, and
horizontal drags turn the camera sideways, and scrolling inside a card only scrolls the card.
`src/deck/deckMath.ts` maps the deck position to a position along the road. The shared state lives
in `src/store/worldStore.ts`.

**World.** `src/components/canvas/WorldScene.tsx` mounts the scene: sky, ocean, the island, and the
first-person camera that follows the road (`src/components/canvas/camera/`). The island is
generated, not modelled: `islandGeometry.ts` builds the coastline, terrain, cliffs, and road
ribbons from the route in `src/config/world.ts`, and `villageLayout.ts` places buildings, props,
harbor, trees, rocks, grass, and flowers with road and coastline clearance. Both modules are pure
and covered by unit tests. Model paths live in `src/config/modelPaths.ts` and load through
`src/components/canvas/models/`.

**Content.** Card text comes from `src/config/storyContent.ts` and the overview from
`src/config/profile.ts`. After editing either, run `npm run seo` and commit the regenerated
`index.html`, `public/sitemap.xml`, and `public/llms.txt`; the tests fail when any of the three is
stale, and the build regenerates them anyway.

**Search engines and AI crawlers.** `scripts/seo.mjs` writes the metadata block, the JSON-LD
graph, and a static readable profile into the marked blocks of `index.html`, so the page is fully
readable without JavaScript. React replaces the static profile on mount. `robots.txt` is served
by the root site repository, which lists this sitemap.

## Assets

- `public/models/hq/*_web.glb`: Poly Haven scans baked for the web by `scripts/bake-web-models.mjs`
  (large scans are simplified, textures resized to 1k, geometry draco-compressed). Fetch originals
  into the gitignored `.cache/polyhaven-originals/` with
  `npm run models:fetch -- <asset ids>`, bake with `npm run models:bake -- [asset ids]`, then
  reference the new file in `src/config/modelPaths.ts`.
- `public/models/medieval_village_pack` and `fantasy_village`: low-poly building and tree kits.
  Licenses and sources for every model and texture are in `public/models/ATTRIBUTION.md`.
- `public/textures/hq`: PBR sets from Poly Haven as KTX2 (with JPEG fallbacks) loaded by
  `src/hooks/usePbrTextureSet.ts`; `public/examples/jsm/libs/basis` and `public/draco` hold the
  transcoder and decoder that three.js loads at runtime.

## Testing

- `npm test` covers the wheel pager, deck math, island geometry invariants (solid coastline,
  road connectivity, clearance), village layout, the SEO generator, content, and the navigation
  hook in jsdom.
- `npm run test:e2e` starts a dev server and drives the deck in Chromium: every slide is visited,
  one wheel notch moves one slide, holding the wheel keeps paging, card scrolling never pages,
  horizontal input looks sideways, and the deck wraps at both ends. Full Chromium runs headless, on
  macOS with a Metal-backed GPU, so the WebGL scene renders at a real frame rate.

## Project structure

```
index.html                    entry page with generated SEO blocks
e2e/                          Playwright specs
scripts/                      SEO generator and model and texture tooling
src/components/canvas/        scene, camera, environment, island, model loaders
src/components/ui/            deck, cards, navigation, overlays
src/config/                   content, route, and rendering configuration
src/deck/                     pure paging math
src/hooks/                    navigation, viewport, motion, texture, and material hooks
src/store/                    Zustand world store
public/                       models, textures, decoders, generated crawler files
```
