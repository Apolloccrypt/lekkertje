/* globals chrome */
/* mijnoverheid-fetch.js — driver-proxy voor de Lekkertje-popup.
   Self-contained: praat met Wappalyzer's Driver via {source, func, args} en
   bouwt een spinnenweb-compatible site-object uit de detected technologies.
   Geen externe fetch, geen chrome.storage-cache van mijnoverheid.us-data. */
;(function () {
  'use strict'

  function inExtension() {
    return (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function'
    )
  }

  function callDriver(func, args) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          { source: 'popup.js', func, args: args || [] },
          (response) => {
            const err = chrome.runtime && chrome.runtime.lastError
            if (err) return reject(new Error(err.message || String(err)))
            resolve(response)
          }
        )
      } catch (e) {
        reject(e)
      }
    })
  }

  function buildSite(domain, detections) {
    const list = Array.isArray(detections) ? detections : []
    const counts = { kritiek: 0, ernstig: 0, let_op: 0 }
    const trackers = []
    const findings = []
    const vendors = []

    list.forEach((d) => {
      const meta = (d && d._lekkertje) || {}
      const sev = meta.severity_default || 'let_op'
      counts[sev] = (counts[sev] || 0) + 1
      vendors.push(d.name)
      trackers.push({
        url_pattern: (d.lastUrl || d.website || d.name || '').toString(),
        vendor: d.name,
        classified: true,
        kind: 'tracker',
        context: meta.cloud_act ? 'CLOUD Act-jurisdictie' : '',
        _lekkertje: meta,
      })
      findings.push({
        severity: sev,
        type: 'live-detection',
        wetsartikel: meta.cloud_act
          ? 'AVG art. 44+, US CLOUD Act'
          : 'AVG art. 13',
        samenvatting: meta.note || `${d.name} gedetecteerd`,
        vendors_betrokken: [d.name],
        mode: 'live',
      })
    })

    return {
      domain,
      scan_date: null,
      scanner_version: 'lekkertje-live',
      totaal_bevindingen: list.length,
      severity_counts: counts,
      vendors_geclassificeerd: vendors.slice().sort(),
      cookie_counts: {
        tracking_classified: 0,
        tracking_unclassified: 0,
        functional: 0,
      },
      cookies: [],
      trackers,
      findings,
    }
  }

  async function getDataFor(domain) {
    if (inExtension()) {
      // Geef domain expliciet mee zodat Driver.cache.hostnames[domain] wordt
      // gelezen ipv chrome.tabs.query (die in popup-context de popup-tab
      // teruggeeft). Driver.getDetections() valt zonder argument terug op
      // de actieve tab — beide paden werken.
      const detections = await callDriver('getDetections', [domain])
      return buildSite(domain, detections)
    }
    // Dev-mode: laat test-harness een mock injecteren via window.__lekkertjeMock
    if (
      window.__lekkertjeMock &&
      typeof window.__lekkertjeMock.getDataFor === 'function'
    ) {
      return Promise.resolve(window.__lekkertjeMock.getDataFor(domain))
    }
    return Promise.reject(
      new Error('Geen extension-context en geen mock geregistreerd')
    )
  }

  window.lekkertjeFetch = { getDataFor, _buildSite: buildSite }
})()
