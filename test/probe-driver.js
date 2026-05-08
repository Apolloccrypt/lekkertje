/* probe-driver.js — minimaal-laad de extensie en interrogeert de Wappalyzer-state.
   Gaat NIET browsen — alleen de service-worker introspecteren. */
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const EXT_PATH = path.resolve(__dirname, '../src/drivers/webextension')

;(async () => {
  const userDataDir = '/tmp/lekkertje-probe-profile'
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true })

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  })

  let sw = context.serviceWorkers()[0]
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 })

  console.log('SW URL:', sw.url())

  // Bezoek werkenbijdefensie.nl, geef tijd, dan probe.
  const page = await context.newPage()
  try {
    await page.goto('https://werkenbijdefensie.nl', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
  } catch (e) {
    console.log('navigation:', e.message.split('\n')[0])
  }
  await page.waitForTimeout(8000)

  const probe = await sw.evaluate(async () => {
    /* eslint-disable no-undef */
    try {
      const result = {
        techsLoaded: (Wappalyzer.technologies || []).length,
        catsLoaded: (Wappalyzer.categories || []).length,
        sampleTechs: (Wappalyzer.technologies || [])
          .slice(0, 5)
          .map((t) => ({
            name: t.name,
            cats: t.categories,
            scriptSrcCount: (t.scriptSrc || []).length,
            cookieCount: Object.keys(t.cookies || {}).length,
            hasLekkertje: !!t._lekkertje,
          })),
        cacheHostnames: Object.keys(Driver.cache.hostnames || {}),
        analyzedSitesCount: Object.values(Driver.cache.hostnames || {})
          .map((c) => (c.analyzedScripts || []).length)
          .reduce((a, b) => a + b, 0),
        cacheDetailWBD: Driver.cache.hostnames['werkenbijdefensie.nl']
          ? {
              hits: Driver.cache.hostnames['werkenbijdefensie.nl'].hits,
              detections:
                Driver.cache.hostnames['werkenbijdefensie.nl'].detections
                  ?.length || 0,
              analyzed:
                Driver.cache.hostnames['werkenbijdefensie.nl'].analyzedScripts
                  ?.length || 0,
              sampleAnalyzed: (
                Driver.cache.hostnames['werkenbijdefensie.nl']
                  .analyzedScripts || []
              ).slice(0, 5),
            }
          : null,
      }
      // Run detection manually voor de active tab
      result.getDetectionsResult = await Driver.getDetections()
      result.getDetectionsCount = (result.getDetectionsResult || []).length
      return result
    } catch (e) {
      return { error: e.message, stack: e.stack }
    }
    /* eslint-enable no-undef */
  })

  console.log(JSON.stringify(probe, null, 2))
  await context.close()
})()
