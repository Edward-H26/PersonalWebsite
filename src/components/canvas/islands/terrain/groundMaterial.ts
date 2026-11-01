import * as THREE from "three"
import { ENV_MAP_INTENSITY } from "@/hooks/useRealtimeMaterials"

/** The ground textures terrain.glb's COLOR_1 weighs, in its channel order (terrain.json mesh.COLOR_1). */
export const SPLAT_CHANNELS = ["grass", "earth", "gravel", "sand"] as const

/** The textures the ground blends: the four splat channels, the gravel channel paved as cobbles in the village. */
export const GROUND_LAYERS = ["grass", "earth", "gravel", "cobble", "sand"] as const
export type GroundLayerName = (typeof GROUND_LAYERS)[number]

/** Each ground texture and the metres one repeat covers, as public/models/island/atlases.json records them. */
export const GROUND_TEXTURES: Readonly<Record<GroundLayerName, { atlas: string; tileMetres: number }>> = {
  grass: { atlas: "ground", tileMetres: 4 },
  earth: { atlas: "ground_earth", tileMetres: 4 },
  gravel: { atlas: "ground_gravel", tileMetres: 2.5 },
  cobble: { atlas: "ground_cobble", tileMetres: 3 },
  sand: { atlas: "ground_sand", tileMetres: 4 }
}

/** One ground texture and the metres one repeat of it covers. */
export type GroundLayer = { map: THREE.Texture; tileMetres: number }

/** A splat channel's vertices are averaged for its paint once the channel weighs this much there. */
const DOMINANT_WEIGHT = 0.85

/**
 * The mean colour painted under each splat channel, in linear RGB and in SPLAT_CHANNELS order: COLOR_0
 * averaged over the vertices where that channel's COLOR_1 weight dominates, or over every vertex for a
 * channel that dominates none.
 */
export function paintMeans(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const paint = geometry.getAttribute("color")
  const splat = geometry.getAttribute("color_1")
  const sums = SPLAT_CHANNELS.map(() => ({ colour: new THREE.Vector3(), count: 0 }))
  const overall = new THREE.Vector3()
  const colour = new THREE.Vector3()
  for (let v = 0; v < paint.count; v += 1) {
    colour.set(paint.getX(v), paint.getY(v), paint.getZ(v))
    overall.add(colour)
    const weights = [splat.getX(v), splat.getY(v), splat.getZ(v), splat.getW(v)]
    weights.forEach((weight, channel) => {
      if (weight < DOMINANT_WEIGHT) return
      sums[channel].colour.add(colour)
      sums[channel].count += 1
    })
  }
  overall.divideScalar(Math.max(paint.count, 1))
  return sums.map(({ colour: sum, count }) => (count > 0 ? sum.divideScalar(count) : overall.clone()))
}

/** Where the gravel channel is laid as cobbles: a circle round the village, in scene units, soft between its radii. */
export type CobbleArea = { centre: THREE.Vector2; inner: number; outer: number }

/** Metres above the water within which the shore stays wet. */
const WET_SHORE_METRES = 0.5
/** Wet ground: darker and a little cooler than dry. */
const WET_TINT = new THREE.Color(0.62, 0.64, 0.68)
const ROUGHNESS = 0.95

const VERTEX_DECLARATIONS = /* glsl */ `
attribute vec4 color_1;
varying vec4 vSplat;
varying vec3 vGroundWorld;
varying vec3 vGroundNormal;
`

const VERTEX_SPLAT = /* glsl */ `
vSplat = color_1;
vGroundWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vGroundNormal = normalize( mat3( modelMatrix ) * objectNormal );
`

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform sampler2D uGrass;
uniform sampler2D uEarth;
uniform sampler2D uGravel;
uniform sampler2D uCobble;
uniform sampler2D uSand;
// Per layer, in GROUND_LAYERS order: scene units one repeat covers, and the mean colour.
uniform float uTileUnits[ 5 ];
uniform vec3 uPaintMean[ 4 ];
uniform vec4 uCobbleArea;
uniform float uWetUnits;
uniform vec3 uWetTint;
varying vec4 vSplat;
varying vec3 vGroundWorld;
varying vec3 vGroundNormal;
`

// The ground's colour is the textures blended by COLOR_1's weights, each in its own colours, times
// COLOR_0, the colour painted in Blender, over the paint's mean for those weights: the paint tints the
// textures where it departs from its usual colour (the sea-greens by the shore, the lighter and darker
// patches of meadow) without doubling their colour. Gravel also covers the bare rock of the cliffs, so it
// is projected from all three axes; the rest lies on gentle ground and is projected from above. Inside the
// village the gravel is cobbles.
const FRAGMENT_SPLAT = /* glsl */ `
vec2 groundXZ = vGroundWorld.xz;
vec3 cliff = pow( abs( vGroundNormal ), vec3( 4.0 ) );
cliff /= cliff.x + cliff.y + cliff.z;
vec3 gravel = texture2D( uGravel, vGroundWorld.zy / uTileUnits[ 2 ] ).rgb * cliff.x
  + texture2D( uGravel, groundXZ / uTileUnits[ 2 ] ).rgb * cliff.y
  + texture2D( uGravel, vGroundWorld.xy / uTileUnits[ 2 ] ).rgb * cliff.z;
float paved = 1.0 - smoothstep( uCobbleArea.z, uCobbleArea.w, distance( groundXZ, uCobbleArea.xy ) );
vec3 track = mix( gravel, texture2D( uCobble, groundXZ / uTileUnits[ 3 ] ).rgb, paved );
vec4 splat = vSplat / max( dot( vSplat, vec4( 1.0 ) ), 1e-3 );
vec3 paintMean = splat.x * uPaintMean[ 0 ] + splat.y * uPaintMean[ 1 ] + splat.z * uPaintMean[ 2 ] + splat.w * uPaintMean[ 3 ];
vec3 groundDetailColour = ( splat.x * texture2D( uGrass, groundXZ / uTileUnits[ 0 ] ).rgb
  + splat.y * texture2D( uEarth, groundXZ / uTileUnits[ 1 ] ).rgb
  + splat.z * track
  + splat.w * texture2D( uSand, groundXZ / uTileUnits[ 4 ] ).rgb ) / max( paintMean, vec3( 1e-3 ) );
float wet = 1.0 - smoothstep( 0.0, uWetUnits, vGroundWorld.y );
diffuseColor.rgb *= groundDetailColour * mix( vec3( 1.0 ), uWetTint, wet );
`

/**
 * The island ground's one material (DESIGN.md section 17): terrain.glb's ground textures blended by the
 * splat weights and tinted by its painted vertex colours about `paint`, their mean per channel
 * (paintMeans), cobbles in the village, and the shore darkened where it is wet. `unitsPerMetre` sizes the
 * tiles and the wet band in scene units.
 */
export function createGroundMaterial(
  layers: Readonly<Record<GroundLayerName, GroundLayer>>,
  paint: readonly THREE.Vector3[],
  cobbles: CobbleArea,
  unitsPerMetre: number
) {
  const material = new THREE.MeshStandardMaterial({
    name: "isl_terrain",
    vertexColors: true,
    roughness: ROUGHNESS,
    metalness: 0,
    envMapIntensity: ENV_MAP_INTENSITY
  })
  const uniforms = {
    uGrass: { value: layers.grass.map },
    uEarth: { value: layers.earth.map },
    uGravel: { value: layers.gravel.map },
    uCobble: { value: layers.cobble.map },
    uSand: { value: layers.sand.map },
    uTileUnits: { value: GROUND_LAYERS.map((name) => layers[name].tileMetres * unitsPerMetre) },
    uPaintMean: { value: paint },
    uCobbleArea: { value: new THREE.Vector4(cobbles.centre.x, cobbles.centre.y, cobbles.inner, cobbles.outer) },
    uWetUnits: { value: WET_SHORE_METRES * unitsPerMetre },
    uWetTint: { value: WET_TINT }
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_SPLAT}`)
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_SPLAT}`)
  }
  return material
}
