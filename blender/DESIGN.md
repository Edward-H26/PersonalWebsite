# Island Remodel: Design Specification

Version 1, 2026-10-30. Owner: Qiran Hu. This document is the brief for every agent that models island assets
in Blender. Read it fully before touching Blender or the generator code.

## 1. Goal and scope

Rebuild every model placed on the island of the 3D portfolio (`src/components/canvas/islands`) as original,
more detailed and more realistic assets in one coherent style, replacing the mixed asset packs now in
`public/models/medieval_village_pack`, `public/models/fantasy_village` and the Poly Haven scans in
`public/models/hq`. The island terrain, roads, water, sky and lighting stay as they are. The site code that
places and scales models is not changed in the modelling phases; a later integration phase swaps model paths
and re-tunes fit heights.

Phases:

1. Harbor and the three house types: `house_01`, `house_02`, `house_03`, `pier`, `ship`, `barrels`, `crate`,
   `lantern`, `sea_marker`. Rendered previews go to Qiran for approval before phase 2 starts.
2. Remaining buildings and props: `inn`, `bell_tower`, `mill`, `blacksmith`, `barracks`, `sawmill`, `stable`,
   `market_stand_01`, `market_stand_02`, `well`, `cart`, `fence`, `fire_pit`.
3. Vegetation and ground cover: `cypress`, `island_tree_01`, `island_tree_02`, `tree_small`, `fern`,
   `boulder_01`, `boulder_02`, `moss_rocks`, `tree_stump`, `grass_medium_01`, `grass_medium_02`,
   `grass_bermuda`, `dandelion`, `gazania`, `sorrel`.
4. Integration: update `src/config/modelPaths.ts`, fit heights and harbor constants, update
   `public/models/ATTRIBUTION.md`, verify with the Playwright e2e suite and screenshots.

## 2. Art direction

References, saved in `blender/references/`:

- `medieval_market_sunset.png`: half-timbered houses with cream plaster and dark oak frames, stone ground
  floors, steep roofs with wooden shingles, dormers, a conical tower roof, red and gold bunting, canvas
  market awnings, baskets, pottery, barrels, warm low sunset light, a castle on the hill behind.
- `medieval_village_megapack.png`: grey stone walls, heavy timber, dark slate and shingle roofs, a stone
  tower, a wooden well, a cart, lantern light in the windows, mist.
- Plus the Harry Potter villages (Hogsmeade, Diagon Alley): leaning and stacked upper storeys, crooked
  chimneys, jettied floors, small-paned windows, hanging signs, lanterns on brackets.

Rules that follow from them:

- Half-timbered construction on a stone plinth: cream or warm-grey plaster panels between dark oak posts,
  rails and diagonal braces; ground floors in rough stone courses; upper floors jettied 0.3 to 0.5 m.
- Steep roofs, 45 to 55 degrees, in wooden shingles or slate laid as stepped rows; ridge caps; bargeboards;
  dormers on the larger houses; chimneys that lean one or two degrees; conical roofs on towers.
- Visible joinery: window frames with sills and mullions, shutters, plank doors with iron straps and a round
  handle, lintels, corbels under jetties, beam ends, roof brackets.
- Street life: bunting between houses (the integration phase decides where), awnings on stands, barrels,
  crates, baskets, rope coils, lanterns on wall brackets, a cart, a well with a windlass.
- Imperfection on purpose: no wall exactly vertical (lean 0.5 to 2 degrees), roof rows slightly uneven,
  timbers of slightly different thickness, a few missing shingles, worn step stones. Keep it subtle.
- No photo textures. All colour comes from flat materials and, where it helps, per-vertex tint and baked
  ambient occlusion in a colour attribute. Detail comes from geometry.
- Warm light is the brand of the island at dusk: window panes and lantern glass are emissive amber. The
  site's cyan and violet stay in the user interface; do not put them on buildings.

Palette (sRGB hex, defined in `blender/island/style.py`; add keys there rather than inventing colours):

| Key                   | Hex                       | Use                                  |
| --------------------- | ------------------------- | ------------------------------------ |
| timber_dark           | #3a2a1e                   | posts, braces, rails                 |
| timber                | #5b4231                   | beams, bargeboards, brackets         |
| plank                 | #7a5a3f                   | doors, shutters, pier decks          |
| plank_light           | #9b7a55                   | crate boards, stand counters         |
| driftwood             | #6f6c66                   | weathered harbor wood                |
| plaster               | #e7dcc8                   | wall panels                          |
| plaster_warm          | #d9c7ab                   | sunlit or older panels               |
| stone                 | #4c5b73                   | ground floors, well, chimneys        |
| stone_light           | #7d8aa3                   | quoins, sills, steps                 |
| stone_dark            | #36425a                   | plinths, foundations                 |
| roof                  | #2f3f61                   | slate rows                           |
| roof_light            | #3f5078                   | ridge caps, slate highlights         |
| copper                | #8c5a3c                   | wooden shingles                      |
| iron                  | #2b2f36                   | straps, hinges, lantern cages, hoops |
| rope                  | #b8a580                   | ropes, rigging, nets                 |
| canvas                | #e6dccb                   | sails, awnings                       |
| canvas_dark           | #cdbfa6                   | furled sails, awning stripes         |
| glass                 | #8fd3e8                   | unlit panes                          |
| warm_light            | #ffe0b0                   | emissive panes and lantern glass     |
| amber                 | #f59e0b                   | emission colour                      |
| hull, hull_dark       | #4a3426, #2e2016          | ship planking and keel               |
| leaf, leaf_dark, bark | #3f7a3a, #2a4a2a, #4a3a2c | vegetation                           |

Materials are Principled BSDF only: base colour, roughness 0.6 to 0.9 (timber 0.8, stone 0.9, plaster 0.85,
iron 0.5 with metallic 0.6), emission on `warm_light` at strength 1.5 for windows and 3.0 for lantern glass.
One material per palette key is shared across every asset so the exported files stay small.

Lighting the site applies (`src/components/canvas/scene/lighting.ts`): a sunset sun two degrees above the
horizon, a warm key light at 30 degrees elevation, low fill, tone-mapping exposure 0.52. Assets are seen
mostly from a high three-quarter view in the overview and at eye level on the road, so roofs and
silhouettes matter most, then doors and windows.

## 3. Technical contract

- Units: one Blender unit is one metre. Build each asset at real size (a house door is 2.1 m).
- Axes: model Z-up in Blender; the exporter writes glTF Y-up. The site fits every model by its height
  (`GltfModel.tsx`, `InstancedGltfModel.tsx`), so absolute size does not matter but proportions do.
- Origin: bottom centre of the footprint at the ground plane (min Z = 0 after the final join), except the
  pier, ship and sea marker, which keep part of their geometry below Z = 0 (draft) like the originals.
- One mesh object per asset after `finalize()` in `blender/island/mesh.py`, named `isl_<asset>`, with its
  palette materials in slots. Apply modifiers before export.
- Shading: bevels of 1 to 3 cm with one or two segments on every visible edge, then smooth by angle at 35
  degrees. Flat planes stay flat.
- Budgets (triangles after modifiers): houses 6k to 12k; inn, mill, bell tower, barracks, sawmill, stable
  up to 16k; small props under 1.5k; pier under 6k; ship under 30k; trees under 8k; grass and flowers under
  300 since they are instanced hundreds of times; fence under 200.
- Proportions: keep each new asset's width:height and depth:height within 15 percent of the original it
  replaces (table below), so the current layout, road clearances and fit heights still work. The ship and the
  pier keep the original length, draft and bow direction because `village/harbor.ts` hard-codes them
  (`SHIP_HALF_LENGTH` 17 at scale 0.9, `SHIP_DRAFT` 2.6, `PIER_DRAFT` 3, `SHIP_YAW_OFFSET`).
- Export: `bpy.ops.export_scene.gltf(filepath, export_format="GLB", export_apply=True, export_yup=True,
use_selection=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
export_materials="EXPORT", export_normals=True)` to `public/models/island/<asset>.glb`. Record triangles,
  dimensions and file size per asset in `blender/island/build/stats.json`.
- Previews: `blender/previews/<asset>.png` at 960 by 720, EEVEE, three-quarter view from azimuth 35 and
  elevation 22 degrees, warm key sun (elevation 30, azimuth 180, colour 1.0, 0.85, 0.7, strength 3), cool fill
  sun from the opposite side (colour 0.6, 0.8, 1.0, strength 0.6), navy world (0.02, 0.03, 0.06, strength
  0.3), exposure 0.2. Also a contact sheet per phase.
- Headless build: `/Applications/Blender.app/Contents/MacOS/Blender --background --python
blender/island/build.py -- --assets house_01,pier --out public/models/island --previews blender/previews`.
  Live build: the MCP bridge (`execute_blender_code`) runs the same modules inside the open Blender window;
  import them with `sys.path.insert(0, "/Users/edwardhu/Desktop/PersonalWebsite/blender")` and
  `importlib.reload` after edits.

Original dimensions in Blender units after glTF import (X width, Y depth, Z height; min Z where not zero),
measured 2026-10-29 from the files in `public/models`:

| Asset           | X    | Y     | Z     | Notes                                  |
| --------------- | ---- | ----- | ----- | -------------------------------------- |
| house_01        | 1.94 | 2.12  | 1.07  | low cottage, placed with fit height 11 |
| house_02        | 2.14 | 2.66  | 3.39  | tall house, fit height 10.5            |
| house_03        | 2.22 | 3.42  | 3.25  | long house, fit heights 10.5 and 11    |
| inn             | 4.03 | 4.02  | 3.49  | fit height 16                          |
| bell_tower      | 1.94 | 2.23  | 4.76  | fit height 20                          |
| mill            | 3.40 | 2.73  | 4.80  | fit height 18                          |
| blacksmith      | 3.89 | 3.28  | 3.00  | fit height 12                          |
| barracks        | 1.94 | 2.12  | 2.09  | fit height 15                          |
| sawmill         | 4.40 | 3.28  | 2.86  | fit height 14.5                        |
| stable          | 4.70 | 3.33  | 2.49  | fit height 12.5                        |
| market_stand_01 | 0.52 | 1.15  | 1.04  | fit height 4.1                         |
| market_stand_02 | 0.95 | 1.19  | 1.05  | fit heights 4.1 and 4.0                |
| well            | 0.67 | 1.00  | 1.25  | min Z -0.25, fit height 3.1            |
| cart            | 0.46 | 0.93  | 0.80  |                                        |
| fence           | 0.79 | 0.03  | 0.33  | instanced, fit height from props.ts    |
| cypress         | 2.03 | 1.78  | 12.99 | slender, instanced                     |
| pier            | 3.10 | 19.03 | 7.51  | min Z -0.99, scale 1.3 in harbor.ts    |
| ship            | 9.53 | 37.43 | 32.55 | min Z -2.41, length along Y, scale 0.9 |
| barrels (set)   | 4.44 | 3.34  | 0.93  | fit height 1.4                         |
| crate           | 0.82 | 0.41  | 0.35  | fit height 0.6                         |
| lantern         | 0.22 | 0.23  | 0.53  | fit height 0.9                         |
| sea_marker      | 3.00 | 3.00  | 6.68  | min Z -1.12, fit height 6              |
| fire_pit        | 1.44 | 1.43  | 0.38  | min Z -0.19, fit height 0.6            |
| island_tree_01  | 4.76 | 4.82  | 5.02  | fit height 21                          |
| island_tree_02  | 4.21 | 4.07  | 3.41  | fit height 18                          |
| tree_small      | 2.91 | 4.22  | 4.55  | fit height 13                          |
| boulder_01      | 1.27 | 1.83  | 1.00  | fit height 2.2                         |
| boulder_02      | 2.53 | 1.23  | 0.88  | fit height 1.3                         |
| moss_rocks      | 8.00 | 6.94  | 1.77  | fit height 1.4                         |
| tree_stump      | 1.43 | 1.59  | 0.57  | fit height 0.8                         |
| fern            | 1.97 | 1.72  | 0.43  | fit height 1.3                         |
| grass_medium_01 | 5.60 | 0.33  | 0.34  | fit height 0.75                        |
| grass_medium_02 | 1.31 | 0.43  | 0.41  | fit heights 0.65 and 0.8               |
| grass_bermuda   | 1.69 | 0.14  | 0.16  | fit height 0.5                         |
| dandelion       | 4.21 | 0.26  | 0.17  | fit heights 0.42 and 0.5               |
| gazania         | 1.48 | 0.70  | 0.17  | fit height 0.6                         |
| sorrel          | 0.35 | 0.15  | 0.06  | fit height 0.3                         |

The original ship's bow direction must be measured before modelling (import
`public/models/hq/ship_pinnace_web.glb`, find the bowsprit end along Y) and reproduced.

## 4. Asset specifications

### Phase 1

- `house_01`, cottage: one storey plus attic, footprint about 6.0 by 6.5 m, eave 3.2 m, ridge 6.0 m. Stone
  plinth 0.4 m, timber-framed walls with four bays on the long side, gable roof in wooden shingles with one
  small dormer, chimney on the back slope, plank door with two steps, two shuttered windows on the front, a
  lantern bracket beside the door, a woodpile or barrel against the side wall.
- `house_02`, tall town house: three storeys, footprint 6.4 by 7.9 m, each upper floor jettied 0.35 m to the
  front, overall height about 10 m, steep slate roof with two dormers and a leaning chimney, ground floor in
  stone with an arched door, timber frames with diagonal braces on the upper floors, a hanging sign bracket,
  small-paned windows with amber emission on the first floor.
- `house_03`, long house with a side wing: two storeys, main block 7.0 by 11.0 m, wing 4.0 by 5.0 m at a right
  angle, shingle roofs that meet in a valley, a covered porch on timber posts, an external stair to the upper
  door, a lean-to shed, three windows per long side.
- `pier`: 19 m long, 3.1 m wide, plank deck on round posts (every 2.4 m, 0.25 m diameter) that reach 1 m
  below the water line, cross braces, a mooring bollard every 4.8 m, a rope rail on one side, three steps down
  to a lower landing at the sea end, barrels and a lantern post with amber glass at the shore end.
- `ship`, pinnace: 37.4 m long, 9.5 m beam, two masts with yards and furled sails, a bowsprit, planked hull
  with a visible keel and rudder, stern cabin with two windows, deck railing, hatches, a ship's wheel, coiled
  rope, rigging as thin cylinders (shrouds, stays, ratlines sampled every 0.8 m), a lantern at the stern.
- `barrels`: a set of five barrels, three standing, two on their side, staves as 16 slightly bulged segments,
  three iron hoops each, one with an open top.
- `crate`: slatted wooden crate 0.82 by 0.41 by 0.35 m with corner frames and a rope handle.
- `lantern`: iron cage with four posts, a square base and top ring, a pyramid cap, a hook arm, amber glass
  emission at strength 3.
- `sea_marker`: a lateral buoy, red conical body on a float, iron cage top, 6.7 m tall at this scale with a
  1.1 m draft.

### Phase 2

- `inn`: three storeys, footprint 11 by 11 m, a courtyard arch, a balcony on the first floor, a large hanging
  sign, four dormers, two chimneys, stacked barrels by the door, benches and a bench table outside.
- `bell_tower`: square stone tower, 5.5 by 6.3 m footprint, 13.5 m tall at the original ratio, open belfry
  with four arches and a bell, conical slate roof, a wooden stair visible through a door.
- `mill`: windmill, stone round base 9 m wide, timber upper body, four sails of lattice and canvas, a tail
  pole, a wooden stair.
- `blacksmith`: open-fronted forge with a stone chimney, anvil, trough, hanging tools, a lean-to roof.
- `barracks`: squat stone block with a timber upper floor and a watch platform, a flag pole.
- `sawmill`: long open shed with a saw frame, log pile, water wheel on one side.
- `stable`: half-open timber shed with four stalls, hay loft, a cart under the roof.
- `market_stand_01` and `market_stand_02`: counter on trestles, striped canvas awning on poles, baskets of
  goods, a hanging scale on the larger one.
- `well`: stone ring, two posts, a roof, a windlass with rope and bucket.
- `cart`: two-wheel hand cart with spoked wheels and a load of sacks.
- `fence`: two posts and three rails, 0.79 m wide, instanced.
- `fire_pit`: stone ring with logs and embers (emissive amber).

### Phase 3

- Trees: trunk and branches as tapered cylinders along hand-placed curves, canopies as three to five
  overlapping icospheres with noise displacement and a two-tone leaf material, under 8k triangles.
- Cypress: one tall tapered spindle with layered leaf shells, under 2k triangles.
- Boulders and moss rocks: subdivided icospheres with displacement and a moss tint on the upper faces.
- Grass, dandelion, gazania, sorrel: a handful of blade or leaf quads per clump, vertex-coloured, no alpha,
  under 300 triangles.

## 5. Code layout and workflow

- `blender/island/style.py`: palette and materials (exists).
- `blender/island/mesh.py`: primitives, bevels, join, origins, bounds, stats (exists).
- `blender/island/parts.py`: architectural parts (timber frames, roofs with shingle rows, dormers, chimneys,
  windows, doors, lanterns, barrels, posts, ropes); to be written.
- `blender/island/rig.py`: preview scene, camera framing, render, export; to be written.
- `blender/island/assets/<asset>.py`: one `build(seed)` per asset returning the finalized object; to be written.
- `blender/island/build.py`: headless entry point; to be written.
- Keep functions short and named for what they build; comments only for a non-obvious constraint. Code style
  follows the repository: no semicolons rule does not apply to Python, but keep Prettier out of the folder
  (it is not a JavaScript package) and keep the folder free of generated `.blend` files except
  `blender/island.blend` if a saved scene is useful.

Workflow per asset: build in the live Blender window through the MCP bridge so the owner can watch, render the
preview, check the stats against the budget and the proportion table, export the GLB, then commit nothing;
the owner commits.

## 6. Verification and acceptance

- Every asset: preview rendered, triangles within budget, dimensions within 15 percent of the proportion
  table (or an explicit note why not), GLB exported with draco and loadable (re-import it in Blender and
  confirm the dimensions), stats recorded.
- Phase gate: the contact sheet and the per-asset previews are shown to Qiran; phase 2 starts after his
  approval of the style on phase 1.
- Integration phase: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, Playwright
  screenshots of the overview at 1440 by 900 and on Pixel 7, and the road walk; compare triangle totals and
  GLB totals before and after; the overview must still frame the whole island with the ship under the hero
  card (`src/components/canvas/camera/overviewFraming.ts`).
- Licensing: all new assets are original work by Qiran Hu made with these scripts; `ATTRIBUTION.md` drops
  the replaced third-party entries in the integration phase.

## 7. Reference findings (added 2026-10-31)

Checked against conservation guidance and set-design sources so the assets follow real proportions, not guesses.

- Roof pitch: medieval English timber-framed roofs were steep, 50 degrees or more; plain clay tiles 45 to 60
  degrees; thatch about 50 degrees; slate and stone flags at least 35 degrees. Use 48 to 55 degrees for shingle
  and tile roofs on houses, 40 degrees on sheds and lean-tos, 52 degrees on dormers.
- Jetties: upper floors overhang on a bressummer carried by projecting joists; overhangs are usually about 0.4 m
  and can reach 1.2 m; when a house has two upper storeys, each jettied floor overhangs by about as much as the
  one below. Model visible joist ends under every jetty and a bressummer beam along its edge.
- Infill: wattle and daub or lath and plaster between posts, usually whitewashed; studs close-spaced (0.3 to
  0.6 m apart) in showy town houses, wider on cottages; braces as straight or curved diagonals at corners;
  saltire (St Andrew's cross) panels in German and Alsatian work. Plaster panels sit slightly behind the timber
  face, 20 to 40 mm.
- Crookedness: the Diagon Alley and Hogsmeade sets were physically pushed and tilted into place so the whole
  street leaned. Apply leans of 0.5 to 2 degrees per storey in alternating directions, chimneys leaning 2 to 4
  degrees, ridge lines sagging 2 to 4 cm per metre at the centre.
- Village layout, for the integration phase: a stone well at the square, the inn and market stands facing it,
  the smithy at the edge with its chimney downwind, the mill at the water's edge, the bell tower on the highest
  point, bunting strung between the tallest facades.
- Ship: a pinnace is lightly built, single-decked, square-sterned and narrower than other ships of its length,
  rigged with two or three masts; keep the square stern with cabin windows, a bowsprit, and a narrow beam
  (about one quarter of the length). The cog is the medieval alternative (28 by 9 m, one mast, square sail);
  the pinnace stays because the harbor code expects its length and masts.

## 8. Phase 1 review and phase 2 brief (2026-10-31)

Phase 1 output verified by re-import: nine GLBs, one mesh each, drafts preserved, budgets met. Read
`blender/island/build/stats.json` and the previews before continuing.

Fixes to fold into phase 2 work:

- `house_01`: 7.69 by 7.25 by 7.61 m. The original was a long low building (1.94 by 2.12 by 1.07), so at the
  site's fit height of 11 the new cottage is far narrower. Either stretch the cottage to a 2:1 footprint with a
  lower ridge (about 9 by 6 by 5.5 m), or note a fit height of 7 for integration. Prefer the longer, lower
  cottage: it reads as a different type from `house_02` and `house_03`.
- `house_03`: 12.34 wide for 11.07 tall against the original's 2.22 to 3.25 ratio. Tighten the wing or raise
  the main roof so width stays within 15 percent of 0.68 times the height, or record a fit height change.
- All houses: add the jetty joist ends and bressummer, the slight leans, a hanging sign bracket on `house_02`,
  and a few missing shingles; keep the lit windows.
- `pier`: add a second lantern post at the sea end and rope coils on the deck.
- `ship`: planking lines on the hull, a visible rudder and tiller, deck hatches and a wheel, ratlines on the
  shrouds.

Phase 2 assets follow section 4 with the proportions in section 3: `inn`, `bell_tower`, `mill`, `blacksmith`,
`barracks`, `sawmill`, `stable`, `market_stand_01`, `market_stand_02`, `well`, `cart`, `fence`, `fire_pit`.
Each must reuse `parts.py` (extend it rather than duplicating), render a preview, stay within budget, and export.

## 9. Brand and authorship (added 2026-10-31)

The island is Qiran's own design language, not an asset pack. Three rules make it his:

1. Structural honesty. Every visible timber carries a load or closes a joint: posts land on stone plinths, braces sit
   only at corners and under jetties, jetties rest on projecting joists and a bressummer, chimneys rise through the
   ridge or against a gable, roofs break where the plan breaks. No decorative beams.
2. One carpenter's rod. A 1.2 m bay module governs every building: studs at 0.6 m in close-studded walls, storeys of
   2.4 m, jetties of 0.4 m, windows 0.6 m wide by 1.2 m tall, doors 1.0 by 2.1 m, roof overhangs 0.4 m. Related
   proportions are what make a village read as one hand.
3. Procedural character, never copies. Each asset takes a character seed that sets its lean, stud rhythm, plaster
   tone, roof wear and the placement of imperfections, so no two instances of a type are identical and nothing is
   hand-copied from a reference.

Mixed regional style by function, unified by one timber and roof colour family:

| Function                                    | Style                        | Signature                                                                     |
| ------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Dwellings (house_01 to 03, stable, sawmill) | English Tudor                | close studs, curved braces, cream plaster, slate or oak shingles              |
| Inn, market stands, blacksmith              | German Fachwerk              | wide bays with saltire braces, tinted plaster (ochre, rose), terracotta tiles |
| Bell tower, mill, barracks                  | French colombage proportions | narrow and tall, fine diagonal lattice, steep slate, stone base               |

Personal symbols, approved:

- Crown finial on the bell tower, the island's highest point, echoing the Columbia crown of the professional site.
- One lantern family as the brand mark: the same square iron lantern with amber glass at every door, on the pier, the
  sea marker, the tower and the ship's stern; it is also the favicon and the figure in the loading screen.
- The inn sign carries the QH monogram (initials under a small crown, a lantern below), the island's crest; the same
  crest appears on the ship's stern board.
- Buildings map to the chapters of Qiran's work and the site's sections: bell tower and its archive = Publications;
  mill (grinding data into models) and blacksmith (forging weights) = Research; sawmill (annotation and pipelines)
  and market (open-source skills on the stalls) = Projects; harbor, pier and ship (serving and deployment) =
  Experience; well (long-horizon memory, deep and shared) and schoolhouse-style house_01 = Service and teaching;
  barracks (guardrails, hooks, the security layer) stands by the gate.

Further symbols, all approved by Qiran on 2026-10-31:

1. Pennants and bunting in Columbia blue and white: a swallow-tailed pennant at the ship's masthead (part of the ship
   asset) and a string of bunting across the market square (a phase 3 scene prop, `bunting`, one string of 12 flags).
2. Blue hydrangeas in a half-barrel planter at the door of every dwelling and the inn (phase 3 prop `planter_hydrangea`,
   under 600 triangles, instanced by the site).
3. Quiet year marks: "2022" carved into the lintel over house_01's door as a shallow relief of extruded low-poly glyphs
   (at most 300 triangles), "2026" cast in relief on the bell of the bell tower.
4. The ship is named REVA: the name sits on the stern board above the QH crest, same low-poly glyph method.
5. Weather story: moss on the seaward roof slopes and wall bases (section 10 checklist), and the harbor timber (pier,
   ship, sea marker) tinted two steps greyer than hillside timber in style.py, as if weathered by salt wind.
6. Lamps along the road, integration phase, site code rather than Blender: roadside lanterns light one by one as the
   visitor pages through the deck. The lantern asset therefore keeps its glass as a separate emissive material so the
   site can switch it per instance.
7. Lookout platform on the bell tower just below the belfry: a railed balcony on the seaward side with a brass spyglass
   on a tripod, for the vision research.

## 10. Style integration map and detail level (added 2026-10-31)

Qiran's note on the phase 1 sheet: broadly right, now make it unmistakably ours and finer. The mix below assigns one
dominant regional source per asset, one borrowed accent from a second source, and the shared vocabulary that ties
them together. Sources consulted: Lavenham (Guildhall, Little Hall: jettied close studding, carved two-storey porch,
pargeted plaster), Colmar and Alsace (colombage in sugared-almond tints, flower boxes, canal-side gables), Rothenburg
(the leaning Plönlein house, oriels and turrets, steep roofs, stepped facades), Hanseatic brick Gothic (Lübeck,
Stralsund: stepped gables with pinnacles, blind tracery), Norwegian stave churches (tiered dark roofs, dragon-head
finials), Visby and Colmar as the towns Miyazaki drew on for Koriko and Sophie's town (warm, walkable, every roof a
different pitch), and the Witcher-style environment breakdowns (silhouette first, three depth layers, chamfered edges).

| Asset                       | Dominant source                                                                         | Borrowed accent                                                 | Shared vocabulary                                |
| --------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| house_01 cottage            | Cotswold-Tudor cottage: low eaves, stone-tile roof, deep thatch-style ridge in shingles | Alsace flower box under one window                              | QH lantern at the door, oak frames, 1.2 m module |
| house_02 town house         | Lavenham close studding, jettied twice, carved bargeboards                              | Rothenburg oriel on the first floor corner                      | pargeted panel over the door, slate rows         |
| house_03 long house         | Little Hall plan: hall with cross wing, external stair                                  | Colmar tinted plaster on the wing only                          | shingle rows, stone plinth                       |
| inn                         | Fachwerk wide bays with saltires, ochre plaster, terracotta tiles                       | Lavenham-style two-storey porch with the QH crest sign          | lanterns at the arch                             |
| bell_tower                  | French colombage proportions on a stone base                                            | Hanseatic stepped pinnacles at the belfry corners, crown finial | slate cone, lantern on the stair door            |
| mill                        | stone round base, timber cap in dark stave-church timber                                | dragon-head tail pole finial                                    | shingles on the cap                              |
| blacksmith                  | open Fachwerk forge, stone chimney                                                      | brick Gothic arch at the hearth                                 | iron straps and hooks                            |
| barracks                    | squat stone with timber watch floor                                                     | stepped gable on the gate side                                  | slit windows, lantern at the gate                |
| sawmill, stable             | Tudor shed framing, open bays                                                           | Norse tiered roof on the sawmill saw house                      | plank cladding                                   |
| market stands               | Fachwerk posts, striped canvas                                                          | Colmar tints on the counters                                    | baskets, scales, lantern                         |
| well, cart, fence, fire_pit | Cotswold stone, oak                                                                     | none                                                            | iron hoops, rope                                 |
| pier, ship, sea marker      | Hanseatic harbor timber (tarred, dark)                                                  | ship stern board with the crest                                 | rope, lanterns, Columbia pennants                |

Detail level, raised. Every building now carries, where its type allows: diamond leaded panes on at least one window
(a lattice of thin bars, not a texture), iron door straps with scrolled or arrowhead ends and a ring handle, carved
bargeboards (a scalloped lower edge), a pargeted plaster panel (a shallow relief pattern between studs), chimney pots
in pairs, a sign bracket with the hanging sign, stone steps worn in the middle, a woodpile or barrel at one wall,
moss on the seaward roof slope, and one deliberate imperfection (a missing shingle, a cracked lintel, a leaning
post). Budgets rise to 20k triangles for the inn, bell tower and mill, 14k for houses, 2k for props; vegetation
budgets stay.

Silhouette rule from the environment-art breakdowns: at the overview distance each building must read from its
roof outline alone (a cottage, a tall gabled house, a cross-wing house, a tower, a windmill, an open forge); check
each asset as a black silhouette against the sky before detailing.

## 11. Site brand language (approved 2026-10-31)

The island supplies the website's identity. The UI keeps its cyan and violet as structure; the island adds one warm
accent, the lantern light, and a small set of marks. Everything here is implemented in the site code (src, public,
scripts), not in Blender, and every motion follows the quality bar of section 2 of the memory notes: transforms and
opacity only, 200 to 320 ms, cubic-bezier(0.2, 0.8, 0.2, 1), reduced motion respected.

1. Warm accent token. One new colour, `--lantern: #F0B35B` (amber glass), with a glow variant at 20 to 35% alpha. It is
   used only for lantern marks, progress fills and focus rings, never for text on light backgrounds. On the dark
   site background it contrasts above 9:1.
2. Loader, "Ship to the island". A fixed full-screen overlay on every device, above the hero card. Deep-sea gradient
   (#06101F to #0B1E3F), a wave line (SVG path, 2 px, cool white at 40%) across the lower third, the REVA ship as a
   one-colour silhouette (SVG traced from the ship asset's side view, about 96 px wide on phones and 160 px on
   desktop) riding the wave from 8% to 86% of the width as progress goes 0 to 100, and the island silhouette (SVG
   traced from the overview) on the right, emerging from fog: its opacity and blur follow progress so the fog clears
   as the ship approaches. The ship bobs with the CIS hop constants: 0.668 s cycle, rise 0.24 s, float 0.155 s,
   custom fall ease, squash 0.73 and stretch 1.27 about the base, apex 0.62 of the sprite height; the stern lantern is
   a 4 px amber dot with a soft glow pulsing in the same rhythm. Label "Sailing to the island" with the percentage
   (role="status", aria-live="polite", announced every 10%). At 100% the ship reaches the pier and the overlay fades
   in 700 ms. Reduced motion: the ship sits at the progress position, no bob, no pulse.
3. Favicon and touch icon. The brand lantern (square iron lantern, four amber panes, ring on top) as a 32 px SVG of
   three or four shapes, plus a 180 px apple-touch-icon rendered from it; theme-color #0B1E3F.
4. Deck pager as lanterns. One small lantern glyph per deck section, vertical at the right edge on desktop and
   horizontal at the bottom on phones. The current section's lantern is lit (amber panes and glow, 300 ms ease);
   the others are outlines at 40%. Each is a button with an aria-label naming the section; hover and focus show the
   name. This is the same gesture as the road lanterns lighting in the scene (section 9, item 6).
5. Hero card seal. The QH crest (initials under a small crown, a lantern below) redrawn as a 28 px SVG mark in a
   corner of the hero card at 60% opacity, no animation. The same SVG is the inn sign's reference drawing.
6. Focus and hover. 2 px amber outline on focus-visible; hover glow on interactive chips is amber at 20%, 240 ms,
   transform and opacity only.
7. 404 page. Dark sea, the sea marker (buoy with a lit lantern) bobbing with the same hop constants (static under
   reduced motion), the line "You have drifted off the chart." and a link "Back to the harbor" to the site root, in
   the site's fonts.
8. Open Graph image. A 1200 by 630 PNG of the integrated scene at sunset with the ship in the harbor, captured from a
   dedicated camera preset (Playwright screenshot at 2x, then downscaled) and wired as og:image and twitter:image by
   scripts/seo.mjs.

Verification: unit tests for the loader's progress-to-position mapping and the pager's lit index; Playwright shots of
the loader at 0, 50 and 100%, the 404 page and the pager on desktop and phone; reduced-motion probes; Lighthouse
accessibility stays at 100.

## 12. Lighting and weather (approved 2026-10-31, with Qiran's changes)

1. Time of day. Default "late afternoon into dusk": the key light comes low from the sea in the west, warm (about
   3200 K), with long soft shadows (two shadow cascades on desktop, one on phones); the sky is a graded dome. Over
   about six minutes of reading the light drifts from golden hour to blue hour, and the lanterns and windows ramp up
   their emissive as the sun drops, which is the "cold night, warm windows" look of the island itself. Qiran's rule: the sun follows the visitor's real local time, so the island is lit by the actual hour of the day (midday sun, afternoon gold, dusk, night with lanterns), and the season follows the real date (section 14, item 4). The six-minute drift is kept as a gentle acceleration on top of the clock so a reader sees the light move. Under reduced motion the phase is fixed at the current hour.
2. Wind from the sea. One shared wind field drives the ship's pennant, the bunting, the barracks flag and the tree
   canopies (vertex offset by height, not full physics), and chimney smoke drifts landward. The same direction weathers
   the seaward faces in the models, so the scene and the materials tell one story.
3. Water and air. Foam lines along the shore and the pier posts, a gentle swell that bobs the ship and the sea marker,
   height fog over the water that thickens at dusk, and slow cumulus shadows drifting across the island from a
   projected cloud texture. Weather is on by default and runs as a cycle: mostly clear, drifting cloud shadows, and a short light shower every so often (a few minutes at most), never constant rain.
4. Budget. Shadow map 2048 on desktop and 1024 on phones, no post-processing on phones, fog and clouds in the main
   pass; every effect is measured in the performance pass and dropped on devices that cannot hold 60 fps.

## 13. Vegetation and props redesign (2026-10-31, Qiran: "很新颖，很不一样")

The phase 3 set reads like any low-poly pack: lobed blob canopies, round boulders, generic tufts. It is rebuilt in a
language of its own, drawn from two sources that belong to this island: the umbrella trees ("boqueteaux") of
fifteenth-century French manuscript miniatures, and the wind-sculpted flag trees of exposed coasts. The rules:

1. Manuscript umbrella canopies. A tree is two to four stacked umbrella domes, each a flat-bottomed cap with a
   scalloped rim (six to nine scallops), smaller toward the top, slightly offset from one another; the trunk is thin,
   gently curved, with a visible collar where it enters the lowest dome, and two or three short branch stubs between
   domes. Vertex colours do the painting: each dome is one green, its top band a lighter warm green toward the key
   light (west, from the sea), its underside a cool dark green, so the silhouette reads as layered parasols at any
   distance. No two trees share dome counts and rim phases (character seed).
2. Sea wind. Every tree carries an exposure value from its distance to the shore (set per instance at integration,
   baked into the base and _b variants as 0.2 and 0.8). Exposure shears the domes landward, shortens the windward
   rim, leans the trunk 3 to 8 degrees and bends the top. Shore trees are flag trees; inland trees stand upright.
   Cypresses become candle flames: tall spiral-faceted columns with a slight twist and a landward bend at the tip.
3. Greens by place. Canopies shift blue-green near the sea (salt), yellow-green inland, with the dusk highlight band
   in warm amber on the west faces; the moss on rocks and roofs uses the same family.
4. Rocks as stacked slate. Boulders and moss rocks are stratified: three to seven horizontal plates with small
   offsets and chipped edges, the same slate family as the roofs, moss only on the top plate and the lee side.
5. Ground cover combed by the wind. Grass tufts bend the same way as the trees (exposure-driven), tips lighter;
   flowers in the brand colours: gazania becomes an amber marigold cluster, dandelion keeps its seed head, sorrel
   has red stems, and a new `cornflower` clump in Columbia blue joins the planter hydrangea.
6. Medieval garden pieces, new assets: `hedge_box` (a clipped box sphere and a clipped cube, for doors and paths),
   `raised_bed` (a wattle-edged raised bed with herb rows, one per dwelling), `espalier` (a fan-trained fruit tree
   flat against a wall on a trellis, for the inn's south wall), `arbour` (a small rose-covered arch over the path
   to the well). Budgets: under 1,200 triangles each, single material with vertex colours like all vegetation.
7. Props with the owner's mark. Barrel heads carry a burnt QH brand, crates a stencilled crest, every third fence
   post has a lantern hook, the cart flies a small Columbia pennant, the fire pit's embers are an emissive patch in
   the lantern amber, the well has its bucket on the windlass, market goods are in the brand colours.
8. Seasons, prepared here and switched in the site (section 14, item 4): canopy and grass greens stay within a known
   hue range so a per-season tint shifts them to ochre in autumn; snow is added at runtime on upward-facing
   normals, so top surfaces of domes, plates and roofs must have clean upward normals; spring adds blossom dots on
   the fruit trees through an emissive tint of the dome rims.

Verification as before: single mesh and single material for every vegetation and garden asset, proportions within
the section 3 table for assets the site already fits, silhouette sheet, night and day sheets, re-import check.

## 14. Living island features (approved 2026-10-31, all on by default)

1. Buildings as the table of contents. Each building maps to a chapter (section 9): hovering a building lights its
   windows and lanterns and shows the chapter name on a small parchment label; clicking it pages the deck to that
   chapter. Keyboard: the buildings are focusable in deck order with the same label.
2. Hand-drawn island map. An SVG parchment map of the island with every building and its chapter, used as the
   chapter index (opened from the lantern pager), as the 404 backdrop alternative and as a fallback share image.
3. Bell tower chime. On first arrival and whenever the deck reaches Publications, the bell swings once and the
   "2026" bell rings a soft single note (sound follows item 5); the animation always plays, reduced motion shortens
   it to a single swing without ringing.
4. Seasons by the visitor's date. Winter puts a thin snow cap on roofs, domes and plates (shader, upward normals),
   autumn shifts canopy and grass greens to ochre, spring adds blossom on the fruit trees, summer is the base look;
   the transition dates are the solstices and equinoxes, and the time of day follows the real clock (section 12).
5. Ambient sound. Sea, gulls, wind in the bunting and the distant bell, on by default and started on the first
   user gesture because browsers block earlier autoplay; a lantern-icon toggle in the corner mutes it and remembers
   the choice in localStorage; the deck's chime shares the same mixer.

## 15. Performance contract (Qiran, 2026-11-01: no stutter anywhere, no quality lost)

The rule: performance comes from structure, not from lowering the picture. Quality is reduced only as the last
step, only on devices that still miss the budget after every structural measure, and only in ways that are not
visible at that device's pixel size.

1. Budgets, measured not guessed. Desktop 1440x900: p95 frame time at or under 16.7 ms while paging through the
   whole deck, no frame over 50 ms after load. Phone (emulated Pixel 7, 4x CPU throttle): p95 at or under 33 ms,
   no frame over 100 ms. Zero long tasks over 50 ms after the loader fades. Time to first island frame under 2.5 s
   on a fast connection and under 6 s on throttled 4G. Every pass that follows (lighting, living features) must
   re-run this measurement and stay inside the budget before it is accepted.
2. Load in layers. The React shell and the loader ship first; the three.js scene is a lazy chunk; routes, the deck
   sections and heavy UI split by route. Models load by priority: hero view (island ground, harbor, the buildings
   in the first frame) first, the far village next, vegetation last and in chunks so no single frame parses
   everything. Draco and glTF parsing run in a worker; instanced vegetation is uploaded in slices across frames.
   Fonts, the draco decoder and the first-view GLBs get preload hints; everything else loads after first paint.
3. Keep per-frame work bounded. No React state updates inside the render loop; animations drive refs and
   uniforms. No allocations in hot paths (reuse vectors, matrices and arrays). Static shadow maps update only when
   the sun or the scene changes, not every frame. The ocean reflection renders at half resolution and on
   alternate frames; bloom at half resolution. Frustum culling on, static objects merged or instanced, materials
   shared (the phase 4 bake), textures compressed (KTX2) and mipmapped.
4. Transitions never drop frames. Camera moves, lantern fades and section changes are tweened on the GPU side or
   with cheap scalar updates; heavy work (loading, instancing, layout) is scheduled outside transitions.
5. Memory stays flat. No growth in JS heap across a full page-through; geometries and textures disposed when a
   section leaves; worker pools reused.
6. Quality, last. Allowed only after 1 to 5 are exhausted on a device still over budget, in this order: cap device
   pixel ratio at 2 (invisible on 3x phones), halve the shadow map on phones, drop the ocean reflection to a
   static environment on phones. Never: lower model detail, remove vegetation, disable lanterns or windows, or
   change the palette.
7. Evidence. Playwright plus CDP performance traces for the scripted page-through on both profiles: frame-time
   p50, p95, p99, long-task count, heap before and after, loading timeline, chunk sizes, model bytes per priority
   stage, all recorded before and after each pass under Desktop/Job/to_be_deleted/perf_<date>/.

## 16. Sea and sky in the island's own language (Qiran, 2026-11-01)

The water and the sky still come from the old scene: a reflective grey-blue ocean with a mirror pass and round
cloud sprites. They are redesigned to the same manuscript-and-sea-wind language as the island, and the redesign
is also the first performance step, because the mirror pass is the most expensive thing in the frame.

1. Water. A two-tone painted sea, deep navy (#0B1E3F family) to teal in the shallows, with no planar reflection
   pass: the sky colour and the sun's glitter band are computed in the water shader instead. Wave crests are
   scalloped bands in the loader's wave line, drawn as a slow Gerstner-style displacement with a vertex-colour band
   on the crest, moving with the wind from the sea (section 12). Foam: a soft white ring where the water meets the
   island cliff and the pier posts, a wake line behind the moored ship's bow and stern, and crest foam only on the
   larger swells. Depth tint: a shallow teal halo around the island so the cliff reads as standing in water.
2. Sky. A dusk gradient dome in the site's palette that follows the real clock (section 12). Clouds are
   manuscript clouds: flat-bottomed, scalloped-top cumulus drawn as a few overlapping soft shapes, lit warm from
   the west, drifting landward with the wind, and they are the source of the cloud shadows. The round sprite
   clouds are removed.
3. Horizon. A faint sea haze band merges water and sky at the horizon so the island floats in air and light, not
   on a hard line.
4. Brand ties. The sea colour family, the wave line and the cloud silhouettes are the same shapes the loader and
   the 404 page use, so the first frame of the 3D scene continues the loading screen without a visual cut.
5. Budget. One water mesh with a vertex shader for the swell and a fragment shader for colour, foam and glitter;
   no render-to-texture; clouds as a handful of instanced shapes with soft normals; fog in the main pass. Measured
   under the section 15 contract before and after, with the mirror pass's draw calls and milliseconds reported as
   the saving.

## 13b. Vegetation, second direction: stylized realism (Qiran, 2026-11-01)

Qiran's verdict on the umbrella trees in the scene: "树也不逼真", and "树的质量可以更高，然后草，花朵，草地可以更逼真".
The manuscript silhouettes stay as a brand idea for the loader and the map, but the living plants on the island
move to stylized realism: the foliage of Ghibli backgrounds and Breath of the Wild, dense and believable, painted
rather than symbolic, still flat-lit enough to sit beside the low-poly buildings.

1. Species, each with a real silhouette: oak (broad, layered clusters, thick forked trunk), ash (taller, open
   crown), birch (white trunk with dark marks, light airy crown, near the shore), spruce (conical, tiered, on the
   ridge), apple (small, spreading, blossom in spring, fruit in late summer) for the orchard, hawthorn and box
   bushes; the cypress stays as the vertical accent but gains a textured surface.
2. Construction: trunk and branches from a real branching skeleton (three to four orders, tapering, slight twist,
   roots flaring at the base); the canopy from 40 to 120 leaf-cluster cards facing outward from three to six
   cluster centres, each card showing one of eight cluster sprites from an atlas we render ourselves in Blender
   (leaf geometry lit from above, baked to a 1024 px alpha atlas with the light-to-shadow gradient painted in);
   vertex colour on every card for depth (dark toward the centre, light outside, warm toward the west key light)
   and a wind weight (upper cards sway more); alpha-tested, double-sided, ONE material per species family (atlas
   plus vertex colour), so instancing holds.
3. Grass: clumps of six to twelve blade cards from a grass atlas (three clump sprites), vertex colour root-dark and
   tip-light, wind weight, density three times today's; the flat green ground gets a painted tileable texture with
   clover and worn-earth patches we generate (1024 px, KTX2) and path edges blend into it. Flowers become petal
   cards from a flower atlas (marigold, cornflower, daisy, poppy), twenty to forty cards each, readable at walk
   scale on their own, so the 2x readability exception goes away.
4. Rocks keep the slate strata but gain a painted texture (layers, lichen) and rounder, more believable silhouettes.
5. Budgets: tree 4k to 8k triangles, four atlases of 1024 px, grass clump under 300, flowers under 400, bushes under
   1,500; still one mesh and one material per asset; measured under section 15.

## 17. Island v2: relief, landscape, atmosphere and life (approved by Qiran 2026-11-01, castle and watermill included)

Qiran: "目前看起来太平了，应该有山啊，城堡啊", then "还是感觉少了一点什么，可以做成更逼真的那种有上下起伏的路或者小山丘之类的".
What is missing is not one object but four layers that real places have and the flat disc lacks: relief,
ground, mid-scale landscape, and life. The plan treats each.

**1. Relief.** The island becomes a landform designed by hand as a heightmap (never noise alone): rolling
meadows with hummocks of two to four metres so the road rises and falls and houses sit on slight rises; a
ridge climbing to a rocky peak in the north-east at about three bell-tower heights; a crag below it; cliffs on
the exposed north and east; a sheltered bay with a beach and a stone breakwater on the south-west; a headland
to the west for the lighthouse; terraces on the south-west slope for the village and an orchard; a spring on
the ridge feeding a stream that runs through a mill pond past a watermill into the bay, crossed by a stone
bridge. Roads follow the ground: cobbles in the village, gravel and worn earth outside, with camber, cut-and-
fill banks on slopes, and switchbacks up to the castle; the walk camera follows the road height with a gentle
rise and fall.

**2. Ground.** One terrain mesh (about 40k triangles) with vertex colours that blend four painted textures we
generate: meadow grass with clover and worn patches, dark earth, gravel and cobble, and sand; rock on cliffs
and the crag; wet sand at the waterline; road edges blend into grass with tufts and ruts instead of a hard
line; puddles on the earth lanes after the weather cycle's showers.

**3. Landscape and props at mid scale.** Hedgerows and dry-stone walls along fields; two or three small fields
and the orchard in rows; haystacks; the mill pond with reeds; boats pulled up on the beach, nets and lobster
pots at the pier; a signpost at each junction; a wayside shrine; a standing-stone ring on the hill (the owner's
mark, a QH stone); stone steps where terraces meet; the castle keep with curtain wall and two towers on the crag
(the barracks grows into it); the lighthouse on the headland; two sea stacks off the north-east cliffs and a small
islet on the horizon for depth.

**4. Atmosphere and life.** From sections 12 and 16: the painted sea with foam at the shore, manuscript clouds
with shadows, height fog in the bay at dusk, light shafts through the clouds; and the small motions that make a
place feel inhabited: chimney smoke drifting landward, the water wheel and the windmill turning, gulls circling
the harbor, boats and the ship bobbing on the swell, washing lines moving, lantern flames flickering at night,
the bell swinging on the hour.

**Method.** Terrain: sculpted in Blender from the hand-made heightmap, exported as one GLB with vertex colours
plus the heightmap PNG; the site samples the heightmap to place every object at ground height, projects the road
splines onto the surface and builds the road mesh with camber, and drives the camera route with height. Roads:
one clean loop (harbor, village street, square, switchbacks, castle gate), a path to the lighthouse, the arbour
path to the well; every junction a plain T or Y. Water level fixed; the island outline exported for the sea
shader. Scale: factor 1.30 as chosen; the island sized around the village so it fills the first frame. Budget:
measured under section 15 at every step; the terrain and the props are instanced and batched like everything
else.

**Order.** Vegetation 13b (in progress) and the terrain sculpt in Blender run back to back; the site-side sea,
sky and lighting pass (16 and 12) runs meanwhile; then the terrain integration replaces the flat island, roads
and placements; then vegetation and the mid-scale props land on the new ground; then life animations with the
living features (14); then the performance foundation and the final audit.

**Heightmap specification (authoritative; the plan artifact draws exactly this).** Map space is 1000 by 700 px
with north at the top and 1 px = 0.6 m, so the island is about 470 by 320 m; heights are fractions of the peak,
where 1.0 is 46 m (three bell-tower heights). Landforms compose by maximum over the base so no feature stacks on
another; the stream and the pond are carved afterwards; roads are relaxed last. smooth(a, b, t) is a smoothstep
and gauss(c, s) a Gaussian of sigma s with height 1 at its centre.

- Island mask m: superellipse of exponent 2.4 centred (500, 360), radii 390 by 265, rotated 12 degrees
  counter-clockwise; m = 1 - smooth(1 - soft, 1 + soft, r) with soft 0.08 on the south and west and 0.03 (cliffs)
  on the north and east, the polar angle measured with y up between 0.2 and 2.4 rad. The harbour bay is cut as
  the union of two ellipses, centre (330, 560) radii 80 by 50 and centre (268, 592) radii 92 by 60, e being the
  smaller normalised distance: m -= 1.2 * (1 - smooth(1, 1 + bs, e)) with bs = (2 + 14 * smooth(0, 30, dq)) / 60,
  dq the distance to the quay segment (340, 512)-(392, 500), so the edge is a 2 px wall along the quay and a 16 px
  beach elsewhere; m is clamped to [-1, 1]. The bay opens to the sea on the south-west; the pier end (305, 540)
  and the ship lie in open water.
- Sea: outside the island the floor starts at 0 on the waterline and falls to -0.3 over about 80 px, as
  -0.3 * smooth(1 + soft, 1.25 + soft, r) on the superellipse radius; inside the bay cut it is -0.3 * min(1, -m),
  2.8 m deep at the bay centre; the two combine by minimum so there is no step at the shore. The beach is the
  soft land edge inside the bay.
- Base: rise(b) = 0.05 + 0.22 * smooth(-150, 330, b) with b = x - y, a gentle slope from the bay (2.3 m) up to the
  knoll foot (12 m), plus hummocks gauss(c, 55) of amplitude 0.07 (3.2 m) at (575, 500), (480, 545), (615, 540),
  (380, 380), (300, 420), (760, 450), (260, 480), (340, 290), (520, 240), (660, 540) and (780, 330), so the road
  rolls over them east and south of the village.
- Village terraces are cut into that slope, never added on top: risers at b = -118, -62, -6, 50 and 106, each 12
  px wide (smooth(riser - 6, riser + 6, b)); every tread sits at rise() of its own centre, the first at rise(-139)
  and the last, from 106 to 170, at rise(138); the replacement (tread - rise(b)) fades with
  1 - smooth(110, 170, distance to (440, 445)). Resulting heights: quay 0.083 (3.8 m), street 4.9 m, square
  6.8 m, upper village 7.7 m, with 1.2 to 2 m retaining walls and stone steps between treads.
- Ridge: segment (655, 262) to (745, 200), crest 0.30 at the knoll end rising to 0.80, lateral gauss sigma 55.
- Peak: gauss((745, 200), 60) amplitude 1.0, the only point at 1.0; its north and east flanks fall into the sea as
  the cliffs.
- Castle knoll: gauss((640, 275), 55) amplitude 0.40, flattened to 0.40 inside radius 28 px (the bailey, 18.4 m);
  north of y = 261 and inside radius 48 the height is capped at 0.24, a 15 px cliff. The keep with its curtain
  wall and two towers stands on the flat top; the gatehouse is on the ring at the knoll's south foot (640, 312) at
  13.3 m, 5 m below the bailey, joined to it by a short paved ramp with retaining walls that is not part of the
  ring.
- Headland: gauss((205, 335), 50) amplitude 0.30, the lighthouse at its top (13.8 m).
- Stream: polyline (642, 308) spring at the knoll's south-east foot, (636, 352), (606, 388), (566, 412), (530, 428)
  mill pond, (480, 462), (436, 496), (398, 524) mouth; carved 0.03 deep with gauss sigma 10 across; the pond is a
  disc of radius 16 at (530, 428) carved 0.04 deeper. The water surface falls monotonically from 14 m to the bay.
  The watermill stands at the pond's south-west outlet (511, 441) on the riser below the pond tread, an overshot
  wheel fed from the pond; the mill lane leaves the ring at (490, 400) via (500, 422). The stone bridge carries the
  ring over the stream mouth at (398, 524) between the beach and the quay as a humpback: the road rises 0.8 m over
  12 px there, which gives the arch 1.5 m of clearance over the water.
- Off the island: sea stacks gauss sigma 12 at (905, 215) amplitude 0.30 and (935, 265) amplitude 0.25, 57 and
  39 px off the cliffs; the islet gauss sigma 25 at (900, 90) amplitude 0.20. Each stands where its own Gaussian
  exceeds 0.02, at amplitude * gauss - 0.02 (tops 12.9, 10.6 and 8.3 m), and the sea floor elsewhere, so nothing
  joins them above water.
- Roads, a closed ring like today's deck route so paging wraps from the last stage back to the first with the
  same route logic (one closed curve with t from 0 to 1, stage anchors at fixed t, lanterns along it, side paths
  as spurs): quay (365, 505), village street (380, 470), (415, 445), square (450, 420), upper village (490, 400),
  the approach (520, 382), (552, 368), (584, 362), (612, 344), castle gate (640, 312), knoll east (668, 306), east
  leg (690, 320), (704, 350), (704, 385), (690, 415), (662, 442), (630, 462), fields (595, 485), (530, 515),
  orchard (460, 535), beach (405, 528), back to the quay: 869 px, 521 m. Spurs: the lighthouse path from the
  square (380, 400), (300, 380), (250, 352), (205, 335); the arbour path from the square to the well (470, 445);
  the mill lane (490, 400), (500, 422), (511, 441). The pier runs from the quay into the bay to (305, 540); the
  breakwater arm closes the bay's south side and leaves the entrance on the south-west.
- Road relaxation (built, not drawn): sample the terrain along each road at 1 px, smooth over 15 px, clamp the
  grade to 10% on the ring and 15% on spurs (mean of the lower and upper grade envelopes), then blend the terrain
  to the road height fully within 6 px of the centreline and fading to nothing at 16 px, which is the cut and fill;
  camber goes on top. With these numbers the ring needs at most 0.8 m of cut or fill (mean 0.13 m) and the
  lighthouse path 1.3 m. Cobbles inside the village terraces, gravel and earth outside.
