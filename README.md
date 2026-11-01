# PersonalWebsite

Interactive 3D portfolio of Qiran Hu, live at
[edward-h26.github.io/PersonalWebsite](https://edward-h26.github.io/PersonalWebsite/).
The visitor walks along a road on a stylized island while cards for publications, research,
projects, experience, and contact details slide past. The classic version of the site lives in
[Edward-H26.github.io](https://github.com/Edward-H26/Edward-H26.github.io).

## Stack

- React 18, TypeScript 5, Vite 6, Tailwind CSS 3
- three.js through `@react-three/fiber`, `@react-three/drei`, and `@react-three/postprocessing`
- Zustand for the world state shared between the deck and the 3D scene
- Vitest for unit tests, Playwright for the browser walkthrough
- Node 24 for development (`.nvmrc`); the deploy workflow builds on Node 20, so stay within what both support
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`

## Getting started

```bash
nvm use    # or any Node 20 or newer
npm ci
npm run dev    # http://localhost:5173
```

| Script                  | What it does                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server                                                                        |
| `npm run build`         | Regenerates the crawler files, type-checks, and builds `dist/`                         |
| `npm run preview`       | Serves `dist/` locally                                                                 |
| `npm run seo`           | Regenerates `index.html`, `public/sitemap.xml`, and `public/llms.txt` without building |
| `npm test`              | Vitest, once; `npm run test:watch` keeps it running                                    |
| `npm run test:e2e`      | Playwright walkthrough on desktop and Pixel 7 viewports (starts its own dev server)    |
| `npm run lint`          | ESLint over `src/`, `scripts/`, `e2e/`, and the config files                           |
| `npm run typecheck`     | `tsc --noEmit`                                                                         |
| `npm run format`        | Prettier, rewrites files                                                               |
| `npm run format:check`  | Prettier, reports only (what CI runs)                                                  |
| `npm run ktx2:textures` | Re-encodes the PBR textures in `public/textures/hq` to KTX2                            |

## Directory map

```
index.html                       entry page; the blocks between the seo:head and seo:body markers are generated
e2e/deck.spec.ts                 Playwright walkthrough
scripts/seo.mjs                  command line entry of the SEO generator; re-exports the module functions for the tests
scripts/seo/                     one generator module per concern (site, content, citation, sections, head, body, llms, sitemap, markers)
scripts/*.mjs                    texture tooling
blender/island/                  the Blender generator of every model on the island (spec in blender/DESIGN.md)
src/main.tsx                     mounts the app and registers the service worker
src/App.tsx                      page shell: deck, navigation, overlays, and the world scene behind them
src/config/content/              everything the cards say, one module per stop of the walk
src/config/profile.ts            name, bio, photo, institutions, and the overview page text
src/config/scrollDeckPages.ts    turns the content into the ordered list of slides and the navigation sections
src/config/world.ts              where each section stops on the island's ring road
src/config/modelPaths.ts         every model file the scene loads
src/deck/                        pure deck logic: paging, layout, blends, wrapping, input classification, snap drift
src/hooks/                       the navigation hook and its input hook, world loading, viewport, motion, and material hooks
src/components/ui/               deck shell, slide contents, navigation, overlays
src/components/canvas/           WorldScene and its scene/ pieces, camera, environment, islands, model loaders, post-processing
src/components/canvas/islands/   terrain/ (terrain.json, heightmap, roads, ground) and layout/ (everything placed on it) behind StylizedEarthIsland
src/store/worldStore.ts          Zustand store shared by the deck and the scene
src/styles/                      globals.css imports the other stylesheets in cascade order
public/                          models, textures, decoders, images, generated crawler files
```

## How it works

**Navigation.** The page is a vertical deck of full-height slides (`src/components/ui/ScrollDeck.tsx`)
with CSS scroll snapping. `src/hooks/useScrollSnapNavigation.ts` owns the deck state and delegates
the raw events to `src/hooks/useDeckInput.ts`; both lean on the pure helpers in `src/deck/`:
`wheelPager` turns wheel distance into single steps (a notch or 100px is one slide, momentum never
steps), `inputClassification` sorts wheel, key, and touch input into page, look, and scroll intents,
`deckLayout` locates the sentinels and stage titles, `deckBlends` maps the scroll position to the
camera blends, `deckWrap` and `edgeWrap` make the deck endless, `scrollDirection` locks the camera's
travel direction, and `snapDrift` nudges the deck back onto a snap point when the browser leaves it
a few pixels off. `deckMath` maps the deck position to a position along the road. The shared state
lives in `src/store/worldStore.ts`.

**World.** `src/components/canvas/WorldScene.tsx` mounts the canvas and the loading overlay. The
pieces live next to it under `scene/`: `WorldLighting` and `lighting.ts` (the sun, fills, and the
per-section dimming), `RendererConfig` (tone mapping and exposure), and `LoadingOverlay`;
`src/hooks/useWorldLoading.ts` decides when the overlay lifts. The sea and sky live under
`environment/`: `Sea` (one mesh round the island that reads the distance from the shore, with the
swell, foam, and horizon haze in its shader), `SkyDome` (the dusk gradient, set by the hour in `skyPalette.ts`), and
`ManuscriptClouds` (one instanced cloud shape); the sea, clouds, and plants share the wind in
`wind.ts`. The island's ground comes from `blender/island`: `terrain.glb` (the mesh, its painted
colours and the weights of its four ground textures), `terrain_height.png` (the heightmap) and
`terrain.json` (the map: roads, stream, coast, landmarks, fields and orchard). `islands/terrain/`
loads them, decodes the heightmap for every height the scene asks, walks the ring road for the
camera, and draws the ground with one splat material. `islands/layout/` places everything on it
from the map: the harbour, the landmarks at their anchors, the village on its terraces facing the
street, the lanterns along the ring, the fields, and the vegetation, whose grass and flowers grow
only near the roads and the village and whose trees keep off rock and cliff tops. The order in
`buildIslandLayout` matters, because every placement records a footprint that later placements
avoid; trees then turn their seaward side to the nearest coast, taking the wind-bent shore build
near it, and repeated houses take their character variants by placement order. The layout is pure
and covered by unit tests. Model paths live in
`src/config/modelPaths.ts` and load through `src/components/canvas/models/`. `RoadLanterns` lights
the lanterns along the road one by one as the deck carries the walk towards them (`lanternGlow.ts`).

**Content.** Card text lives in `src/config/content/`, one module per stop of the walk
(`research`, `publications`, `experience`, `service`, `projects`, `info`), assembled into
`STORY_STAGES` by `index.ts`; the overview comes from `src/config/profile.ts`. Publications are
written once as structured papers, and their citation line is derived from the fields. After
editing either, run `npm run seo` and commit the regenerated `index.html`, `public/sitemap.xml`,
and `public/llms.txt`; the tests fail when any of the three is stale, and the build regenerates
them anyway.

**Search engines and AI crawlers.** `scripts/seo.mjs` writes the metadata block, the JSON-LD
graph, and a static readable profile into the marked blocks of `index.html`, so the page is fully
readable without JavaScript. React replaces the static profile on mount. `robots.txt` is served
by the root site repository, which lists this sitemap. The generator bundles `src/config` with
esbuild, so it reads exactly what the deck renders.

## Editing content

| To change                                  | Edit                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Name, bio, photo, institutions, overview   | `src/config/profile.ts`                                              |
| Research positions                         | `src/config/content/research.ts`                                     |
| Papers (authors, venue, figure, links)     | `src/config/content/publications.ts` (citation numbers follow order) |
| Professional roles and teaching            | `src/config/content/experience.ts`                                   |
| Open source and community work             | `src/config/content/service.ts`                                      |
| Projects                                   | `src/config/content/projects.ts`                                     |
| Skills, certifications, education, contact | `src/config/content/info.ts`                                         |
| Slide order, navigation labels             | `src/config/scrollDeckPages.ts`                                      |
| Where each section stops on the road       | `src/config/world.ts`                                                |
| Which model file a building or prop uses   | `src/config/modelPaths.ts`                                           |

The content model is in `src/config/content/types.ts`. A stage is a heading plus a list of cards;
a card is a title, optional subtitle, location and date, bullets, and links. The SEO generator
reads the Contact card for the email, phone, and profile links, so keep their labels as they are.

## Assets

- `public/models/island/*.glb`: every model on the island, original work generated by
  `blender/island` in this repository and exported as draco GLBs; `blender/DESIGN.md` is the design
  spec and `blender/island/build/stats.json` records each file's size and triangle count. Repeated
  houses come in character variants (`_b`, `_c`) and trees in a wind-bent shore build (`_b`), both
  listed in `src/config/modelPaths.ts`. `terrain.glb`, `terrain_height.png` and `terrain.json` are the
  island's ground, heightmap and map, and the `ground*.png` textures its tiles, also generated by
  `blender/island`.
  Licenses and sources for the third-party textures are in `public/models/ATTRIBUTION.md`.
- `public/draco` holds the decoder that three.js loads at runtime.

## Testing

- `npm test` covers the deck helpers (wheel pager, deck math, layout, blends, wrapping, input
  classification, scroll direction, snap drift), the terrain (heightmap decoding, roads, distance
  fields, the ground material), the island layout (building clearance, landmarks, vegetation rules,
  harbour, fields), the sea, the overview framing, the road lanterns' glow across the deck, the
  SEO generator, the content, the link icons, and the navigation hook in jsdom. Tests sit next to the module they cover.
- `npm run test:e2e` starts a dev server and drives the deck in Chromium: every slide is visited,
  one wheel notch moves one slide, holding the wheel keeps paging, card scrolling never pages,
  horizontal input looks sideways, and the deck wraps at both ends. Full Chromium runs headless, on
  macOS with a Metal-backed GPU, so the WebGL scene renders at a real frame rate. It is not part of
  CI for that reason.

## Continuous integration and deployment

- `.github/workflows/ci.yml` runs `npm ci`, lint, typecheck, unit tests, format check, and build on
  every push and pull request.
- `.github/workflows/deploy.yml` runs the unit tests and the build on every push to `main` and
  deploys `dist/` to GitHub Pages.

## Conventions

- Formatting is Prettier's job (`.prettierrc`): no semicolons, double quotes, 140 columns, no
  trailing commas, matching the code as it was written. `index.html`, `public/`, and the lockfile
  are not formatted.
- ESLint runs the recommended JavaScript, TypeScript, React Hooks, and React Refresh rules over
  `src/`, `scripts/`, and `e2e/`, with `eslint-config-prettier` last so no style rule fights the
  formatter.
- Component files are PascalCase, one component per file, grouped by feature; hooks, helpers,
  content, and config modules are camelCase. Pure logic goes in `src/deck/`, `geometry/`, or
  `village/` with a test next to it, and React hooks only wire that logic to the DOM and the store.
- Static data is typed and `readonly` where the type allows it, and tuned numbers are named
  constants with a comment on why they have the value they do.
- Every exported module and function carries a one-line doc comment that says what it is for;
  comments explain why, not what.
- Tailwind scans every file under `src/`, comments included, so a bare utility name in a comment
  adds that class to the built CSS. Prefer other words.
