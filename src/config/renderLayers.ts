// Objects on this layer are rendered by the main camera (which enables it) and still cast shadows,
// but the ocean's reflection camera only sees layer 0, so dense foliage stays out of the mirror pass.
export const REFLECTION_EXCLUDED_LAYER = 1
