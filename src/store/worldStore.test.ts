import { beforeEach, describe, expect, it } from "vitest"
import { useWorldStore } from "./worldStore"

const progress = () => useWorldStore.getState().loadProgress
const report = (share: number) => useWorldStore.getState().reportLoadProgress(share)

describe("the load's progress", () => {
  beforeEach(() => useWorldStore.setState({ loadProgress: 0 }))

  it("only ever grows, whatever is reported and in whatever order", () => {
    const seen: number[] = []
    for (const share of [0.2, 0.1, 0.5, 0, 0.45, 0.9, 0.3, 1, 0.99]) {
      report(share)
      seen.push(progress())
    }
    expect(seen).toEqual([0.2, 0.2, 0.5, 0.5, 0.5, 0.9, 0.9, 1, 1])
  })

  it("stays between 0 and 1", () => {
    report(-1)
    expect(progress()).toBe(0)
    report(7)
    expect(progress()).toBe(1)
  })
})
