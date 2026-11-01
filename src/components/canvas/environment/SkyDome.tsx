import { useEffect, useMemo } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { DEFAULT_SKY_HOUR } from "./skyPalette"
import { SKY_GLSL, SKY_UNIFORMS, setSkyHour } from "./skyShader"

/** The dome's radius; it only has to enclose every camera, since it draws at the far plane. */
const DOME_RADIUS = 9000

const DOME_VERTEX = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  // Drawn at the far plane: behind everything, and never clipped by a camera's far distance.
  gl_Position.z = gl_Position.w;
}
`

const DOME_FRAGMENT = /* glsl */ `
varying vec3 vWorldPosition;
${SKY_GLSL}

void main() {
  vec3 dir = normalize( vWorldPosition - cameraPosition );
  vec3 col = skyColor( dir );
  float towardSun = dot( dir, uSunDirection );
  float disc = smoothstep( 0.99988, 0.99993, towardSun );
  float halo = pow( max( towardSun, 0.0 ), 240.0 ) * 0.45 + pow( max( towardSun, 0.0 ), 24.0 ) * 0.12;
  col += uSun * ( disc + halo ) * smoothstep( -0.01, 0.01, dir.y );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createDome() {
  const material = new THREE.ShaderMaterial({
    name: "sky_dome",
    uniforms: SKY_UNIFORMS,
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false
  })
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 48, 24), material)
  dome.name = "sky_dome"
  dome.frustumCulled = false
  // Drawn last of the opaque scene: at the far plane, only the pixels nothing else covered are shaded.
  dome.renderOrder = 2
  return dome
}

/**
 * The sky: a graded dome in the site's palette at an hour of the day (dusk by default), which also
 * lights the island's materials through an environment map baked from it once per hour change.
 */
export function SkyDome({ hour = DEFAULT_SKY_HOUR }: { hour?: number }) {
  const { gl, scene } = useThree()
  const dome = useMemo(() => createDome(), [])

  useEffect(() => {
    setSkyHour(hour)
    const pmrem = new THREE.PMREMGenerator(gl)
    const sky = new THREE.Scene()
    const bakeDome = createDome()
    sky.add(bakeDome)
    const environment = pmrem.fromScene(sky)
    pmrem.dispose()
    bakeDome.geometry.dispose()
    bakeDome.material.dispose()
    scene.environment = environment.texture
    return () => {
      if (scene.environment === environment.texture) scene.environment = null
      environment.dispose()
    }
  }, [gl, scene, hour])

  useEffect(
    () => () => {
      dome.geometry.dispose()
      dome.material.dispose()
    },
    [dome]
  )

  return <primitive object={dome} />
}
