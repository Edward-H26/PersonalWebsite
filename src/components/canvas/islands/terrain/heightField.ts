import { clamp } from "@/utils/math"
import type { MapFrame } from "./terrainData"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const GREYSCALE = 0
const SAMPLE_BYTES = 2
const MAX_GREY = 65535

/** h, the ground's height as a fraction of the peak, at every pixel of the island map; row 0 is the north edge. */
export class HeightField {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly values: Float32Array
  ) {}

  /** h at a map point, blended between the four nearest pixels and held at the map's edge beyond it. */
  sample(x: number, y: number) {
    const cx = clamp(x, 0, this.width - 1)
    const cy = clamp(y, 0, this.height - 1)
    const x0 = Math.min(Math.floor(cx), this.width - 2)
    const y0 = Math.min(Math.floor(cy), this.height - 2)
    const fx = cx - x0
    const fy = cy - y0
    const v = this.values
    const i = y0 * this.width + x0
    const north = v[i] + (v[i + 1] - v[i]) * fx
    const south = v[i + this.width] + (v[i + this.width + 1] - v[i + this.width]) * fx
    return north + (south - north) * fy
  }
}

/** The ground's scene height under a scene x/z. */
export function groundHeightSampler(field: HeightField, map: MapFrame) {
  return (sceneX: number, sceneZ: number) =>
    field.sample(sceneX / map.unitsPerPx + map.origin[0], sceneZ / map.unitsPerPx + map.origin[1]) * map.heightScale
}

async function inflate(bytes: Uint8Array) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    }
  }).pipeThrough(new DecompressionStream("deflate"))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    length += value.length
  }
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function paeth(left: number, up: number, upLeft: number) {
  const p = left + up - upLeft
  const toLeft = Math.abs(p - left)
  const toUp = Math.abs(p - up)
  const toUpLeft = Math.abs(p - upLeft)
  if (toLeft <= toUp && toLeft <= toUpLeft) return left
  return toUp <= toUpLeft ? up : upLeft
}

/** Undoes the PNG row filters in place, so each row holds its raw samples. */
function unfilterRows(raw: Uint8Array, width: number, height: number) {
  const stride = width * SAMPLE_BYTES
  const rows = new Uint8Array(height * stride)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = y * stride
    const above = row - stride
    for (let i = 0; i < stride; i += 1) {
      const left = i >= SAMPLE_BYTES ? rows[row + i - SAMPLE_BYTES] : 0
      const up = y > 0 ? rows[above + i] : 0
      const upLeft = y > 0 && i >= SAMPLE_BYTES ? rows[above + i - SAMPLE_BYTES] : 0
      const predictor =
        filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : 0
      rows[row + i] = (line[i] + predictor) & 0xff
    }
  }
  return rows
}

/**
 * Reads terrain_height.png, a 16-bit greyscale PNG whose grey g holds h = range[0] + g / 65535 *
 * (range[1] - range[0]). Browsers decode images to 8 bits, which would step the ground by 30 cm, so the
 * PNG is unpacked here: chunks, zlib through DecompressionStream, then the row filters.
 */
export async function decodeHeightPng(png: ArrayBuffer, range: readonly [number, number]) {
  const bytes = new Uint8Array(png)
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error("The heightmap is not a PNG")
  const view = new DataView(png)
  let width = 0
  let height = 0
  const data: Uint8Array[] = []
  for (let offset = PNG_SIGNATURE.length; offset < bytes.length;) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      const [bitDepth, colourType, , , interlace] = body.subarray(8, 13)
      if (bitDepth !== 16 || colourType !== GREYSCALE || interlace !== 0) {
        throw new Error("The heightmap must be a 16-bit greyscale PNG without interlacing")
      }
    } else if (type === "IDAT") {
      data.push(body)
    }
    offset += length + 12
  }

  const compressed = new Uint8Array(data.reduce((sum, chunk) => sum + chunk.length, 0))
  data.reduce((at, chunk) => (compressed.set(chunk, at), at + chunk.length), 0)
  const rows = unfilterRows(await inflate(compressed), width, height)

  const values = new Float32Array(width * height)
  const scale = (range[1] - range[0]) / MAX_GREY
  for (let i = 0; i < values.length; i += 1) values[i] = range[0] + ((rows[2 * i] << 8) | rows[2 * i + 1]) * scale
  return new HeightField(width, height, values)
}
