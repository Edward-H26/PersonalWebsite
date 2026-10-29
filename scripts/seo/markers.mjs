// The generated blocks live between these comments in index.html, so the rest of the file stays hand-written.
export const HEAD_MARKERS = ["<!-- seo:head -->", "<!-- /seo:head -->"]
export const BODY_MARKERS = ["<!-- seo:body -->", "<!-- /seo:body -->"]

function locate(html, [start, end]) {
  const from = html.indexOf(start)
  const to = html.indexOf(end)
  if (from < 0 || to < from) throw new Error(`Markers ${start} and ${end} were not found`)
  return { from, to }
}

/** The text between a marker pair. */
export function extractBetween(html, markers) {
  const { from, to } = locate(html, markers)
  return html.slice(from + markers[0].length, to)
}

/** Replaces the text between a marker pair, indenting every line of the replacement. */
export function replaceBetween(html, markers, replacement, indent) {
  const { from, to } = locate(html, markers)
  const block = replacement
    .split("\n")
    .map((line) => indent + line)
    .join("\n")
  return `${html.slice(0, from + markers[0].length)}\n${block}\n${indent}${html.slice(to)}`
}
