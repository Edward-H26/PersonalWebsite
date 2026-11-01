type Vec3 = readonly [number, number, number]

/** A fixed camera pose for a still rendered from the scene rather than walked to. */
export type StillShot = { readonly position: Vec3; readonly lookAt: Vec3; readonly fov: number }

export const STILL_SHOTS = {
  /** The Open Graph card (scripts/capture-og-image.mjs): the REVA in the harbor with the island behind it. */
  og: { position: [-200, 32, 215], lookAt: [-110, 18, 110], fov: 36 }
} as const satisfies Record<string, StillShot>

/** The still asked for with `?shot=<name>`, or null. Only the dev server reads it, for the capture script. */
export function requestedStillShot(search: string): StillShot | null {
  const name = new URLSearchParams(search).get("shot")
  return name !== null && Object.prototype.hasOwnProperty.call(STILL_SHOTS, name) ? STILL_SHOTS[name as keyof typeof STILL_SHOTS] : null
}
