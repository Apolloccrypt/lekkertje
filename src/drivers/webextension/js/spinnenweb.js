/* spinnenweb.js — overzicht-renderer voor de Lekkertje-popup.
   Naam is historisch (was een spider-web SVG); v0.3 toont nu een
   Wappalyzer-stijl categorie-overzicht met data-flow-bar. */
;(function () {
  'use strict'

  const SEVERITY_ORDER = { kritiek: 0, ernstig: 1, let_op: 2, onbekend: 3 }
  const SEVERITY_LABEL = {
    kritiek: 'KRITIEK',
    ernstig: 'ERNSTIG',
    let_op: 'LET OP',
    onbekend: 'ONBEKEND',
  }

  // Vlag + label per jurisdictie. Dekt onze 19 patterns.
  const JURISDICTION = {
    US: { flag: '🇺🇸', label: 'Verenigde Staten', color: '#cc0000' },
    EU: { flag: '🇪🇺', label: 'EU', color: '#003399' },
    NL: { flag: '🇳🇱', label: 'Nederland', color: '#ae1c28' },
    'US+EU': { flag: '🇺🇸/🇪🇺', label: 'US + EU', color: '#7a3a7a' },
    'US+IL': { flag: '🇺🇸/🇮🇱', label: 'US + Israel', color: '#7a3a7a' },
    'US+AT': { flag: '🇺🇸/🇦🇹', label: 'US + Oostenrijk', color: '#7a3a7a' },
    'EU+US-cloud': { flag: '🇪🇺→🇺🇸', label: 'EU op US-cloud', color: '#a34a00' },
    UK: { flag: '🇬🇧', label: 'VK', color: '#012169' },
    IL: { flag: '🇮🇱', label: 'Israel', color: '#0038b8' },
    ROW: { flag: '🌐', label: 'Wereldwijd', color: '#666' },
    MIXED: { flag: '🌐', label: 'Gemengd', color: '#666' },
  }

  // Groepen → Dutch label + render-volgorde.
  const CATEGORY_ORDER = [
    'Statistieken',
    'Sessie-opname',
    'Advertenties / retargeting',
    'Tag-loaders',
    'CDN / netwerk',
    'Consent-banners',
    'Crash-tracking',
    'Surveys',
    'Zoekfunctie',
    'Customer-experience',
    'Identity-broker',
    'Overig',
  ]

  function categoryLabel(meta) {
    if (!meta) return 'Overig'
    const what = (meta.what || '').toLowerCase()
    const cat = meta.category || ''

    if (cat === 'analytics') {
      if (
        what.includes('sessie-opname') ||
        what.includes('experience') ||
        what.includes('replay') ||
        what.includes('heatmap')
      ) {
        return 'Sessie-opname'
      }
      return 'Statistieken'
    }
    if (cat === 'advertising') return 'Advertenties / retargeting'
    if (cat === 'platform') {
      if (what.includes('cdn') || what.includes('netwerk')) {
        return 'CDN / netwerk'
      }
      if (what.includes('tag-loader')) return 'Tag-loaders'
      if (what.includes('cookie-toestem')) return 'Consent-banners'
      if (what.includes('zoek')) return 'Zoekfunctie'
      return 'CDN / netwerk'
    }
    if (cat === 'error-tracking') return 'Crash-tracking'
    if (cat === 'survey') return 'Surveys'
    if (cat === 'identity-broker') return 'Identity-broker'
    if (cat === 'consent-management') return 'Consent-banners'
    return 'Overig'
  }

  // Rating-mapping (1-5 sterren).
  function ratingFor(meta) {
    if (!meta || !meta.severity_default) return 5
    const sev = meta.severity_default
    if (sev === 'kritiek') return 1
    if (sev === 'ernstig') return meta.cloud_act ? 2 : 3
    if (sev === 'let_op') return meta.cloud_act ? 3 : 4
    return 5
  }

  function severityFromContext(ctx) {
    if (!ctx) return 'let_op'
    const lc = ctx.toLowerCase()
    if (
      lc.includes('na refuse') ||
      lc.includes('na weigeren') ||
      lc.includes('weigeren werkt niet')
    )
      return 'kritiek'
    if (
      lc.includes('vóór consent') ||
      lc.includes('voor consent') ||
      lc.includes('pre-consent')
    )
      return 'ernstig'
    if (lc.includes('lange bewaartermijn')) return 'ernstig'
    return 'let_op'
  }

  function worse(a, b) {
    return SEVERITY_ORDER[a] < SEVERITY_ORDER[b] ? a : b
  }

  function aggregateVendors(site) {
    const map = new Map()
    if (!site) return []
    const cookies = site.cookies || []
    const trackers = site.trackers || []

    function severityForEntry(entry) {
      const meta = entry && entry._lekkertje
      if (meta && meta.severity_default) return meta.severity_default
      return severityFromContext(entry && entry.context)
    }

    function bump(entry) {
      const vendor = entry.vendor
      if (!vendor) return
      const sev = severityForEntry(entry)
      const cur = map.get(vendor) || {
        vendor,
        severity: 'onbekend',
        count: 0,
        meta: entry._lekkertje || null,
      }
      cur.count += 1
      cur.severity = worse(sev, cur.severity)
      if (!cur.meta && entry._lekkertje) cur.meta = entry._lekkertje
      map.set(vendor, cur)
    }

    cookies.forEach(bump)
    trackers.forEach(bump)
    ;(site.vendors_geclassificeerd || []).forEach((v) => {
      if (!map.has(v))
        map.set(v, { vendor: v, severity: 'onbekend', count: 0, meta: null })
    })

    return Array.from(map.values()).sort((a, b) => {
      const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (s !== 0) return s
      return b.count - a.count
    })
  }

  function siteRating(vendors) {
    if (!vendors.length) return 5
    let min = 5
    vendors.forEach((v) => {
      const r = ratingFor(v.meta)
      if (r < min) min = r
    })
    return min
  }

  function rollupSeverity(site, vendors) {
    const sc = (site && site.severity_counts) || {}
    if (sc.kritiek) return 'kritiek'
    if (sc.ernstig) return 'ernstig'
    if (sc.let_op) return 'let_op'
    if (vendors && vendors.length) {
      let worst = 'onbekend'
      vendors.forEach((v) => {
        worst = worse(v.severity, worst)
      })
      return worst
    }
    return 'onbekend'
  }

  function starString(rating) {
    rating = Math.max(0, Math.min(5, rating | 0))
    return '★'.repeat(rating) + '☆'.repeat(5 - rating)
  }

  // ---- Datastroom-bar -------------------------------------------------

  function jurisdictionEffective(meta) {
    // EU+US-cloud → effectief US (data raakt CLOUD Act); anders raw.
    if (!meta) return 'onbekend'
    const j = meta.jurisdiction
    if (j === 'EU+US-cloud') return 'US'
    if (meta.cloud_act && (j === 'EU' || j === 'NL') && j !== undefined) {
      return 'US' // EU-tool met US-cloud → effectief US
    }
    return j || 'onbekend'
  }

  function jurisdictionDistribution(vendors) {
    const counts = new Map()
    vendors.forEach((v) => {
      const j = jurisdictionEffective(v.meta)
      counts.set(j, (counts.get(j) || 0) + 1)
    })
    // Sort by count desc, then US first
    const order = (j) => (j === 'US' ? -1 : 0)
    return Array.from(counts.entries()).sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1]
      return order(a[0]) - order(b[0])
    })
  }

  function renderFlow(doc, vendors) {
    const flow = doc.getElementById('lk-flow')
    const bar = doc.getElementById('lk-flow-bar')
    const legend = doc.getElementById('lk-flow-legend')
    if (!flow || !bar || !legend) return
    if (!vendors.length) {
      flow.hidden = true
      return
    }
    flow.hidden = false
    bar.innerHTML = ''
    legend.innerHTML = ''

    const dist = jurisdictionDistribution(vendors)
    const total = vendors.length

    dist.forEach(([j, count]) => {
      const meta = JURISDICTION[j] || {
        flag: '❓',
        label: j,
        color: '#888',
      }
      const seg = document.createElement('div')
      seg.className = 'lk-flow-seg'
      seg.style.flex = String(count)
      seg.style.background = meta.color
      seg.title = meta.label + ' — ' + count + ' van ' + total
      bar.appendChild(seg)

      const item = document.createElement('span')
      item.className = 'lk-flow-item'
      item.innerHTML =
        '<span class="lk-flow-flag">' +
        meta.flag +
        '</span> ' +
        '<span class="lk-flow-count">' +
        count +
        '</span> ' +
        '<span class="lk-flow-label">' +
        meta.label +
        '</span>'
      legend.appendChild(item)
    })
  }

  // ---- Categorie-groepen + vendor-cards -------------------------------

  function vendorCard(v) {
    const meta = v.meta || {}
    const rating = ratingFor(meta)
    const li = document.createElement('li')
    li.className = 'lk-vendor-card lk-sev-' + v.severity

    const head = document.createElement('div')
    head.className = 'lk-vc-head'

    const stars = document.createElement('span')
    stars.className = 'lk-vc-stars'
    stars.dataset.rating = String(rating)
    stars.textContent = starString(rating)
    stars.setAttribute('aria-label', rating + ' van 5 sterren')

    const name = document.createElement('span')
    name.className = 'lk-vc-name'
    name.textContent = v.vendor

    const flag = document.createElement('span')
    flag.className = 'lk-vc-flag'
    const j = JURISDICTION[meta.jurisdiction]
    flag.textContent = j ? j.flag : ''
    if (meta.jurisdiction) flag.title = 'Jurisdictie: ' + meta.jurisdiction

    head.appendChild(stars)
    head.appendChild(name)
    head.appendChild(flag)
    if (meta.cloud_act) {
      const cloudFlag = document.createElement('span')
      cloudFlag.className = 'lk-vc-cloud'
      cloudFlag.textContent = '⚠ CLOUD Act'
      cloudFlag.title = 'Data valt onder de Amerikaanse CLOUD Act'
      head.appendChild(cloudFlag)
    }

    li.appendChild(head)

    if (meta.what) {
      const what = document.createElement('div')
      what.className = 'lk-vc-what'
      what.textContent = meta.what
      li.appendChild(what)
    }

    if (meta.note) {
      const note = document.createElement('div')
      note.className = 'lk-vc-note'
      note.textContent = meta.note
      li.appendChild(note)
    }

    return li
  }

  function groupVendorsByCategory(vendors) {
    const groups = new Map()
    vendors.forEach((v) => {
      const label = categoryLabel(v.meta)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(v)
    })
    // Sorteer groepen via CATEGORY_ORDER
    const sorted = []
    CATEGORY_ORDER.forEach((cat) => {
      if (groups.has(cat)) sorted.push([cat, groups.get(cat)])
    })
    // Onverwachte categorieën aan het eind
    Array.from(groups.entries()).forEach(([k, v]) => {
      if (!CATEGORY_ORDER.includes(k)) sorted.push([k, v])
    })
    return sorted
  }

  function renderCategories(doc, vendors) {
    const container = doc.getElementById('lk-categories')
    if (!container) return
    container.innerHTML = ''

    const groups = groupVendorsByCategory(vendors)
    groups.forEach(([catLabel, items]) => {
      const section = document.createElement('section')
      section.className = 'lk-cat'

      // Worst severity in group → bepaalt header-kleur
      let worst = 'onbekend'
      items.forEach((it) => {
        worst = worse(it.severity, worst)
      })
      section.dataset.severity = worst

      const head = document.createElement('header')
      head.className = 'lk-cat-head'
      const title = document.createElement('div')
      title.className = 'lk-cat-title'
      title.textContent = catLabel
      const count = document.createElement('div')
      count.className = 'lk-cat-count'
      count.textContent =
        items.length + (items.length === 1 ? ' vendor' : ' vendors')
      head.appendChild(title)
      head.appendChild(count)
      section.appendChild(head)

      const ul = document.createElement('ul')
      ul.className = 'lk-vendor-list'
      items.forEach((v) => ul.appendChild(vendorCard(v)))
      section.appendChild(ul)

      container.appendChild(section)
    })
  }

  // ---- Top-rating + legenda -------------------------------------------

  function renderRating(doc, site, vendors) {
    const level = rollupSeverity(site, vendors)
    const rating = siteRating(vendors)
    const ratingEl = doc.getElementById('lk-rating')
    const starsEl = doc.getElementById('lk-stars')
    const labelEl = doc.getElementById('lk-sev-label')
    const countEl = doc.getElementById('lk-sev-count')

    ratingEl.dataset.level = level
    starsEl.textContent = starString(rating)
    starsEl.dataset.rating = String(rating)
    labelEl.textContent = vendors.length
      ? SEVERITY_LABEL[level] || level
      : 'SCHOON'

    if (vendors.length) {
      const cloudCount = vendors.filter(
        (v) => v.meta && v.meta.cloud_act
      ).length
      const tail = cloudCount ? ' · ' + cloudCount + ' onder CLOUD Act' : ''
      countEl.textContent =
        vendors.length + (vendors.length === 1 ? ' vendor' : ' vendors') + tail
    } else {
      countEl.textContent = 'geen trackers gedetecteerd'
    }
  }

  function renderLegendStars(doc) {
    doc.querySelectorAll('.lk-stars-static').forEach((el) => {
      const r = parseInt(el.dataset.rating, 10) || 0
      el.textContent = starString(r)
    })
  }

  // ---- Hoofd-render ---------------------------------------------------

  function render(site, doc) {
    const vendors = aggregateVendors(site)
    const empty = doc.getElementById('lk-empty')
    const categories = doc.getElementById('lk-categories')

    renderRating(doc, site, vendors)
    renderLegendStars(doc)
    renderFlow(doc, vendors)

    if (!vendors.length) {
      categories.innerHTML = ''
      if (empty) {
        empty.style.display = ''
        empty.textContent = 'Geen trackers gedetecteerd op deze pagina.'
      }
      return
    }
    if (empty) {
      empty.style.display = 'none'
      empty.textContent = ''
    }
    renderCategories(doc, vendors)
  }

  window.lekkertjeRender = render
  window.lekkertjeAggregate = aggregateVendors
  window.lekkertjeRating = ratingFor
})()
