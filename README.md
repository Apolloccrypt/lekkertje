# Lekkertje

**Zie waar je data heen gaat — voor Nederlandse overheidssites en daarbuiten. Door [mijnoverheid.us](https://mijnoverheid.us/).**

Lekkertje is een browser-extensie die op elke site die je bezoekt laat zien naar welke vendors je data lekt: trackers, advertentienetwerken, analytics, third-party scripts. Voor de 330 Nederlandse overheidssites uit de mijnoverheid.us-dataset toont de extensie ook de bijbehorende AVG-bevindingen met severity en wetsartikel.

Status: **MVP-skelet** (lekkertje-mvp branch). Pattern-detectie werkt; eigen UI en data-koppeling worden iteratief opgebouwd.

## Herkomst en licentie

Lekkertje is gebaseerd op [tomnomnom/wappalyzer](https://github.com/tomnomnom/wappalyzer) — een fork van het oorspronkelijke Wappalyzer-project van AliasIO. Zie [`CONTRIBUTORS.md`](./CONTRIBUTORS.md) voor de upstream-attributie. Licentie: **GPL-3.0-only** (zie [`LICENSE`](./LICENSE)).

## Vereisten

- [Git](https://git-scm.com)
- [Node.js](https://nodejs.org) v14+
- [Yarn](https://yarnpkg.com) (of `corepack enable`)

## Quick start

```sh
git clone https://github.com/<jouw-account>/lekkertje.git
cd lekkertje
yarn install
yarn run build
```

## Chrome / Edge laden

1. Ga naar `chrome://extensions`
2. Zet 'Developer mode' aan
3. Klik 'Load unpacked'
4. Kies de map `src/drivers/webextension/`

## Firefox laden

1. Ga naar `about:debugging#/runtime/this-firefox`
2. Klik 'Load Temporary Add-on'
3. Kies `src/drivers/webextension/manifest.json`

## Pattern-schema

Patterns liggen in `src/technologies/`. Schema in [`schema.json`](./schema.json). Voor de spec, zie de upstream Wappalyzer-documentatie of `bin/validate.js`.
