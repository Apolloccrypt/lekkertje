/* modes.js — drie smaken voor de detector.
   v0.1: alleen 'statisch' is bruikbaar; 'live' en 'vergelijk' zijn stubs. */
;(function () {
  'use strict'

  const MODES = {
    statisch: {
      key: 'statisch',
      label: 'Statisch',
      beschikbaar: true,
      beschrijving:
        'Lees uit het mijnoverheid.us-register; geen live page-scan.',
    },
    live: {
      key: 'live',
      label: 'Live',
      beschikbaar: false,
      beschrijving:
        'Scan de huidige tab live (cookies, scriptSrc, XHR). Komt later.',
    },
    vergelijk: {
      key: 'vergelijk',
      label: 'Vergelijk',
      beschikbaar: false,
      beschrijving: 'Vergelijk live-scan met register-baseline. Komt later.',
    },
  }

  function current() {
    return MODES.statisch
  }

  function list() {
    return Object.values(MODES)
  }

  window.lekkertjeModes = { MODES, current, list }
})()
