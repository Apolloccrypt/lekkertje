const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const EXT_PATH = path.resolve(__dirname, '../src/drivers/webextension')
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots')
const TEST_SITES = [
  { url: 'https://werkenbijdefensie.nl', expected: 'rood', minVendors: 3 },
  // nu.nl redirect direct naar myprivacy.dpgmedia.nl (DPG-consent-portaal),
  // waar de extensie pre-consent slechts Akamai + GTM ziet. Threshold ≥1
  // is de eerlijke baseline voor deze redirect-flow.
  { url: 'https://nu.nl', expected: 'redirect-pagina', minVendors: 1 },
  { url: 'https://openkat.nl', expected: 'groen/grijs', minVendors: 0 },
]

;(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR))
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const userDataDir = '/tmp/lekkertje-test-profile'
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

  const extId = sw.url().split('/')[2]
  console.log(`\n[Lekkertje] Extension ID: ${extId}`)
  console.log(`[Lekkertje] Service worker: ${sw.url()}\n`)

  const results = []

  for (const site of TEST_SITES) {
    console.log(`\n=== Testing ${site.url} ===`)
    const page = await context.newPage()

    try {
      await page.goto(site.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
    } catch (e) {
      console.log(`  navigatie fout: ${e.message.split('\n')[0]}`)
    }
    // Forceer activeTab voor Driver.getDetections() (chrome.tabs.query active)
    await page.bringToFront()
    await page.waitForTimeout(8000)

    const hostname = new URL(site.url).hostname.replace(/^www\./, '')

    const pageShot = path.join(SCREENSHOT_DIR, `${hostname}-page.png`)
    await page.screenshot({ path: pageShot, fullPage: false })

    const detections = await sw.evaluate(async (host) => {
      try {
        // eslint-disable-next-line no-undef
        const allKeys = Object.keys(Driver.cache.hostnames)
        // eslint-disable-next-line no-undef
        const cache = Driver.cache.hostnames[host]
        // eslint-disable-next-line no-undef
        const det = await Driver.getDetections()
        // Dump alle cache-entries met hun detections (voor debug)
        // eslint-disable-next-line no-undef
        const allCacheDetails = allKeys.map((h) => ({
          host: h,
          // eslint-disable-next-line no-undef
          hits: Driver.cache.hostnames[h].hits,
          // eslint-disable-next-line no-undef
          dets: (Driver.cache.hostnames[h].detections || []).map(
            (d) => d.technology?.name || '?'
          ),
        }))
        return {
          ok: true,
          cacheKeys: allKeys,
          cacheEntry: cache
            ? { hits: cache.hits, dets: cache.detections?.length }
            : null,
          allCacheDetails,
          detections: det.map((d) => ({
            name: d.name,
            severity: d._lekkertje?.severity_default || null,
            category: d._lekkertje?.category || null,
            jurisdiction: d._lekkertje?.jurisdiction || null,
          })),
        }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    }, hostname)

    const popupPage = await context.newPage()
    try {
      // ?domain=<host> overrulet popup-init.js' chrome.tabs.query lookup,
      // zodat de popup-tab niet zichzelf als active tab ziet.
      await popupPage.goto(
        `chrome-extension://${extId}/html/popup.html?domain=${encodeURIComponent(hostname)}`,
        {
          waitUntil: 'networkidle',
          timeout: 5000,
        }
      )
      await popupPage.setViewportSize({ width: 380, height: 500 })
      await popupPage.waitForTimeout(2000)
      const popupShot = path.join(SCREENSHOT_DIR, `${hostname}-popup.png`)
      await popupPage.screenshot({ path: popupShot })
    } catch (e) {
      console.log(`  popup-screenshot fail: ${e.message.split('\n')[0]}`)
    }
    await popupPage.close()

    console.log(`  cache keys: ${detections.cacheKeys?.length || 0}`)
    if (detections.allCacheDetails) {
      detections.allCacheDetails.forEach((c) => {
        console.log(
          `    cache[${c.host}] hits=${c.hits} dets=[${c.dets.join(', ') || '—'}]`
        )
      })
    }
    console.log(`  detections: ${detections.detections?.length || 0}`)
    if (detections.detections) {
      detections.detections.forEach((d) => {
        console.log(
          `    - ${d.name.padEnd(25)} | ${(d.severity || '—').padEnd(8)} | ${
            d.category || '—'
          } | ${d.jurisdiction || '—'}`
        )
      })
    }

    const passed = (detections.detections?.length || 0) >= site.minVendors
    console.log(
      `  ${passed ? '✓' : '✗'} verwacht ≥${site.minVendors} vendors — gevonden ${
        detections.detections?.length || 0
      }`
    )

    results.push({
      site: site.url,
      expected: site.expected,
      ...detections,
      passed,
    })
    await page.close()
  }

  console.log('\n\n========== SAMENVATTING ==========')
  results.forEach((r) => {
    console.log(
      `${r.passed ? '✓' : '✗'} ${r.site}: ${r.detections?.length || 0} vendors gedetecteerd`
    )
  })
  console.log(`\nScreenshots: ${SCREENSHOT_DIR}`)

  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'test-report.json'),
    JSON.stringify(results, null, 2)
  )

  await context.close()
  process.exit(results.every((r) => r.passed) ? 0 : 1)
})()
