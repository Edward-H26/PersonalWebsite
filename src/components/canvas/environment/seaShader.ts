import { Color, type Texture, Vector2, Vector3, Vector4 } from "three"
import { SKY_GLSL, SKY_UNIFORMS } from "./skyShader"
import { WIND_DIRECTION } from "./wind"

/** The painted sea's colours: the deep-sea navy of the loader, teal in the shallows round the island. */
export const SEA_COLOURS = {
  deep: "#0b1e3f",
  shallow: "#1f6670",
  /** The loader's wave line, cool white, drawn on the swell's crests. */
  crest: "#dce8ff",
  foam: "#eef3f8"
} as const

/** What the sea's foam wraps round, in world units: the island's shore and the harbor's pier, ship and markers. */
export type SeaSurroundings = {
  island: { x: number; z: number }
  /** The distance from the shore as a texture over `rect`, positive at sea, and where it lies in world x/z. */
  shore: { texture: Texture; rect: { minX: number; minZ: number; sizeX: number; sizeZ: number } }
  /**
   * The pier's bents of posts: the first bent's middle, the way out along the pier, how far apart the bents
   * stand and how many there are, and each bent's two posts this far either side of the middle and this thick.
   */
  pier: {
    x: number
    z: number
    dirX: number
    dirZ: number
    postSpacing: number
    postCount: number
    postSide: number
    postRadius: number
  }
  ship: { x: number; z: number; bowX: number; bowZ: number; stem: number; transom: number; halfBeam: number }
  markers: ReadonlyArray<readonly [number, number]>
  markerRadius: number
  /** The sheltered water round the harbor, where the swell drops so the ship sits steady at its waterline. */
  calm: { x: number; z: number; radius: number }
}

/**
 * The clock and the wind shared by all the island's water, the sea and the stream: one clock, advanced once a
 * frame by the sea, keeps their ripples in step and stops them together for reduced motion.
 */
export const WATER_UNIFORMS = {
  uTime: { value: 0 },
  uWindDir: { value: WIND_DIRECTION }
}

/** The sea's uniforms: its own, plus the shared sky, wind and water clock, so section 12 can drive them all. */
export function createSeaUniforms(around: SeaSurroundings) {
  const [markerA, markerB] = around.markers
  return {
    ...SKY_UNIFORMS,
    ...WATER_UNIFORMS,
    uIslandCenter: { value: new Vector2(around.island.x, around.island.z) },
    uShoreField: { value: around.shore.texture },
    uShoreRect: { value: new Vector4(around.shore.rect.minX, around.shore.rect.minZ, around.shore.rect.sizeX, around.shore.rect.sizeZ) },
    uDeep: { value: new Color(SEA_COLOURS.deep) },
    uShallow: { value: new Color(SEA_COLOURS.shallow) },
    uCrest: { value: new Color(SEA_COLOURS.crest) },
    uFoam: { value: new Color(SEA_COLOURS.foam) },
    uPier: { value: new Vector4(around.pier.x, around.pier.z, around.pier.dirX, around.pier.dirZ) },
    uPierPosts: { value: new Vector4(around.pier.postSpacing, around.pier.postCount, around.pier.postSide, around.pier.postRadius) },
    uShip: { value: new Vector4(around.ship.x, around.ship.z, around.ship.bowX, around.ship.bowZ) },
    uHull: { value: new Vector3(around.ship.stem, around.ship.transom, around.ship.halfBeam) },
    uMarkers: { value: new Vector4(markerA[0], markerA[1], markerB[0], markerB[1]) },
    uMarkerRadius: { value: around.markerRadius },
    uCalm: { value: new Vector3(around.calm.x, around.calm.z, around.calm.radius) }
  }
}

/** Hash and value noise for the water's ripples and foam. */
export const NOISE_GLSL = /* glsl */ `
float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

float valueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0 ) ), u.x ), u.y );
}
`

// The main swell train, which the crest strokes follow in the fragment shader.
const LEAD_SWELL_GLSL = /* glsl */ `
const float LEAD_WAVELENGTH = 64.0;
const float LEAD_PERIOD = 9.0;
`

export const SEA_VERTEX = /* glsl */ `
attribute float aShore;
uniform float uTime;
uniform vec2 uWindDir;
uniform vec3 uCalm;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vShore;
varying float vCrest;
varying float vSwell;

${LEAD_SWELL_GLSL}

vec2 turn( vec2 v, float angle ) {
  float c = cos( angle );
  float s = sin( angle );
  return vec2( c * v.x - s * v.y, s * v.x + c * v.y );
}

// One Gerstner train: the water moves in circles, so crests sharpen and troughs flatten. Adds its
// displacement and slope, and its undamped height to crest.
void swell( vec2 xz, vec2 dir, float wavelength, float amplitude, float period, float steepness, float damp,
            inout vec3 displacement, inout vec3 slope, inout float crest ) {
  float k = 6.2831853 / wavelength;
  float phase = k * dot( dir, xz ) - 6.2831853 / period * uTime;
  float c = cos( phase );
  float s = sin( phase );
  float a = amplitude * damp;
  displacement.xz += steepness * a * dir * c;
  displacement.y += a * s;
  slope += vec3( dir.x * k * a * c, steepness * k * a * s, dir.y * k * a * c );
  crest += amplitude * s;
}

// The rings widen with their distance from the waterline (seaGeometry.ts), so far out they can no longer
// carry the swell; it fades over this band of shore distance, which holds for an island of any size.
const float SWELL_FADE_START = 250.0;
const float SWELL_FADE_END = 1030.0;

void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vec2 xz = world.xz;
  // Calm at the foot of the cliff and in the harbor's shelter, flat far out where only haze is seen.
  float damp = smoothstep( 1.0, 14.0, aShore ) * ( 1.0 - smoothstep( SWELL_FADE_START, SWELL_FADE_END, aShore ) );
  damp *= mix( 0.22, 1.0, smoothstep( uCalm.z * 0.55, uCalm.z * 1.15, distance( xz, uCalm.xy ) ) );

  vec3 displacement = vec3( 0.0 );
  vec3 slope = vec3( 0.0 );
  float crest = 0.0;
  swell( xz, uWindDir, LEAD_WAVELENGTH, 0.55, LEAD_PERIOD, 0.55, damp, displacement, slope, crest );
  swell( xz, turn( uWindDir, 0.38 ), 38.0, 0.34, 7.0, 0.5, damp, displacement, slope, crest );
  swell( xz, turn( uWindDir, -0.52 ), 23.0, 0.2, 5.2, 0.45, damp, displacement, slope, crest );
  swell( xz, turn( uWindDir, 0.95 ), 15.0, 0.1, 4.1, 0.4, damp, displacement, slope, crest );
  world.xyz += displacement;

  // The crest's vertex colour: a broad light band on the main swell's crests, dark in its troughs.
  float lead = sin( 6.2831853 / LEAD_WAVELENGTH * dot( uWindDir, xz ) - 6.2831853 / LEAD_PERIOD * uTime );
  vCrest = smoothstep( -0.2, 0.9, lead ) * smoothstep( 0.0, 0.5, damp );
  // Height of all four trains from -1 to 1: only where they pile up does a crest break into foam.
  vSwell = crest / 1.19 * damp;
  vShore = aShore;
  vWorld = world.xyz;
  vNormalW = normalize( vec3( -slope.x, 1.0 - slope.y, -slope.z ) );
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

export const SEA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform vec2 uIslandCenter;
uniform sampler2D uShoreField;
uniform vec4 uShoreRect;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uCrest;
uniform vec3 uFoam;
uniform vec4 uPier;
uniform vec4 uPierPosts;
uniform vec4 uShip;
uniform vec3 uHull;
uniform vec4 uMarkers;
uniform float uMarkerRadius;
uniform vec3 uCalm;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vShore;
varying float vCrest;
varying float vSwell;

${SKY_GLSL}
${NOISE_GLSL}
${LEAD_SWELL_GLSL}

/** Width of the shallow teal halo round the island, in world units. */
const float HALO_WIDTH = 30.0;
/** Distance at which the sea has gone two thirds of the way into the horizon haze. */
const float HAZE_DISTANCE = 6000.0;
/** The scallops drawn on the crests: each this long along the crest, arching this high. */
const float SCALLOP_LENGTH = 18.0;
const float SCALLOP_RISE = 2.4;

/** Foam that fades out over 'width' from an edge 'd' away, its outline broken by noise. */
float foamFrom( float d, float width, vec2 grain ) {
  return ( 1.0 - smoothstep( 0.0, width, d ) ) * ( 0.55 + 0.45 * valueNoise( grain ) );
}

/**
 * The distance from the shore under this fragment: the shore field where it reaches, sharp enough for
 * a foam ring a unit wide round any coast, and the mesh's own figure beyond it.
 */
float shoreDistance() {
  vec2 uv = ( vWorld.xz - uShoreRect.xy ) / uShoreRect.zw;
  if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return vShore;
  return texture2D( uShoreField, uv ).r;
}

/** The white ring where the water meets the shore, breathing with the swell, and a faint backwash line beyond it. */
float cliffFoam( float shore ) {
  vec2 outward = normalize( vWorld.xz - uIslandCenter );
  float breathe = 0.5 + 0.5 * sin( uTime * 0.7 + dot( outward, vec2( 2.3, 1.7 ) ) * 3.0 );
  float edge = 1.0 + 1.6 * valueNoise( outward * 40.0 + vec2( uTime * 0.15, 0.0 ) ) + 0.8 * breathe;
  float ring = 1.0 - smoothstep( edge * 0.4, edge, shore );
  float backwash = abs( shore - ( 3.5 + 1.5 * breathe + 1.5 * valueNoise( outward * 30.0 - vec2( 0.0, uTime * 0.1 ) ) ) );
  return max( ring, ( 1.0 - smoothstep( 0.0, 0.45, backwash ) ) * 0.55 * valueNoise( vWorld.xz * 0.6 ) );
}

/** Rings round the pier's posts: the nearest bent along the pier, and its post on this side. */
float pierFoam() {
  vec2 rel = vWorld.xz - uPier.xy;
  float along = dot( rel, uPier.zw );
  float across = abs( dot( rel, vec2( -uPier.w, uPier.z ) ) );
  float bent = clamp( floor( along / uPierPosts.x + 0.5 ), 0.0, uPierPosts.y - 1.0 );
  float d = length( vec2( along - bent * uPierPosts.x, across - uPierPosts.z ) ) - uPierPosts.w;
  return foamFrom( d, 1.3, vWorld.xz * 2.5 + uTime * 0.3 );
}

/** Foam along the ship's waterline, the bow wave opening aft from the stem, and the wake trailing the transom. */
float shipFoam() {
  vec2 rel = vWorld.xz - uShip.xy;
  float u = dot( rel, uShip.zw );
  float w = abs( dot( rel, vec2( -uShip.w, uShip.z ) ) );
  float stem = uHull.x;
  float transom = uHull.y;
  float fore = clamp( ( u - 0.2 * stem ) / ( 0.8 * stem ), 0.0, 1.0 );
  float aft = clamp( ( -u - 0.6 * transom ) / ( 0.4 * transom ), 0.0, 1.0 );
  float halfBeam = uHull.z * sqrt( max( 1.0 - fore * fore, 0.0 ) ) * ( 1.0 - 0.23 * aft );
  float beside = w - halfBeam;
  float beyond = max( u - stem, -transom - u );
  float d = beyond <= 0.0 ? beside : length( vec2( beyond, max( beside, 0.0 ) ) );
  float hull = foamFrom( d, 1.4, vWorld.xz * 2.0 + uTime * 0.4 );

  float behindStem = stem - u;
  float arm = abs( w - 0.36 * behindStem );
  float bowWave = ( 1.0 - smoothstep( 0.0, 0.6, arm ) ) * step( 0.0, behindStem ) * ( 1.0 - smoothstep( 0.0, 0.45 * stem, behindStem ) );

  float behindTransom = -transom - u;
  float lane = abs( w - uHull.z * 0.75 * ( 1.0 - 0.4 * smoothstep( 0.0, 2.0 * transom, behindTransom ) ) );
  float wake = ( 1.0 - smoothstep( 0.0, 0.7, lane ) ) * step( 0.0, behindTransom ) * ( 1.0 - smoothstep( 0.0, 1.6 * transom, behindTransom ) );
  wake *= 0.5 + 0.5 * valueNoise( vec2( behindTransom * 0.5 - uTime * 1.2, w ) );
  return max( hull, max( bowWave * 0.8, wake ) );
}

/** Where the main swell is along its own cycle, 0 to 1 a crest to the next, the crest at 0.5 of each. */
float leadPhase() {
  return dot( uWindDir, vWorld.xz ) / LEAD_WAVELENGTH - uTime / LEAD_PERIOD + 0.25;
}

/**
 * The loader's wave line on the water: along every crest of the main swell, a row of scalloped strokes
 * travelling with it, about half of them drawn so the rows break up like an engraved chart's sea.
 * 'width' is the screen footprint of a unit across the crest, taken outside any branch.
 */
float crestStrokes( float phase, float width ) {
  vec2 p = vWorld.xz;
  float row = floor( phase );
  float across = ( fract( phase ) - 0.5 ) * LEAD_WAVELENGTH;
  float along = dot( vec2( -uWindDir.y, uWindDir.x ), p ) / SCALLOP_LENGTH + row * 0.37;
  vec2 cell = vec2( floor( along ), row );
  float t = fract( along ) * 2.0 - 1.0;
  // Each scallop arches downwind at its middle, a little taller or flatter than its neighbours.
  float rise = SCALLOP_RISE * ( 0.7 + 0.6 * hash12( cell + 17.0 ) );
  float arch = across - rise * ( 1.0 - t * t ) + 0.5 * rise;
  float stroke = 1.0 - smoothstep( 0.45, 0.45 + 1.5 * width, abs( arch ) );
  float drawn = step( 0.45, hash12( cell ) ) * ( 1.0 - smoothstep( 0.75, 1.0, abs( t ) ) );
  return stroke * drawn;
}

float markerFoam() {
  float d = min( distance( vWorld.xz, uMarkers.xy ), distance( vWorld.xz, uMarkers.zw ) ) - uMarkerRadius;
  return foamFrom( d, 1.5, vWorld.xz * 2.0 + uTime * 0.3 );
}

void main() {
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length( toCamera );
  vec3 view = toCamera / dist;

  // Derivatives are taken here, before any branch.
  float phase = leadPhase();
  float strokeWidth = fwidth( phase ) * LEAD_WAVELENGTH;

  // Fine, irregular ripples on the swell's slope, only near enough to see, for the sun's glitter.
  vec2 p = vWorld.xz;
  vec3 normal = normalize( vNormalW );
  if ( dist < 260.0 ) {
    vec2 drift = uWindDir * uTime * 0.8;
    vec3 ripple = vec3( valueNoise( p * 0.45 + drift ) - 0.5, 0.0, valueNoise( p * 0.45 - drift + 31.7 ) - 0.5 );
    normal = normalize( normal + ripple * 0.12 * ( 1.0 - smoothstep( 60.0, 260.0, dist ) ) );
  }

  // Painted two-tone body under the sky's reflection, the shallows teal round the island.
  float shore = shoreDistance();
  float shallow = 1.0 - smoothstep( 0.0, HALO_WIDTH, shore );
  vec3 body = mix( uDeep, uShallow, shallow * shallow );
  float fresnel = 0.02 + 0.98 * pow( 1.0 - max( dot( normal, view ), 0.0 ), 5.0 );
  vec3 reflected = reflect( -view, normal );
  reflected.y = abs( reflected.y );
  body = mix( body * 0.75, body * 1.35 + uDeep * 0.15, vCrest );
  // A painted sea keeps its navy: the sky's reflection only half as strong as a mirror's.
  vec3 col = mix( body, skyColor( reflected ), fresnel * 0.5 );

  // The crest strokes, the loader's wave line drawn on the swell. Strokes thinner than a pixel would
  // shimmer, so they fade out with distance and are not drawn at all beyond that.
  float strokeFade = 1.0 - smoothstep( 0.35, 0.9, strokeWidth );
  if ( strokeFade > 0.0 ) col = mix( col, uCrest, crestStrokes( phase, strokeWidth ) * strokeFade * 0.26 );

  // The sun's glitter band.
  float glint = pow( max( dot( reflected, uSunDirection ), 0.0 ), 600.0 );
  if ( glint > 0.001 ) {
    float sparkle = step( 0.7, valueNoise( p * 2.3 + uTime * 0.8 ) );
    col += uSun * glint * ( 0.5 + 2.5 * sparkle ) * smoothstep( -0.02, 0.02, uSunDirection.y );
  }

  // Foam at the cliff, the pier posts, the ship and the markers, and on the crests of the larger swells
  // only; each kind is only worked out near where it can appear.
  float foam = 0.0;
  if ( vSwell > 0.86 ) foam = smoothstep( 0.86, 0.97, vSwell ) * vCrest * step( 0.6, valueNoise( p * 0.9 + uWindDir * uTime * 0.5 ) ) * 0.7;
  if ( shore < 12.0 ) foam = max( foam, cliffFoam( shore ) );
  if ( distance( p, uCalm.xy ) < uCalm.z * 1.5 ) foam = max( foam, max( pierFoam(), max( shipFoam(), markerFoam() ) ) );
  col = mix( col, mix( uFoam, uMid, 0.35 ), clamp( foam, 0.0, 1.0 ) * 0.9 );

  // Into the horizon haze: the sky's own horizon colour in this direction, so sea and sky meet without a line.
  float haze = 1.0 - exp( -pow( dist / HAZE_DISTANCE, 2.0 ) );
  col = mix( col, skyColor( normalize( vec3( -view.x, 0.0, -view.z ) ) ), haze );

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
