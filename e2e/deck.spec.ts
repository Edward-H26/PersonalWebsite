import { expect, test, type Page } from "@playwright/test"

const DECK = "#main-content"

async function openDeck(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(String(error)))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto("/")
  await page.waitForFunction((selector) => document.querySelector(selector)?.classList.contains("overflow-y-auto"), DECK, {
    timeout: 120_000
  })
  await page.waitForTimeout(1500)
  return errors
}

async function slideIndex(page: Page) {
  return page.evaluate((selector) => {
    const deck = document.querySelector(selector) as HTMLElement
    const height = (deck.firstElementChild as HTMLElement).offsetHeight
    return Math.round((deck.scrollTop / height) * 100) / 100
  }, DECK)
}

async function activeNav(page: Page) {
  return page.locator('nav button[aria-current="page"]').first().textContent()
}

async function waitForSlide(page: Page, index: number) {
  await page.waitForFunction(
    ({ selector, index }) => {
      const deck = document.querySelector(selector) as HTMLElement
      const height = (deck.firstElementChild as HTMLElement).offsetHeight
      return Math.abs(deck.scrollTop / height - index) < 0.01
    },
    { selector: DECK, index },
    { timeout: 5000 }
  )
  await page.waitForTimeout(250)
}

// Smooth scrolling starts a frame after the input, so "snapped right now" can still be the old
// slide. Settled means two readings 150 ms apart agree on a whole slide.
async function settle(page: Page) {
  let previous = -1
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(150)
    const current = await slideIndex(page)
    if (current === previous && Number.isInteger(current)) return current
    previous = current
  }
  throw new Error("deck never settled on a slide")
}

test.describe("scroll deck", () => {
  test("starts on the overview and walks every slide to the end without errors", async ({ page, isMobile }) => {
    const errors = await openDeck(page)
    expect(await slideIndex(page)).toBe(1)
    expect(await activeNav(page)).toMatch(/overview/i)

    const total = await page.locator(`${DECK} > section`).count()
    for (let index = 2; index <= total - 2; index += 1) {
      if (isMobile) {
        await page.evaluate(
          ({ selector, index }) => {
            const deck = document.querySelector(selector) as HTMLElement
            const height = (deck.firstElementChild as HTMLElement).offsetHeight
            deck.scrollTo({ top: index * height, behavior: "auto" })
          },
          { selector: DECK, index }
        )
      } else {
        await page.keyboard.press("ArrowDown")
      }
      await waitForSlide(page, index)
      expect(await slideIndex(page)).toBe(index)

      const panelInView = await page.evaluate(
        ({ selector, index }) => {
          const section = document.querySelectorAll(`${selector} > section`)[index]
          const panel = section.querySelector(".liquid-glass-panel")
          if (!panel) return false
          const box = panel.getBoundingClientRect()
          return box.top >= -1 && box.bottom <= innerHeight + 1 && box.left >= -1 && box.right <= innerWidth + 1
        },
        { selector: DECK, index }
      )
      expect(panelInView, `slide ${index} panel should be inside the viewport`).toBe(true)
    }

    expect(await activeNav(page)).toMatch(/info/i)
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(overflowX).toBe(false)
    expect(errors).toEqual([])
  })

  test("one wheel notch moves exactly one slide and quick repeats do not skip", async ({ page, isMobile }) => {
    test.skip(isMobile, "wheel input is a desktop interaction")
    await openDeck(page)
    await page.mouse.move(1000, 700)
    await page.mouse.wheel(0, 100)
    await waitForSlide(page, 2)
    expect(await activeNav(page)).toMatch(/publications/i)

    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(40)
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(40)
    await page.mouse.wheel(0, 100)
    await waitForSlide(page, 3)
    await page.waitForTimeout(1000)
    expect(await slideIndex(page)).toBe(3)
  })

  test("holding the wheel keeps paging", async ({ page, isMobile }) => {
    test.skip(isMobile, "wheel input is a desktop interaction")
    await openDeck(page)
    await page.mouse.move(1000, 700)
    for (let i = 0; i < 20; i += 1) {
      await page.mouse.wheel(0, 100)
      await page.waitForTimeout(100)
    }
    await settle(page)
    expect(await slideIndex(page)).toBeGreaterThanOrEqual(4)
  })

  test("scrolling inside a card's text never turns the page", async ({ page, isMobile }) => {
    test.skip(isMobile, "wheel input is a desktop interaction")
    await openDeck(page)
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press("ArrowDown")
      await page.waitForTimeout(700)
    }
    const index = await settle(page)
    const scroller = page.locator(`${DECK} > section`).nth(index).locator("[data-story-scroll]")
    await expect(scroller).toBeVisible()
    const canScroll = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
    expect(canScroll).toBe(true)

    const box = (await scroller.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 12; i += 1) {
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(60)
    }
    await page.waitForTimeout(800)
    expect(await slideIndex(page)).toBe(index)
    const atEnd = await scroller.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
    expect(atEnd).toBe(true)
  })

  test("horizontal wheel looks sideways without changing the slide", async ({ page, isMobile }) => {
    test.skip(isMobile, "wheel input is a desktop interaction")
    await openDeck(page)
    await page.keyboard.press("ArrowDown")
    await waitForSlide(page, 2)
    await page.mouse.move(1000, 700)
    await page.mouse.wheel(120, 0)
    await page.waitForTimeout(400)
    expect(await slideIndex(page)).toBe(2)
  })

  test("wraps from the last slide back to the overview and from the overview to the end", async ({ page, isMobile }) => {
    test.skip(isMobile, "wheel input is a desktop interaction")
    await openDeck(page)
    const total = await page.locator(`${DECK} > section`).count()
    await page.mouse.move(1000, 700)
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(1500)
    expect(await slideIndex(page)).toBe(total - 2)
    await page.waitForTimeout(800)
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(1500)
    expect(await slideIndex(page)).toBe(1)
  })

  test("navigation buttons jump to each section", async ({ page }) => {
    await openDeck(page)
    for (const label of ["Publications", "Research", "Projects", "Experience", "Info"]) {
      await page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first().click()
      await page.waitForTimeout(1200)
      expect(await activeNav(page)).toMatch(new RegExp(label, "i"))
    }
  })
})
