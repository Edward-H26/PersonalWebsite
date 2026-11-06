import { Color, ShaderMaterial } from "three"
import { NOISE_GLSL, SEA_COLOURS, WATER_UNIFORMS } from "./seaShader"
import { SKY_GLSL, SKY_UNIFORMS } from "./skyShader"

/** The stream's uniforms: the sea's teal and foam, and the sky, wind and water clock the sea shares. */
export function createStreamUniforms() {
  return {
    ...SKY_UNIFORMS,
    ...WATER_UNIFORMS,
    uShallow: { value: new Color(SEA_COLOURS.shallow) },
    uDeep: { value: new Color(SEA_COLOURS.deep) },
    uFoam: { value: new Color(SEA_COLOURS.foam) },
    /** Where the stream meets the sea, in aAlong's units; it thins out into the bay over its last metres. */
    uEndAlong: { value: Number.POSITIVE_INFINITY }
  }
}

export const STREAM_VERTEX = /* glsl */ `
attribute float aAlong;
attribute float aAcross;
attribute float aFoam;
attribute vec2 aFlow;

varying vec3 vWorld;
varying float vAlong;
varying float vAcross;
varying float vFoam;
varying vec2 vFlow;

void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  vAlong = aAlong;
  vAcross = aAcross;
  vFoam = aFoam;
  vFlow = aFlow;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

export const STREAM_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uEndAlong;

varying vec3 vWorld;
varying float vAlong;
varying float vAcross;
varying float vFoam;
varying vec2 vFlow;

${SKY_GLSL}
${NOISE_GLSL}

/** How fast the ripples drift downstream, in world units a second; the foam runs twice as fast. */
const float FLOW_SPEED = 1.1;

void main() {
  // Banks that fade out over their last metre or so, frayed with noise along each side and grained across it, rather
  // than a ruled edge; the pond's surface, whose aAcross reads 0, keeps its own. The slow swell of the fray widens and
  // narrows the stream every several metres, which is what still reads from far off. The stream thins out into the bay
  // over its last metres.
  float bank = step( 0.0, vAcross ) * 7.3;
  float fray = 0.6 * valueNoise( vec2( vAlong * 0.12, bank ) ) + 0.4 * valueNoise( vec2( vAlong * 0.45, bank + 3.1 ) ) - 0.5;
  float grain = valueNoise( vWorld.xz * 1.7 ) - 0.5;
  float alpha = 1.0 - smoothstep( 0.45 + 0.5 * fray, 1.0, abs( vAcross ) + 0.12 * grain );
  alpha *= 1.0 - smoothstep( uEndAlong - 2.0, uEndAlong, vAlong );
  if ( alpha < 0.01 ) discard;

  vec3 toCamera = cameraPosition - vWorld;
  vec3 view = normalize( toCamera );

  // The current's way, and how fast it runs: 1 down the stream, 0 where the water stands. Running water streaks its
  // ripples along the flow and carries them downstream; standing water keeps them in place. As the stream slows into
  // the pond the one blends into the other, so the two waters meet without a seam.
  float speed = clamp( length( vFlow ), 0.0, 1.0 );
  vec2 flow = speed > 1e-4 ? vFlow / speed : vec2( 1.0, 0.0 );
  vec2 side = vec2( -flow.y, flow.x );
  vec2 running = vec2( ( vAlong - uTime * FLOW_SPEED ) * 0.6, vAcross * 2.5 );
  vec2 standing = vWorld.xz * 0.6;
  vec2 tiltRunning = vec2( valueNoise( running ), valueNoise( running + vec2( 17.3, 5.1 ) ) ) - 0.5;
  vec2 tiltStanding = vec2( valueNoise( standing ), valueNoise( standing + vec2( 17.3, 5.1 ) ) ) - 0.5;
  vec2 tilt = mix( tiltStanding, tiltRunning, speed );
  vec2 drift = uWindDir * uTime * 0.6;
  vec2 paws = vec2( valueNoise( vWorld.xz * 0.5 + drift ), valueNoise( vWorld.xz * 0.5 - drift + 9.7 ) ) - 0.5;
  vec2 slope = ( flow * tilt.x + side * tilt.y ) * 0.3 + paws * 0.12;
  vec3 normal = normalize( vec3( slope.x, 1.0, slope.y ) );

  // One body for the stream and the pond, the sea's teal darkened towards its navy, a touch deeper down the middle where
  // the stream runs; under the sky's reflection and the sun's glint.
  vec3 body = mix( uShallow, uDeep, 0.55 + 0.15 * ( 1.0 - abs( vAcross ) ) * speed );
  float fresnel = 0.02 + 0.98 * pow( 1.0 - max( dot( normal, view ), 0.0 ), 5.0 );
  vec3 reflected = reflect( -view, normal );
  reflected.y = abs( reflected.y );
  vec3 col = mix( body, skyColor( reflected ), fresnel * 0.5 );
  col += uSun * pow( max( dot( reflected, uSunDirection ), 0.0 ), 400.0 ) * smoothstep( -0.02, 0.02, uSunDirection.y );

  // Foam only where the water falls: thin streaks drawn out along the current at each drop, carried off downstream
  // and gone within a couple of metres, the level water clear between them.
  float streak = valueNoise( vec2( ( vAlong - uTime * FLOW_SPEED * 2.0 ) * 0.7, vAcross * 11.0 ) );
  col = mix( col, mix( uFoam, uMid, 0.25 ), vFoam * smoothstep( 0.62, 0.8, streak ) * 0.9 );

  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * The stream's water, drawn see-through so its banks can fade. Where it runs only a few centimetres over its bed, the
 * depth offset keeps it drawn over the bed rather than flickering with it, and over the pond's surface where its
 * ends lie on the pond.
 */
export function createStreamMaterial() {
  return new ShaderMaterial({
    name: "stream",
    uniforms: createStreamUniforms(),
    vertexShader: STREAM_VERTEX,
    fragmentShader: STREAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetUnits: -4
  })
}

/**
 * The stream's water on the mill pond's surface, which comes from the watermill's model. It carries none of the
 * ribbon's attributes; read as zero they leave it standing still, foamless and unfrayed. Drawn under the ribbon's
 * depth offset, it lets the ribbon's ends lie on top of it where they run into the pond.
 */
export function createStillWaterMaterial() {
  const material = new ShaderMaterial({
    name: "still_water",
    uniforms: createStreamUniforms(),
    vertexShader: STREAM_VERTEX,
    fragmentShader: STREAM_FRAGMENT
  })
  material.defaultAttributeValues = { ...material.defaultAttributeValues, aAlong: [0], aAcross: [0], aFoam: [0], aFlow: [0, 0] }
  return material
}
