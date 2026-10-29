import * as THREE from "three"

// MeshStandardMaterial samples ambient occlusion from the second UV set, which mirrors the first.
function applyAoUv(geo: THREE.BufferGeometry) {
  if (geo.attributes.uv && !geo.attributes.uv1) {
    geo.setAttribute("uv1", new THREE.BufferAttribute(geo.attributes.uv.array, 2))
  }
}

/** Packs positions, uvs and an index into an indexed geometry with computed normals and the AO uv set. */
export function assembleGeometry(positions: Float32Array, uvs: Float32Array, index: number[] | THREE.BufferAttribute) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  applyAoUv(geo)
  return geo
}
