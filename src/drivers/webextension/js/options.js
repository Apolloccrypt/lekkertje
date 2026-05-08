'use strict'
/* eslint-env browser */
/* globals Utils, chrome */

/* options.js — Lekkertje minimal options-page.
   Twee checkboxes (badge, showCached) + Cache-leegmaken-knop. Geen
   telemetry, geen api-keys, geen Wappalyzer-Plus-features. */

const { getOption, setOption } = Utils

const OPTIONS = [
  ['badge', true],
  ['showCached', true],
]

async function init() {
  for (const [name, defaultValue] of OPTIONS) {
    const el = document.querySelector(`[data-option="${name}"]`)
    if (!el) continue
    el.checked = !!(await getOption(name, defaultValue))
    el.addEventListener('change', async () => {
      await setOption(name, !!el.checked)
    })
  }

  const clearBtn = document.querySelector('[data-action="clearCache"]')
  const status = document.getElementById('lk-options-status')
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { source: 'options.js', func: 'clearCache', args: [] },
            (response) => {
              const err = chrome.runtime && chrome.runtime.lastError
              if (err) return reject(new Error(err.message || String(err)))
              resolve(response)
            }
          )
        })
        status.textContent = 'Cache geleegd.'
        status.dataset.tone = 'ok'
      } catch (e) {
        status.textContent = 'Mislukt: ' + (e.message || String(e))
        status.dataset.tone = 'error'
      }
      setTimeout(() => {
        status.textContent = ''
        delete status.dataset.tone
      }, 4000)
    })
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
