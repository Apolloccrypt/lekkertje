/* spinnenweb.js — vanilla SVG render van centrum-node + max 8 vendor-spaken.
   Werkt op het LIVE BeforeYouMick-format (mijnoverheid.us/scan/<domain>.json):
     { domain, severity_counts:{kritiek,ernstig,let_op},
       vendors_geclassificeerd:[...names],
       cookies:[{vendor, context, ...}], trackers:[{vendor, context, ...}],
       findings:[{severity, vendors_betrokken:[...]}] } */
;(function () {
  'use strict'

  const SVG_NS = 'http://www.w3.org/2000/svg'
  const W = 350
  const H = 280
  const CX = W / 2
  const CY = H / 2
  const SPOKE_LEN = 110
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

  function el(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name)
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k])
    if (text != null) node.textContent = text
    return node
  }

  // Severity afleiden uit context-string van een cookie/tracker. De BYOM-context
  // gebruikt standaard fragmenten: "vóór consent (geen banner)", "gezet na weigeren",
  // "blijft na weigeren", "actief na refuse", "lange bewaartermijn", "in HTML".
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

  // Aggregeer per vendor: count = #cookies + #trackers, severity = ergste-context.
  // Severity-bron, in volgorde van voorkeur:
  //  1. _lekkertje.severity_default op cookie/tracker (live-detection-pad)
  //  2. context-string (BYOM-scan-pad)
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

    function bump(vendor, sev) {
      if (!vendor) return
      const cur = map.get(vendor) || { vendor, severity: 'onbekend', count: 0 }
      cur.count += 1
      cur.severity = worse(sev, cur.severity)
      map.set(vendor, cur)
    }

    cookies.forEach((c) => bump(c.vendor, severityForEntry(c)))
    trackers.forEach((t) => bump(t.vendor, severityForEntry(t)))

    // Vendors_geclassificeerd zonder cookies/trackers (komt niet voor in BYOM
    // maar dekt edge-cases) krijgen een entry met severity onbekend.
    ;(site.vendors_geclassificeerd || []).forEach((v) => {
      if (!map.has(v)) map.set(v, { vendor: v, severity: 'onbekend', count: 0 })
    })

    return Array.from(map.values()).sort((a, b) => {
      const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (s !== 0) return s
      return b.count - a.count
    })
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

  function renderWeb(svg, vendors) {
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    ;[40, 70, 100].forEach((r) => {
      svg.appendChild(
        el('circle', {
          cx: CX,
          cy: CY,
          r,
          fill: 'none',
          stroke: '#e6e6e6',
          'stroke-width': '1',
        })
      )
    })

    const visible = vendors.slice(0, MAX_SPOKES)
    const n = Math.max(visible.length, 1)

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
          'stroke-opacity': '0.6',
        })
      )
    })

    visible.forEach((v, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const ex = CX + Math.cos(angle) * SPOKE_LEN
      const ey = CY + Math.sin(angle) * SPOKE_LEN
      const r = 6 + Math.min(v.count, 4)

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

      const labelDx = Math.cos(angle) * (r + 6)
      const labelDy = Math.sin(angle) * (r + 6)
      const lx = ex + labelDx
      const ly = ey + labelDy
      const anchor =
        Math.cos(angle) > 0.2
          ? 'start'
          : Math.cos(angle) < -0.2
          ? 'end'
          : 'middle'

      // Truncate lange vendor-namen zodat ze in 350px viewBox passen.
      // SVG-text heeft geen wrap; voor side-anchored labels (links/rechts)
      // is ~12 chars de veilige grens. Volledige naam blijft in <title>.
      const labelText =
        v.vendor.length > 12 ? v.vendor.slice(0, 11).trimEnd() + '…' : v.vendor

      g.appendChild(
        el(
          'text',
          {
            x: lx,
            y: ly + 3,
            'text-anchor': anchor,
            'font-family': 'Charter, Georgia, serif',
            'font-size': '11',
            fill: '#222',
          },
          labelText
        )
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

    const center = el('g', { class: 'lk-center' })
    center.appendChild(
      el('circle', {
        cx: CX,
        cy: CY,
        r: 14,
        fill: '#ffffff',
        stroke: '#222',
        'stroke-width': '1.5',
      })
    )
    center.appendChild(el('circle', { cx: CX, cy: CY, r: 5, fill: '#cc0000' }))
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

  function renderVendorList(ul, vendors) {
    while (ul.firstChild) ul.removeChild(ul.firstChild)
    vendors.forEach((v) => {
      const li = document.createElement('li')
      li.className = 'lk-vendor lk-sev-' + v.severity
      const dot = document.createElement('span')
      dot.className = 'lk-dot'
      dot.style.background =
        SEVERITY_COLOR[v.severity] || SEVERITY_COLOR.onbekend
      const name = document.createElement('span')
      name.className = 'lk-vendor-name'
      name.textContent = v.vendor
      const meta = document.createElement('span')
      meta.className = 'lk-vendor-meta'
      const noun = v.count === 1 ? ' hit' : ' hits'
      meta.textContent =
        (SEVERITY_LABEL[v.severity] || v.severity) + ' · ' + v.count + noun
      li.append(dot, name, meta)
      ul.appendChild(li)
    })
  }

  function renderSeverity(doc, site, vendors) {
    const level = rollupSeverity(site, vendors)
    const sev = doc.getElementById('lk-severity')
    const labelEl = doc.getElementById('lk-sev-label')
    const countEl = doc.getElementById('lk-sev-count')
    sev.dataset.level = level
    labelEl.textContent = SEVERITY_LABEL[level] || level
    const totaal = (site && site.totaal_bevindingen) || 0
    if (totaal) {
      countEl.textContent =
        totaal + (totaal === 1 ? ' bevinding' : ' bevindingen')
    } else if (vendors && vendors.length) {
      countEl.textContent =
        vendors.length + (vendors.length === 1 ? ' vendor' : ' vendors')
    } else {
      countEl.textContent = ''
    }
  }

  function render(site, doc) {
    const vendors = aggregateVendors(site)
    const svg = doc.getElementById('lk-web')
    const ul = doc.getElementById('lk-vendor-list')
    const empty = doc.getElementById('lk-empty')

    renderSeverity(doc, site, vendors)

    if (!vendors.length) {
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      // .lk-empty heeft display:flex; [hidden] verliest van die class-regel.
      // Forceer via inline style + ensure textContent.
      empty.style.display = ''
      empty.textContent = 'Geen tracker-koppelingen gevonden op deze pagina.'
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
})()
