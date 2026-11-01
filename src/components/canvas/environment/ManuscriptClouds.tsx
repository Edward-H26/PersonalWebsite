import { useEffect, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { CLOUD_BANK, CLOUD_DRIFT_SPEED, CLOUD_REGION, buildCloudGeometry } from "./clouds"
import { SKY_GLSL, SKY_UNIFORMS } from "./skyShader"
import { WIND_DIRECTION } from "./wind"

// The drift here and driftedCloud() in clouds.ts are the same arithmetic: the cloud shadows of section 12
// read the TypeScript, the frame draws the shader, and both must agree.
const CLOUD_VERTEX = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uDriftSpeed;
uniform float uRegion;

varying vec3 vWorld;
varying vec3 vNormalW;

void main() {
  mat4 instanceWorld = modelMatrix * instanceMatrix;
  vec3 origin = instanceWorld[ 3 ].xyz;
  vec2 drifted = mod( origin.xz + uWindDir * uDriftSpeed * uTime + uRegion, 2.0 * uRegion ) - uRegion;
  float edge = max( abs( drifted.x ), abs( drifted.y ) );
  float keep = 1.0 - smoothstep( uRegion * 0.82, uRegion, edge );
  vec3 world = vec3( drifted.x, origin.y, drifted.y ) + ( ( instanceWorld * vec4( position, 1.0 ) ).xyz - origin ) * keep;
  // Normals under the instance's stretch: scale each axis back by its squared length before turning.
  mat3 basis = mat3( instanceWorld );
  vec3 stretch = vec3( dot( basis[ 0 ], basis[ 0 ] ), dot( basis[ 1 ], basis[ 1 ] ), dot( basis[ 2 ], basis[ 2 ] ) );
  vNormalW = normalize( basis * ( normal / stretch ) );
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`

const CLOUD_FRAGMENT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;

${SKY_GLSL}

/** Distance at which a cloud has gone two thirds of the way into the sky behind it. */
const float HAZE_DISTANCE = 3400.0;

void main() {
  vec3 normal = normalize( vNormalW );
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length( toCamera );
  vec3 view = toCamera / dist;

  // Lit warm from the sun low in the west, cool in its own shade, the sky's light on its crown and
  // its flat base darker, all in the sky's colours so the clouds follow the hour.
  vec3 lit = mix( mix( uMid, uGlow, 0.45 ), vec3( 1.0 ), 0.15 ) * 1.05;
  vec3 shade = mix( uZenith, uHorizon, 0.45 );
  float facing = dot( normal, uSunDirection ) * 0.5 + 0.5;
  vec3 col = mix( shade, lit, smoothstep( 0.3, 0.85, facing ) );
  col = mix( col, mix( uUpper, uZenith, 0.3 ) * 1.05, smoothstep( 0.55, 1.0, normal.y ) * 0.35 );
  col = mix( col, shade * 0.9, smoothstep( -0.6, -0.95, normal.y ) );
  float rim = pow( 1.0 - max( dot( normal, view ), 0.0 ), 3.0 ) * max( dot( -view, uSunDirection ), 0.0 );
  col += uGlow * rim * 0.5;

  float haze = 1.0 - exp( -pow( dist / HAZE_DISTANCE, 2.0 ) );
  col = mix( col, skyColor( -view ), haze );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createClouds() {
  const material = new THREE.ShaderMaterial({
    name: "manuscript_clouds",
    uniforms: {
      ...SKY_UNIFORMS,
      uTime: { value: 0 },
      uWindDir: { value: WIND_DIRECTION },
      uDriftSpeed: { value: CLOUD_DRIFT_SPEED },
      uRegion: { value: CLOUD_REGION }
    },
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT
  })
  const clouds = new THREE.InstancedMesh(buildCloudGeometry(), material, CLOUD_BANK.length)
  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  CLOUD_BANK.forEach((cloud, i) => {
    const half = cloud.width / 2
    rotation.setFromAxisAngle(up, cloud.yaw)
    matrix.compose(new THREE.Vector3(cloud.x, cloud.y, cloud.z), rotation, new THREE.Vector3(half, half * cloud.height, half * cloud.depth))
    clouds.setMatrixAt(i, matrix)
  })
  clouds.name = "manuscript_clouds"
  // Drifting in the vertex shader moves the clouds away from their instance bounds.
  clouds.frustumCulled = false
  clouds.renderOrder = 1
  return clouds
}

/**
 * The manuscript clouds (DESIGN.md section 16): one instanced bank of flat-bottomed, scalloped cumulus,
 * lit warm from the west and drifting with the wind; they stand still under reduced motion.
 */
export function ManuscriptClouds() {
  const reducedMotion = useReducedMotion()
  const clouds = useMemo(() => createClouds(), [])

  useEffect(
    () => () => {
      clouds.geometry.dispose()
      clouds.material.dispose()
      clouds.dispose()
    },
    [clouds]
  )

  useFrame((_, delta) => {
    if (!reducedMotion) clouds.material.uniforms.uTime.value += delta
  })

  return <primitive object={clouds} />
}
