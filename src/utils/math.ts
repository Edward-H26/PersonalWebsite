export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function clamp01(value: number) {
  return clamp(value, 0, 1)
}

export function clampInt(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function smoothstep01(t: number) {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

function fract(value: number) {
  return value - Math.floor(value)
}

export function seededRandom(seed: number) {
  return fract(Math.sin(seed) * 43758.5453123)
}

export function seededRandomSigned(seed: number) {
  return seededRandom(seed) * 2 - 1
}
