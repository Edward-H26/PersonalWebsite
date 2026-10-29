import { describe, expect, it } from "vitest"
import { LOOK_YAW_PER_KEY, TOUCH_LOOK_START_PX, classifyKey, classifyWheel, isEditableTarget, isLookDrag } from "./inputClassification"

function keyEvent(key: string, init: Partial<KeyboardEvent> = {}) {
  return { key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false, target: null, ...init }
}

describe("classifyWheel", () => {
  it("ignores sub-pixel noise on both axes", () => {
    expect(classifyWheel(0.5, 0.9)).toBe("ignore")
    expect(classifyWheel(0, 0)).toBe("ignore")
  })

  it("looks sideways for mostly horizontal input and pages otherwise", () => {
    expect(classifyWheel(80, 4)).toBe("look")
    expect(classifyWheel(4, 80)).toBe("page")
    expect(classifyWheel(50, 50)).toBe("page")
    expect(classifyWheel(0, 1)).toBe("page")
  })
})

describe("classifyKey", () => {
  it("pages down with ArrowDown, PageDown and Space, and up with their counterparts", () => {
    expect(classifyKey(keyEvent("ArrowDown"))).toEqual({ kind: "page", direction: 1 })
    expect(classifyKey(keyEvent("PageDown"))).toEqual({ kind: "page", direction: 1 })
    expect(classifyKey(keyEvent(" "))).toEqual({ kind: "page", direction: 1 })
    expect(classifyKey(keyEvent("ArrowUp"))).toEqual({ kind: "page", direction: -1 })
    expect(classifyKey(keyEvent("PageUp"))).toEqual({ kind: "page", direction: -1 })
    expect(classifyKey(keyEvent(" ", { shiftKey: true }))).toEqual({ kind: "page", direction: -1 })
  })

  it("turns the camera with the horizontal arrows", () => {
    expect(classifyKey(keyEvent("ArrowLeft"))).toEqual({ kind: "look", deltaYaw: LOOK_YAW_PER_KEY })
    expect(classifyKey(keyEvent("ArrowRight"))).toEqual({ kind: "look", deltaYaw: -LOOK_YAW_PER_KEY })
  })

  it("leaves other keys, modified keys, handled events and form fields alone", () => {
    expect(classifyKey(keyEvent("Enter"))).toBeNull()
    expect(classifyKey(keyEvent("ArrowDown", { metaKey: true }))).toBeNull()
    expect(classifyKey(keyEvent("ArrowDown", { ctrlKey: true }))).toBeNull()
    expect(classifyKey(keyEvent("ArrowDown", { altKey: true }))).toBeNull()
    expect(classifyKey(keyEvent("ArrowDown", { defaultPrevented: true }))).toBeNull()
    expect(classifyKey(keyEvent("ArrowDown", { target: document.createElement("textarea") }))).toBeNull()
  })
})

describe("isEditableTarget", () => {
  it("covers inputs, text areas, selects and contenteditable elements", () => {
    for (const tag of ["input", "textarea", "select"]) expect(isEditableTarget(document.createElement(tag))).toBe(true)
    const editable = document.createElement("div")
    Object.defineProperty(editable, "isContentEditable", { value: true })
    expect(isEditableTarget(editable)).toBe(true)
    expect(isEditableTarget(document.createElement("div"))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe("isLookDrag", () => {
  it("needs a clearly horizontal drag beyond the start distance", () => {
    expect(isLookDrag(TOUCH_LOOK_START_PX, 2)).toBe(true)
    expect(isLookDrag(-TOUCH_LOOK_START_PX - 5, 3)).toBe(true)
    expect(isLookDrag(TOUCH_LOOK_START_PX - 1, 0)).toBe(false)
    expect(isLookDrag(20, 20)).toBe(false)
    expect(isLookDrag(5, 60)).toBe(false)
  })
})
