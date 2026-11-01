import { describe, expect, it } from "vitest"
import { DataTexture } from "three"
import { WIND_DIRECTION } from "./wind"
import { SKY_UNIFORMS } from "./skyShader"
import { SEA_FRAGMENT, SEA_VERTEX, type SeaSurroundings, createSeaUniforms } from "./seaShader"

const SHORE_TEXTURE = new DataTexture()

const AROUND: SeaSurroundings = {
  island: { x: 5, z: -16 },
  shore: { texture: SHORE_TEXTURE, rect: { minX: -480, minZ: -370, sizeX: 968, sizeZ: 734 } },
  pier: {
    x: -90,
    z: -260,
    dirX: 0.31,
    dirZ: -0.95,
    postSpacing: 4.9,
    postReach: 19.5,
    postSide: 3,
    postRadius: 0.27,
    pieces: 2,
    pieceStep: -24.9
  },
  ship: { x: -120, z: -300, bowX: 1, bowZ: 0, stem: 31.2, transom: 34.3, halfBeam: 9.4 },
  markers: [
    [-40, -320],
    [-160, -250]
  ],
  markerRadius: 3.1,
  calm: { x: -110, z: -290, radius: 90 }
}

describe("the sea's uniforms", () => {
  const uniforms = createSeaUniforms(AROUND)

  it("share the sky's colours and the wind with the dome, the clouds and the plants", () => {
    expect(uniforms.uWindDir.value).toBe(WIND_DIRECTION)
    for (const key of Object.keys(SKY_UNIFORMS) as Array<keyof typeof SKY_UNIFORMS>) expect(uniforms[key]).toBe(SKY_UNIFORMS[key])
  })

  it("place the foam at the shore, the pier's posts, the ship's hull and the markers", () => {
    expect(uniforms.uIslandCenter.value.toArray()).toEqual([5, -16])
    expect(uniforms.uShoreField.value).toBe(SHORE_TEXTURE)
    expect(uniforms.uShoreRect.value.toArray()).toEqual([-480, -370, 968, 734])
    expect(uniforms.uPier.value.toArray()).toEqual([-90, -260, 0.31, -0.95])
    expect(uniforms.uPierPosts.value.toArray()).toEqual([4.9, 19.5, 3, 0.27])
    expect(uniforms.uPierRun.value.toArray()).toEqual([-24.9, 2])
    expect(uniforms.uShip.value.toArray()).toEqual([-120, -300, 1, 0])
    expect(uniforms.uHull.value.toArray()).toEqual([31.2, 34.3, 9.4])
    expect(uniforms.uMarkers.value.toArray()).toEqual([-40, -320, -160, -250])
    expect(uniforms.uMarkerRadius.value).toBe(3.1)
    expect(uniforms.uCalm.value.toArray()).toEqual([-110, -290, 90])
  })

  it("start in the loader's deep-sea navy", () => {
    expect(`#${uniforms.uDeep.value.getHexString()}`).toBe("#0b1e3f")
  })
})

describe("the sea's shaders", () => {
  it("swell in the vertex shader and draw colour, foam, glitter and haze in the fragment shader, with no reflection pass", () => {
    expect(SEA_VERTEX).toContain("attribute float aShore;")
    expect(SEA_VERTEX).toContain("void swell(")
    for (const part of [
      "texture2D( uShoreField, uv )",
      "cliffFoam( shore )",
      "pierFoam()",
      "shipFoam()",
      "markerFoam()",
      "crestStrokes( phase, strokeWidth )",
      "skyColor( reflected )"
    ]) {
      expect(SEA_FRAGMENT).toContain(part)
    }
    expect(SEA_FRAGMENT).not.toContain("mirrorSampler")
  })

  it("fade the swell by distance from the shore, so a larger island needs only a larger OCEAN_SIZE", () => {
    expect(SEA_VERTEX).toContain("smoothstep( SWELL_FADE_START, SWELL_FADE_END, aShore )")
    expect(SEA_VERTEX).not.toContain("uIslandCenter")
  })
})
