import { describe, expect, it } from "vitest"
import { DataTexture } from "three"
import { SKY_UNIFORMS } from "./skyShader"
import { SEA_COLOURS, WATER_UNIFORMS, createSeaUniforms } from "./seaShader"
import { STREAM_FRAGMENT, STREAM_VERTEX, createStillWaterMaterial, createStreamMaterial, createStreamUniforms } from "./streamShader"

const AROUND = {
  island: { x: 0, z: 0 },
  shore: { texture: new DataTexture(), rect: { minX: -1, minZ: -1, sizeX: 2, sizeZ: 2 } },
  pier: { x: 0, z: 0, dirX: 1, dirZ: 0, postSpacing: 3, postCount: 14, postSide: 2, postRadius: 0.2 },
  ship: { x: 0, z: 0, bowX: 1, bowZ: 0, stem: 30, transom: 30, halfBeam: 9 },
  markers: [
    [1, 1],
    [2, 2]
  ] as const,
  markerRadius: 3,
  calm: { x: 0, z: 0, radius: 90 }
}

describe("the stream's uniforms", () => {
  const stream = createStreamUniforms()

  it("run on the sea's own clock and wind, so both waters move and stop together", () => {
    const sea = createSeaUniforms(AROUND)
    expect(stream.uTime).toBe(WATER_UNIFORMS.uTime)
    expect(stream.uWindDir).toBe(WATER_UNIFORMS.uWindDir)
    expect(sea.uTime).toBe(stream.uTime)
    expect(sea.uWindDir).toBe(stream.uWindDir)
  })

  it("reflect the shared sky in the sea's teal", () => {
    for (const key of Object.keys(SKY_UNIFORMS) as Array<keyof typeof SKY_UNIFORMS>) expect(stream[key]).toBe(SKY_UNIFORMS[key])
    expect(`#${stream.uShallow.value.getHexString()}`).toBe(SEA_COLOURS.shallow)
  })
})

describe("the stream's materials", () => {
  it("draw the stream and the pond in one water: the same shaders, colours and clock", () => {
    const stream = createStreamMaterial()
    const pond = createStillWaterMaterial()
    expect(pond.vertexShader).toBe(stream.vertexShader)
    expect(pond.fragmentShader).toBe(stream.fragmentShader)
    expect(pond.defines).toEqual(stream.defines)
    expect(pond.uniforms.uTime).toBe(stream.uniforms.uTime)
    expect(pond.uniforms.uShallow.value.equals(stream.uniforms.uShallow.value)).toBe(true)
    expect(pond.uniforms.uDeep.value.equals(stream.uniforms.uDeep.value)).toBe(true)
  })

  it("lay the stream over its bed and the pond's surface, and stand the pond still without the ribbon's attributes", () => {
    const stream = createStreamMaterial()
    const pond = createStillWaterMaterial()
    expect(stream.polygonOffset).toBe(true)
    expect(stream.polygonOffsetUnits).toBeLessThan(0)
    expect(stream.transparent).toBe(true)
    expect(stream.depthWrite).toBe(false)
    expect(pond.polygonOffset).toBe(false)
    expect(pond.transparent).toBe(false)
    expect(pond.uniforms.uEndAlong.value).toBe(Number.POSITIVE_INFINITY)
    expect(pond.defaultAttributeValues).toMatchObject({ aAlong: [0], aAcross: [0], aFoam: [0], aFlow: [0, 0] })
  })
})

describe("the stream's shaders", () => {
  it("drift ripples downstream at the current's pace and foam only where the water falls", () => {
    for (const attribute of ["float aAlong", "float aAcross", "float aFoam", "vec2 aFlow"])
      expect(STREAM_VERTEX).toContain(`attribute ${attribute}`)
    for (const part of [
      "uTime * FLOW_SPEED",
      "mix( tiltStanding, tiltRunning, speed )",
      "vFoam * smoothstep",
      "skyColor( reflected )",
      "uWindDir"
    ])
      expect(STREAM_FRAGMENT).toContain(part)
  })

  it("fade the banks over their last metre or so, frayed with noise, and thin the stream out into the bay", () => {
    for (const part of [
      "smoothstep( 0.45 + 0.5 * fray, 1.0, abs( vAcross ) + 0.12 * grain )",
      "smoothstep( uEndAlong - 2.0, uEndAlong, vAlong )",
      "gl_FragColor = vec4( col, alpha )"
    ])
      expect(STREAM_FRAGMENT).toContain(part)
  })
})
