import { describe, expect, it } from "vitest"
import * as THREE from "three"
import atlasesJson from "../../../../../public/models/island/atlases.json?raw"
import { GROUND_LAYERS, GROUND_TEXTURES, SPLAT_CHANNELS, createGroundMaterial, paintMeans } from "./groundMaterial"
import { TERRAIN } from "./terrainFixture"

const ATLASES: Record<string, { tile_metres?: number }> = JSON.parse(atlasesJson)

describe("the ground material", () => {
  it("reads COLOR_1's weights in terrain.json's channel order", () => {
    expect([...SPLAT_CHANNELS]).toEqual(TERRAIN.mesh.COLOR_1.channels)
  })

  it("repeats each texture every so many metres as atlases.json records", () => {
    for (const layer of GROUND_LAYERS) {
      const { atlas, tileMetres } = GROUND_TEXTURES[layer]
      expect(ATLASES[atlas]?.tile_metres).toBe(tileMetres)
    }
  })

  it("averages the painted colour under each splat channel where that channel dominates", () => {
    const geometry = new THREE.BufferGeometry()
    // Two grass vertices, one sand vertex, and one with no channel above the threshold.
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute([0.2, 0.4, 0.1, 1, 0.4, 0.6, 0.1, 1, 0.6, 0.5, 0.3, 1, 0.9, 0.9, 0.9, 1], 4)
    )
    geometry.setAttribute("color_1", new THREE.Float32BufferAttribute([1, 0, 0, 0, 0.9, 0.1, 0, 0, 0, 0, 0.05, 0.95, 0.5, 0, 0.5, 0], 4))
    const [grass, earth, gravel, sand] = paintMeans(geometry)
    expect(grass.toArray().map((v) => +v.toFixed(6))).toEqual([0.3, 0.5, 0.1])
    expect(sand.toArray().map((v) => +v.toFixed(6))).toEqual([0.6, 0.5, 0.3])
    // A channel that dominates no vertex falls back to the mean of every vertex.
    expect(earth.toArray().map((v) => +v.toFixed(6))).toEqual([0.525, 0.6, 0.35])
    expect(gravel).toEqual(earth)
  })

  it("blends the textures by the splat weights, tinted by the paint about its mean, in one material sized in scene units", () => {
    const layers = Object.fromEntries(
      GROUND_LAYERS.map((name) => [name, { map: new THREE.Texture(), tileMetres: GROUND_TEXTURES[name].tileMetres }])
    ) as Parameters<typeof createGroundMaterial>[0]
    const paint = SPLAT_CHANNELS.map(() => new THREE.Vector3(0.3, 0.3, 0.3))
    const material = createGroundMaterial(layers, paint, { centre: new THREE.Vector2(0, 0), inner: 10, outer: 20 }, 1.3)
    expect(material.vertexColors).toBe(true)
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <color_fragment>"
    }
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
    expect(shader.vertexShader).toContain("vSplat = color_1;")
    expect(shader.fragmentShader).toContain("diffuseColor.rgb *= groundDetailColour")
    expect(shader.uniforms.uTileUnits.value).toEqual(GROUND_LAYERS.map((name) => GROUND_TEXTURES[name].tileMetres * 1.3))
    expect(shader.uniforms.uWetUnits.value).toBeCloseTo(0.65, 9)
    expect(shader.uniforms.uPaintMean.value).toBe(paint)
  })
})
