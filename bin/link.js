const fs = require('fs')
const path = require('path')

const link = (src, dest) => {
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest)
  }

  fs.linkSync(src, dest)
}

link('./src/wappalyzer.js', './src/drivers/webextension/js/wappalyzer.js')
link('./src/categories.json', './src/drivers/webextension/categories.json')

const technologiesDir = './src/technologies'
const targetDir = './src/drivers/webextension/technologies'

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true })
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    return d.isDirectory() ? walk(p) : d.name.endsWith('.json') ? [p] : []
  })

walk(technologiesDir).forEach((filePath) => {
  const rel = path.relative(technologiesDir, filePath)
  const dest = path.join(targetDir, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  link(filePath, dest)
})

// Bundle per-letter — driver.js loadTechnologies() leest technologies/<letter>.json.
// Onze source layout is technologies/<letter>/<vendor>.json; bundel naar één file
// per letter zodat de runtime-loader één fetch per letter kan doen.
const letters = '_abcdefghijklmnopqrstuvwxyz'.split('')
letters.forEach((letter) => {
  const subdir = path.join(technologiesDir, letter)
  const merged = {}
  if (fs.existsSync(subdir) && fs.statSync(subdir).isDirectory()) {
    fs.readdirSync(subdir)
      .filter((f) => f.endsWith('.json'))
      .forEach((f) => {
        const data = JSON.parse(fs.readFileSync(path.join(subdir, f), 'utf8'))
        Object.assign(merged, data)
      })
  }
  const bundlePath = path.join(targetDir, `${letter}.json`)
  if (fs.existsSync(bundlePath)) fs.unlinkSync(bundlePath)
  fs.writeFileSync(bundlePath, JSON.stringify(merged, null, 2) + '\n')
})
