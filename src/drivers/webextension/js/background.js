/* globals chrome, importScripts */

/* Lekkertje service-worker.
   Self-contained: geen externe data-fetch. Alle vendor-detectie loopt via
   Wappalyzer's eigen pipeline (driver.js + content.js + webRequest-listeners).
   De popup praat met Driver via chrome.runtime.sendMessage {source, func, args}. */

importScripts(chrome.runtime.getURL('js/wappalyzer.js'))
importScripts(chrome.runtime.getURL('js/utils.js'))
importScripts(chrome.runtime.getURL('js/driver.js'))
importScripts(chrome.runtime.getURL('js/lib/network.js'))
