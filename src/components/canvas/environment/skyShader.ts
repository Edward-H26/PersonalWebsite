import { Color, Vector3 } from "three"
import { type SkyPalette, skyAt, sunDirection } from "./skyPalette"

type SkyUniforms = { [K in keyof SkyPalette as `u${Capitalize<K>}`]: { value: Color } } & { uSunDirection: { value: Vector3 } }

/**
 * The sky's colours and the sun's direction as uniforms, shared by the dome, the sea and the clouds: the
 * sea reflects and hazes towards exactly the colours the dome shows, so the horizon never shows a seam.
 */
export const SKY_UNIFORMS: SkyUniforms = {
  uHaze: { value: new Color() },
  uHorizon: { value: new Color() },
  uMid: { value: new Color() },
  uUpper: { value: new Color() },
  uZenith: { value: new Color() },
  uGlow: { value: new Color() },
  uSun: { value: new Color() },
  uSunDirection: { value: new Vector3() }
}

/** Sets the shared sky to an hour of the day (DEFAULT_SKY_HOUR is the island's dusk). */
export function setSkyHour(hour: number) {
  const sky = skyAt(hour)
  SKY_UNIFORMS.uHaze.value.copy(sky.haze)
  SKY_UNIFORMS.uHorizon.value.copy(sky.horizon)
  SKY_UNIFORMS.uMid.value.copy(sky.mid)
  SKY_UNIFORMS.uUpper.value.copy(sky.upper)
  SKY_UNIFORMS.uZenith.value.copy(sky.zenith)
  SKY_UNIFORMS.uGlow.value.copy(sky.glow)
  SKY_UNIFORMS.uSun.value.copy(sky.sun)
  sunDirection(sky, SKY_UNIFORMS.uSunDirection.value)
}

/**
 * `skyColor(dir)`: the sky seen along a unit direction. Bands of colour climb from the sea haze at the
 * horizon to the zenith (the elevations are sines: 2.5, 8 and 20 degrees), and the sun's side of the
 * horizon glows warm. Directions below the horizon see the horizon itself, so the sea's far haze and
 * the dome below the sea's edge are one colour.
 */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uHaze;
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uUpper;
uniform vec3 uZenith;
uniform vec3 uGlow;
uniform vec3 uSun;
uniform vec3 uSunDirection;

vec3 skyColor( vec3 dir ) {
  float up = max( dir.y, 0.0 );
  vec3 col = mix( uHaze, uHorizon, smoothstep( 0.0, 0.044, up ) );
  col = mix( col, uMid, smoothstep( 0.044, 0.139, up ) );
  col = mix( col, uUpper, smoothstep( 0.139, 0.342, up ) );
  col = mix( col, uZenith, smoothstep( 0.342, 1.0, up ) );
  vec2 flatDir = dir.xz / max( length( dir.xz ), 1e-4 );
  vec2 flatSun = uSunDirection.xz / max( length( uSunDirection.xz ), 1e-4 );
  float towardSun = max( dot( flatDir, flatSun ), 0.0 );
  float glow = pow( towardSun, 5.0 ) * ( 1.0 - smoothstep( 0.0, 0.3, up ) );
  return mix( col, uGlow, glow * 0.85 );
}
`
