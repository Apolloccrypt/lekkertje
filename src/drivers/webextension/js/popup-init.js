/* globals chrome */
/* popup-init.js — bootstraps de Lekkertje-popup in de extension-context.
   In de extension wordt het actieve-tab-domein via chrome.tabs gehaald.
   Inline scripts kunnen niet vanwege MV3 CSP, daarom dit aparte file. */
;(function () {
  'use strict'

  function setLoading(domain) {
    document.getElementById('lk-domain').textContent = domain || '—'
  }

  function setNoData(message) {
    const sev = document.getElementById('lk-severity')
    sev.dataset.level = 'onbekend'
    document.getElementById('lk-sev-label').textContent =
      message || 'Geen data beschikbaar'
    document.getElementById('lk-sev-count').textContent = ''
    document.getElementById('lk-empty').hidden = false
  }

  function activeDomain() {
    return new Promise((resolve) => {
      // 1. Querystring (test-harness / standalone preview)
      const params = new URLSearchParams(location.search)
      const fromQs = params.get('domain')
      if (fromQs) return resolve(fromQs)

      // 2. chrome.tabs.query (echte extension-context)
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const url = tabs && tabs[0] && tabs[0].url
          if (!url) return resolve(null)
          try {
            const u = new URL(url)
            if (!/^https?:$/.test(u.protocol)) return resolve(null)
            const host = u.hostname.replace(/^www\./, '')
            resolve(host)
          } catch (_e) {
            resolve(null)
          }
        })
        return
      }

      // 3. Fallback (localhost dev)
      const host =
        location.hostname && location.hostname !== 'localhost'
          ? location.hostname.replace(/^www\./, '')
          : null
      resolve(host)
    })
  }

  function wireInteractions(domain) {
    const toggle = document.getElementById('lk-toggle')
    if (toggle) {
      toggle.addEventListener('click', () => {
        const list = document.getElementById('lk-vendor-list')
        const open = toggle.getAttribute('aria-expanded') === 'true'
        toggle.setAttribute('aria-expanded', String(!open))
        toggle.querySelector('.lk-chev').textContent = open ? '▸' : '▾'
        list.hidden = open
      })
    }

    const dossier = document.getElementById('lk-dossier')
    if (dossier) {
      dossier.addEventListener('click', () => {
        const url =
          'https://mijnoverheid.us/ranking/#' + encodeURIComponent(domain || '')
        if (
          typeof chrome !== 'undefined' &&
          chrome.tabs &&
          chrome.tabs.create
        ) {
          chrome.tabs.create({ url })
        } else {
          window.open(url, '_blank', 'noopener')
        }
      })
    }
  }

  async function init() {
    const domain = await activeDomain()
    setLoading(domain)
    wireInteractions(domain)

    if (!domain) {
      setNoData('Geen actieve tab')
      return
    }

    try {
      const site = await window.lekkertjeFetch.getDataFor(domain)
      window.lekkertjeRender(site, document)
    } catch (err) {
      setNoData('Geen detecties')
      // eslint-disable-next-line no-console
      console.warn('[lekkertje] detection failed', err)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
