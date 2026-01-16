export const BASE_URL = import.meta.env.BASE_URL

export function withBase(path: string) {
  const normalized = path.startsWith("/") ? path.slice(1) : path
  return `${BASE_URL}${normalized}`
}
