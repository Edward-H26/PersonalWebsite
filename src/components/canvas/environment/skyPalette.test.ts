import { describe, expect, it } from "vitest"
import { Color, Vector3 } from "three"
import { SUN_AZIMUTH, SUN_ELEVATION } from "@/components/canvas/scene/lighting"
import { DEFAULT_SKY_HOUR, skyAt, sunDirection } from "./skyPalette"
import { SKY_UNIFORMS, setSkyHour } from "./skyShader"

const hex = (colour: Color) => `#${colour.getHexString()}`

describe("skyAt", () => {
  it("keeps the island's dusk at the default hour: the sun 2 degrees up in the west, in the dusk palette", () => {
    const dusk = skyAt(DEFAULT_SKY_HOUR)
    expect(dusk.sunElevation).toBe(SUN_ELEVATION)
    expect(dusk.sunAzimuth).toBe(SUN_AZIMUTH)
    expect(hex(dusk.haze)).toBe("#a39b93")
    expect(hex(dusk.horizon)).toBe("#958585")
    expect(hex(dusk.zenith)).toBe("#5b6f76")
    expect(hex(dusk.glow)).toBe("#e8a66f")
  })

  it("darkens to the loader's deep-sea navy at midnight", () => {
    expect(hex(skyAt(0).zenith)).toBe("#06101f")
    expect(hex(skyAt(0).mid)).toBe("#0b1e3f")
    expect(skyAt(0).sunElevation).toBeLessThan(0)
  })

  it("wraps the hours of the day", () => {
    for (const hour of [3.2, 11, DEFAULT_SKY_HOUR, 22.9]) {
      expect(skyAt(hour + 24)).toEqual(skyAt(hour))
      expect(skyAt(hour - 24)).toEqual(skyAt(hour))
    }
  })

  it("blends between key hours, the sun taking the short way round the compass", () => {
    const golden = skyAt(17.25)
    const halfway = skyAt((17.25 + DEFAULT_SKY_HOUR) / 2)
    expect(halfway.sunElevation).toBeCloseTo((golden.sunElevation + SUN_ELEVATION) / 2, 9)
    // 105 degrees at 5:30 to 75 degrees at 7:00 passes east (90), not west (270).
    expect(skyAt(6.25).sunAzimuth).toBeCloseTo(90, 9)
  })
})

describe("the shared sky", () => {
  it("points the sun low in the west, along -x", () => {
    const sun = sunDirection(skyAt(DEFAULT_SKY_HOUR))
    expect(sun.x).toBeLessThan(-0.99)
    expect(sun.y).toBeCloseTo(Math.sin((2 * Math.PI) / 180), 6)
  })

  it("writes an hour into the uniforms the dome, the sea and the clouds share", () => {
    setSkyHour(12.5)
    expect(hex(SKY_UNIFORMS.uHorizon.value)).toBe("#b9d9eb")
    expect(SKY_UNIFORMS.uSunDirection.value.y).toBeGreaterThan(0.8)
    setSkyHour(DEFAULT_SKY_HOUR)
    expect(hex(SKY_UNIFORMS.uHaze.value)).toBe("#a39b93")
    expect(SKY_UNIFORMS.uSunDirection.value).toBeInstanceOf(Vector3)
  })
})
