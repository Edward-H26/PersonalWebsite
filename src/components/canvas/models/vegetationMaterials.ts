import { useFrame, useLoader, useThree } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { WIND_DIRECTION } from "@/components/canvas/environment/wind"
import { islandAtlas } from "@/config/modelPaths"
import { ISLAND_UNITS_PER_METRE } from "@/config/modelSizes"
import { ENV_MAP_INTENSITY } from "@/hooks/useRealtimeMaterials"
import { useReducedMotion } from "@/hooks/useReducedMotion"

/**
 * The material families of blender/island's plants and rocks. Every GLB of a family names its one
 * material after the family and ships without an image, so the whole family shares one material over
 * one atlas and every model still draws as a single instanced mesh. Cards are the leaf, blade and
 * petal quads cut out of their atlas; rock is solid.
 */
const FAMILIES = {
  isl_foliage: { atlas: "foliage", cards: true },
  isl_grass: { atlas: "grass", cards: true },
  isl_flowers: { atlas: "flowers", cards: true },
  isl_rock: { atlas: "rock", cards: false }
} as const

export type VegetationFamily = keyof typeof FAMILIES

export const VEGETATION_FAMILIES = Object.keys(FAMILIES) as VegetationFamily[]

const ATLAS_URLS = VEGETATION_FAMILIES.map((family) => islandAtlas(FAMILIES[family].atlas))

const CARD_ALPHA_TEST = 0.5
const CARD_ROUGHNESS = 0.8
/** The roughness the rock GLBs are authored with. */
const ROCK_ROUGHNESS = 0.9
/** Anisotropic filtering keeps the atlases crisp at grazing angles; past 8 taps the difference is invisible. */
const MAX_ANISOTROPY = 8

/** How far a card's tip travels at the crest of the wind wave, in metres of the model. */
const WIND_STRENGTH = 0.12

/**
 * Grass thins out from this far from the camera and is gone by GRASS_FADE_END_M. Further off its blades shrink below a
 * pixel long before its shaded roots do, so the clumps would read as dark dots; the ground's own grass carries the meadow there.
 */
const GRASS_FADE_START_M = 40
const GRASS_FADE_END_M = 60
/** The grass's baked root shade, lifted: its vertex colour is multiplied by this at the root, easing to 1 at the tips. */
const GRASS_ROOT_LIFT = 1.15

// One set of uniforms shared by every card material and its shadow, so one write per frame moves them all.
const windUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: WIND_DIRECTION },
  uWindStrength: { value: WIND_STRENGTH }
}

const WIND_DECLARATIONS = /* glsl */ `
attribute vec4 color_1;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
`

// COLOR_1 carries the wind: r how far the vertex sways (0 at the root, 1 at the tip), g its phase
// (close along one branch), b 1 on leaf, blade and petal cards and 0 on wood. The model's origin, or
// the instance's, delays the phase downwind so gusts roll across the island instead of beating in step.
const WIND_DISPLACEMENT = /* glsl */ `
mat4 windModel = modelMatrix;
#ifdef USE_INSTANCING
  windModel = modelMatrix * instanceMatrix;
#endif
vec3 windWorld = vec3( uWindDir.x, 0.0, uWindDir.y );
vec3 windLocal = normalize( vec3( dot( windModel[ 0 ].xyz, windWorld ), dot( windModel[ 1 ].xyz, windWorld ), dot( windModel[ 2 ].xyz, windWorld ) ) );
float windPhase = color_1.g * 6.2831853 - dot( windModel[ 3 ].xz, uWindDir ) * 0.07;
float windWave = 0.7 * sin( uTime * 1.6 + windPhase ) + 0.3 * sin( uTime * 3.7 + windPhase * 1.7 );
transformed += windLocal * ( color_1.r * uWindStrength * ( 0.6 + 0.4 * color_1.b ) * windWave );
`

/**
 * Sways a card material, or its shadow, with the shared wind. The foliage and flower cards use this same
 * function, so three.js compiles one program for both; the grass adds its own shading on top.
 */
function addWind(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, windUniforms)
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${WIND_DECLARATIONS}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WIND_DISPLACEMENT}`)
}

// COLOR_1.r is 0 at a blade's root, so it also weighs the root lift. The fade lowers the alpha the hash then dithers.
const GRASS_ROOT_SHADE = /* glsl */ `
vColor.rgb *= mix( ${GRASS_ROOT_LIFT.toFixed(2)}, 1.0, color_1.r );
`
const GRASS_FADE = /* glsl */ `
diffuseColor.a *= 1.0 - smoothstep( ${(GRASS_FADE_START_M * ISLAND_UNITS_PER_METRE).toFixed(1)}, ${(GRASS_FADE_END_M * ISLAND_UNITS_PER_METRE).toFixed(1)}, length( vViewPosition ) );
`

/** The grass's wind, plus its lifted roots and its fade with distance. */
function addGrassShading(shader: THREE.WebGLProgramParametersWithUniforms) {
  addWind(shader)
  shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>", `#include <color_vertex>\n${GRASS_ROOT_SHADE}`)
  shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `${GRASS_FADE}\n#include <alphatest_fragment>`)
}

function configureAtlas(atlas: THREE.Texture, wrap: THREE.Wrapping, anisotropy: number) {
  atlas.colorSpace = THREE.SRGBColorSpace
  // glTF texture coordinates start at the image's top-left corner.
  atlas.flipY = false
  atlas.wrapS = wrap
  atlas.wrapT = wrap
  atlas.anisotropy = anisotropy
  atlas.needsUpdate = true
}

function cardMaterial(family: VegetationFamily, map: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({
    name: family,
    map,
    alphaTest: CARD_ALPHA_TEST,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: CARD_ROUGHNESS,
    metalness: 0,
    envMapIntensity: ENV_MAP_INTENSITY
  })
  material.onBeforeCompile = addWind
  return material
}

/**
 * The grass's cards hash their alpha instead of cutting it at a threshold, so a clump whose blades are thinner than a
 * pixel keeps them as a sparse dither rather than shrinking to its dark root, and dissolves as it fades with distance.
 * Alpha to coverage would do this more smoothly, but the scene renders without multisampling.
 */
function grassMaterial(map: THREE.Texture) {
  const material = cardMaterial("isl_grass", map)
  material.alphaTest = 0
  material.alphaHash = true
  material.onBeforeCompile = addGrassShading
  return material
}

/** The shadow of a card family: cut out of the same atlas, so leaves cast leaves rather than squares, and swaying with them. */
function cardDepthMaterial(map: THREE.Texture) {
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: CARD_ALPHA_TEST })
  depth.onBeforeCompile = addWind
  return depth
}

function rockMaterial(map: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    name: "isl_rock",
    map,
    vertexColors: true,
    roughness: ROCK_ROUGHNESS,
    metalness: 0,
    envMapIntensity: ENV_MAP_INTENSITY
  })
}

export type VegetationMaterials = {
  /** The shared material of each family, by the material name its GLBs carry. */
  materials: Readonly<Record<VegetationFamily, THREE.Material>>
  /** The shadow depth materials of the card families, by the same names. */
  depthMaterials: Readonly<Partial<Record<VegetationFamily, THREE.Material>>>
}

/** Builds the family materials over their atlases, configuring each atlas for its family. */
export function createVegetationMaterials(
  atlases: Readonly<Record<VegetationFamily, THREE.Texture>>,
  maxAnisotropy: number
): VegetationMaterials {
  const anisotropy = Math.min(maxAnisotropy, MAX_ANISOTROPY)
  const materials = {} as Record<VegetationFamily, THREE.Material>
  const depthMaterials: Partial<Record<VegetationFamily, THREE.Material>> = {}
  for (const family of VEGETATION_FAMILIES) {
    const map = atlases[family]
    if (FAMILIES[family].cards) {
      configureAtlas(map, THREE.ClampToEdgeWrapping, anisotropy)
      materials[family] = family === "isl_grass" ? grassMaterial(map) : cardMaterial(family, map)
      depthMaterials[family] = cardDepthMaterial(map)
    } else {
      configureAtlas(map, THREE.RepeatWrapping, anisotropy)
      materials[family] = rockMaterial(map)
    }
  }
  return { materials, depthMaterials }
}

function disposeVegetationMaterials({ materials, depthMaterials }: VegetationMaterials) {
  for (const material of [...Object.values(materials), ...Object.values(depthMaterials)]) material.dispose()
}

/**
 * The rock family's atlas, which the island's ground also lays on its cliffs. It is the very texture the rock
 * material draws with, since useLoader keeps one load per list of URLs, and useVegetationMaterials sets it up:
 * repeating, sRGB, and unflipped as glTF lays out its images.
 */
export function useRockAtlas() {
  return useLoader(THREE.TextureLoader, ATLAS_URLS)[VEGETATION_FAMILIES.indexOf("isl_rock")]
}

/**
 * Loads the four atlases once and returns the shared family materials with the wind running: one
 * frame callback advances it, and it stays still for visitors who prefer reduced motion.
 */
export function useVegetationMaterials(): VegetationMaterials {
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  const atlases = useLoader(THREE.TextureLoader, ATLAS_URLS)
  const reducedMotion = useReducedMotion()

  const vegetation = useMemo(() => {
    const byFamily = Object.fromEntries(VEGETATION_FAMILIES.map((family, i) => [family, atlases[i]]))
    return createVegetationMaterials(byFamily as Record<VegetationFamily, THREE.Texture>, maxAnisotropy)
  }, [atlases, maxAnisotropy])

  useEffect(() => () => disposeVegetationMaterials(vegetation), [vegetation])

  useEffect(() => {
    windUniforms.uWindStrength.value = reducedMotion ? 0 : WIND_STRENGTH
  }, [reducedMotion])

  useFrame(({ clock }) => {
    windUniforms.uTime.value = clock.elapsedTime
  })

  return vegetation
}
