/* spinnenweb.js — visualisatie + vendor-cards voor Lekkertje popup.
   Werkt op een site-object dat door mijnoverheid-fetch.js wordt gebouwd
   uit Driver.getDetections(). */
;(function () {
  'use strict'

  const SVG_NS = 'http://www.w3.org/2000/svg'
  const W = 350
  const H = 140
  const CX = W / 2
  const CY = H / 2
  const SPOKE_LEN = 55
  const MAX_SPOKES = 8

  const SEVERITY_ORDER = { kritiek: 0, ernstig: 1, let_op: 2, onbekend: 3 }
  const SEVERITY_COLOR = {
    kritiek: '#cc0000',
    ernstig: '#b87b00',
    let_op: '#4a4a4a',
    onbekend: '#888888',
  }
  const SEVERITY_LABEL = {
    kritiek: 'KRITIEK',
    ernstig: 'ERNSTIG',
    let_op: 'LET OP',
    onbekend: 'ONBEKEND',
  }

  // Vlag-emoji per jurisdiction-string. Niet exhaustief — dekt onze 19 patterns.
  const JURISDICTION_FLAG = {
    US: '🇺🇸',
    EU: '🇪🇺',
    NL: '🇳🇱',
    'US+EU': '🇺🇸/🇪🇺',
    'US+IL': '🇺🇸/🇮🇱',
    'US+AT': '🇺🇸/🇦🇹',
    'EU+US-cloud': '🇪🇺 → 🇺🇸',
  }

  // Rating-mapping (1-5 sterren).
  // Hoofdregel: severity_default = de bron-of-truth voor de ster-rating.
  //  kritiek → 1★ ernstig+cloud_act → 2★  ernstig → 3★
  //  let_op  → 3★ schoon            → 5★
  function ratingFor(meta) {
    if (!meta || !meta.severity_default) return 5
    const sev = meta.severity_default
    if (sev === 'kritiek') return 1
    if (sev === 'ernstig') return meta.cloud_act ? 2 : 3
    if (sev === 'let_op') return meta.cloud_act ? 3 : 4
    return 5
  }

  function el(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name)
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k])
    if (text != null) node.textContent = text
    return node
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
      // Behoud niet-lege _lekkertje als we die op een andere entry vinden
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

  // Site-overall rating: gebruik de slechtste vendor-rating, of 5 bij geen detecties.
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

  function renderWeb(svg, vendors) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild)
    }
    // Compacte achtergrond-ringen
    ;[22, 38, 56].forEach((r) => {
      svg.appendChild(
        el('circle', {
          cx: CX,
          cy: CY,
          r,
          fill: 'none',
          stroke: '#ece6d8',
          'stroke-width': '1',
        })
      )
    })

    const visible = vendors.slice(0, MAX_SPOKES)
    const n = Math.max(visible.length, 1)

    // Spaken
    visible.forEach((v, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const ex = CX + Math.cos(angle) * SPOKE_LEN
      const ey = CY + Math.sin(angle) * SPOKE_LEN
      svg.appendChild(
        el('line', {
          x1: CX,
          y1: CY,
          x2: ex,
          y2: ey,
          stroke: SEVERITY_COLOR[v.severity] || SEVERITY_COLOR.onbekend,
          'stroke-width': '1.5',
          'stroke-opacity': '0.55',
        })
      )
    })

    // Vendor-nodes — geen labels naast (te krap; labels staan in vendor-cards)
    visible.forEach((v, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const ex = CX + Math.cos(angle) * SPOKE_LEN
      const ey = CY + Math.sin(angle) * SPOKE_LEN
      const r = 5 + Math.min(v.count, 4)

      const g = el('g', { class: 'lk-node', 'data-vendor': v.vendor })
      g.appendChild(
        el('circle', {
          cx: ex,
          cy: ey,
          r,
          fill: SEVERITY_COLOR[v.severity] || SEVERITY_COLOR.onbekend,
          stroke: '#fff',
          'stroke-width': '1.5',
        })
      )
      g.appendChild(
        el(
          'title',
          null,
          v.vendor +
            ' — ' +
            (SEVERITY_LABEL[v.severity] || v.severity) +
            ' (' +
            v.count +
            ' hits)'
        )
      )
      svg.appendChild(g)
    })

    // Centrum-node
    const center = el('g', { class: 'lk-center' })
    center.appendChild(
      el('circle', {
        cx: CX,
        cy: CY,
        r: 10,
        fill: '#ffffff',
        stroke: '#222',
        'stroke-width': '1.5',
      })
    )
    center.appendChild(el('circle', { cx: CX, cy: CY, r: 4, fill: '#cc0000' }))
    svg.appendChild(center)

    const overflow = vendors.length - visible.length
    if (overflow > 0) {
      svg.appendChild(
        el(
          'text',
          {
            x: W - 8,
            y: H - 8,
            'text-anchor': 'end',
            'font-family': 'Charter, Georgia, serif',
            'font-size': '11',
            fill: '#666',
          },
          '+ ' + overflow + ' meer'
        )
      )
    }
  }

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
    flag.textContent = JURISDICTION_FLAG[meta.jurisdiction] || ''
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

    const meta2 = document.createElement('div')
    meta2.className = 'lk-vc-meta'
    const sevSpan = document.createElement('span')
    sevSpan.className = 'lk-vc-sev'
    sevSpan.textContent = SEVERITY_LABEL[v.severity] || v.severity
    sevSpan.style.color = SEVERITY_COLOR[v.severity] || SEVERITY_COLOR.onbekend
    meta2.appendChild(sevSpan)
    const dot = document.createElement('span')
    dot.textContent = ' · '
    meta2.appendChild(dot)
    const hits = document.createElement('span')
    hits.className = 'lk-vc-hits'
    hits.textContent = v.count + (v.count === 1 ? ' hit' : ' hits')
    meta2.appendChild(hits)
    li.appendChild(meta2)

    return li
  }

  function renderVendorList(ul, vendors) {
    while (ul.firstChild) ul.removeChild(ul.firstChild)
    vendors.forEach((v) => ul.appendChild(vendorCard(v)))
  }

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
    doc.querySelectorAll('.lk-stars-static').forEach((el2) => {
      const r = parseInt(el2.dataset.rating, 10) || 0
      el2.textContent = starString(r)
    })
  }

  function render(site, doc) {
    const vendors = aggregateVendors(site)
    const svg = doc.getElementById('lk-web')
    const ul = doc.getElementById('lk-vendor-list')
    const empty = doc.getElementById('lk-empty')

    renderRating(doc, site, vendors)
    renderLegendStars(doc)

    if (!vendors.length) {
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      empty.style.display = ''
      empty.textContent = 'Geen trackers gedetecteerd op deze pagina.'
      ul.innerHTML = ''
      return
    }
    empty.style.display = 'none'
    empty.textContent = ''
    renderWeb(svg, vendors)
    renderVendorList(ul, vendors)
  }

  window.lekkertjeRender = render
  window.lekkertjeAggregate = aggregateVendors
  window.lekkertjeRating = ratingFor
})()
