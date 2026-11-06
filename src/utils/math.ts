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

/** GLSL's smoothstep: 0 below `edge0`, 1 above `edge1`, a Hermite ease between. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  return smoothstep01((x - edge0) / (edge1 - edge0))
}

export function fract(value: number) {
  return value - Math.floor(value)
}

/** The signed step from `from` to `to` the short way round a loop of length 1, from -0.5 up to 0.5. */
export function loopDelta(from: number, to: number) {
  const delta = to - from
  return delta - Math.round(delta)
}

export function seededRandom(seed: number) {
  return fract(Math.sin(seed) * 43758.5453123)
}

export function seededRandomSigned(seed: number) {
  return seededRandom(seed) * 2 - 1
}
