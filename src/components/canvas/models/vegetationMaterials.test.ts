import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { WIND_DIRECTION } from "@/components/canvas/environment/wind"
import { VEGETATION_FAMILIES, type VegetationFamily, createVegetationMaterials } from "./vegetationMaterials"

const CARD_FAMILIES = ["isl_foliage", "isl_grass", "isl_flowers"] as const

function blankAtlases() {
  return Object.fromEntries(VEGETATION_FAMILIES.map((family) => [family, new THREE.Texture()])) as Record<VegetationFamily, THREE.Texture>
}

/** Runs a material's shader hook on a copy of a built-in shader, as three.js does before compiling. */
function prepareShader(
  material: THREE.Material,
  lib: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }
) {
  const shader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(lib.uniforms)
  } as THREE.WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  return shader
}

describe("vegetation materials", () => {
  it("give each family one material over its atlas: cards cut out and double-sided, rock solid", () => {
    const atlases = blankAtlases()
    const { materials, depthMaterials } = createVegetationMaterials(atlases, 16)
    expect(Object.keys(materials).sort()).toEqual(["isl_flowers", "isl_foliage", "isl_grass", "isl_rock"])
    for (const family of CARD_FAMILIES) {
      expect(materials[family]).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(materials[family]).toMatchObject({
        name: family,
        map: atlases[family],
        alphaTest: 0.5,
        transparent: false,
        side: THREE.DoubleSide,
        vertexColors: true,
        roughness: 0.8,
        metalness: 0
      })
      expect(atlases[family]).toMatchObject({
        colorSpace: THREE.SRGBColorSpace,
        flipY: false,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        anisotropy: 8,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping
      })
      expect(depthMaterials[family]).toMatchObject({ map: atlases[family], alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking })
    }
    expect(materials.isl_rock).toMatchObject({
      name: "isl_rock",
      map: atlases.isl_rock,
      alphaTest: 0,
      transparent: false,
      side: THREE.FrontSide,
      vertexColors: true
    })
    expect(atlases.isl_rock).toMatchObject({
      colorSpace: THREE.SRGBColorSpace,
      flipY: false,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping
    })
    expect(depthMaterials.isl_rock).toBeUndefined()
  })

  it("filter the atlases with the renderer's anisotropy when it offers fewer than 8 taps", () => {
    const atlases = blankAtlases()
    createVegetationMaterials(atlases, 4)
    for (const family of VEGETATION_FAMILIES) expect(atlases[family].anisotropy).toBe(4)
  })

  it("sway the cards and their shadows by COLOR_1 under one set of wind uniforms, and leave the rock still", () => {
    const { materials, depthMaterials } = createVegetationMaterials(blankAtlases(), 8)
    const foliage = prepareShader(materials.isl_foliage, THREE.ShaderLib.standard)
    const flowers = prepareShader(materials.isl_flowers, THREE.ShaderLib.standard)
    const shadow = prepareShader(depthMaterials.isl_foliage!, THREE.ShaderLib.depth)
    for (const shader of [foliage, flowers, shadow]) {
      expect(shader.vertexShader).toContain("attribute vec4 color_1;")
      expect(shader.vertexShader.indexOf("transformed += windLocal")).toBeGreaterThan(
        shader.vertexShader.indexOf("#include <begin_vertex>")
      )
      expect(Object.keys(shader.uniforms)).toEqual(expect.arrayContaining(["uTime", "uWindDir", "uWindStrength"]))
    }
    expect(flowers.uniforms.uTime).toBe(foliage.uniforms.uTime)
    expect(foliage.uniforms.uWindDir.value).toBe(WIND_DIRECTION)
    expect(shadow.uniforms.uWindStrength).toBe(foliage.uniforms.uWindStrength)
    expect(prepareShader(materials.isl_rock, THREE.ShaderLib.standard).vertexShader).not.toContain("color_1")
  })
})
