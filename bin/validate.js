const fs = require('fs')
const path = require('path')

const iconPath = './src/drivers/webextension/images/icons'

const categories = JSON.parse(fs.readFileSync('./src/categories.json'))

let technologies = {}

const technologiesDir = './src/technologies'

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    return d.isDirectory() ? walk(p) : d.name.endsWith('.json') ? [p] : []
  })

walk(technologiesDir).forEach((filePath) => {
    const rel = path.relative(technologiesDir, filePath)
    const baseName = path.basename(filePath, '.json')
    const subdir = path.dirname(rel)
    const character = subdir === '.' ? baseName : subdir.split(path.sep)[0]
    const charCode = character === '_' ? 95 : character.charCodeAt(0)

    const _technologies = JSON.parse(fs.readFileSync(filePath))

    Object.keys(_technologies).forEach((name) => {
      const _charCode = name.toLowerCase().charCodeAt(0)

      if (charCode !== _charCode) {
        if (_charCode < 97 || _charCode > 122) {
          if (charCode !== 95) {
            throw new Error(
              `${name} should be moved from ${filePath} to ${technologiesDir}/_/`
            )
          }
        } else {
          throw new Error(
            `${name} should be moved from ${filePath} to ${technologiesDir}/${String.fromCharCode(_charCode)}/`
          )
        }
      }
    })

    technologies = {
      ...technologies,
      ..._technologies,
    }
  })

Object.keys(technologies).forEach((name) => {
  const technology = technologies[name]

  // Validate regular expressions
  ;['url', 'html', 'meta', 'headers', 'cookies', 'script', 'js'].forEach(
    (type) => {
      if (technology[type]) {
        const keyed =
          typeof technology[type] === 'string' ||
          Array.isArray(technology[type])
            ? { _: technology[type] }
            : technology[type]

        Object.keys(keyed).forEach((key) => {
          const patterns = Array.isArray(keyed[key]) ? keyed[key] : [keyed[key]]

          patterns.forEach((pattern, index) => {
            const id = `${name}: ${type}[${key === '_' ? `${index}` : key}]`

            const [regex, ...flags] = pattern.split('\\;')

            let maxGroups = 0

            flags.forEach((flag) => {
              const [key, value] = flag.split(':')

              if (key === 'version') {
                const refs = value.match(/\\(\d+)/g)

                if (refs) {
                  maxGroups = refs.reduce((max, ref) =>
                    Math.max(max, parseInt(refs[1] || 0))
                  )
                }
              } else if (key === 'confidence') {
                if (
                  !/^\d+$/.test(value) ||
                  parseInt(value, 10) < 0 ||
                  parseInt(value, 10) > 99
                ) {
                  throw new Error(
                    `Confidence value must a number between 0 and 99: ${value} (${id})`
                  )
                }
              } else {
                throw new Error(`Invalid flag: ${key} (${id})`)
              }
            })

            // Validate regular expression
            try {
              // eslint-disable-next-line no-new
              new RegExp(regex)
            } catch (error) {
              throw new Error(`${error.message} (${id})`)
            }

            // Count capture groups
            const groups = new RegExp(`${regex}|`).exec('').length - 1

            if (groups > maxGroups) {
              throw new Error(
                `Too many non-capturing groups, expected ${maxGroups}: ${regex} (${id})`
              )
            }

            if (type === 'html' && !/[<>]/.test(regex)) {
              throw new Error(
                `HTML pattern must include < or >: ${regex} (${id})`
              )
            }
          })
        })
      }
    }
  )

  // Validate categories
  technology.cats.forEach((id) => {
    if (!categories[id]) {
      throw new Error(`No such category: ${id} (${name})`)
    }
  })

  // Validate icons
  if (technology.icon && !fs.existsSync(`${iconPath}/${technology.icon}`)) {
    throw new Error(`No such icon: ${technology.icon} (${name})`)
  }

  // Validate website URLs
  try {
    // eslint-disable-next-line no-new
    const { protocol } = new URL(technology.website)

    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error('Invalid protocol')
    }
  } catch (error) {
    throw new Error(`Invalid website URL: ${technology.website} (${name})`)
  }

  // Validate implies and excludes
  const { implies, excludes } = technology

  if (implies) {
    ;(Array.isArray(implies) ? implies : [implies]).forEach((implied) => {
      const [_name, ...flags] = implied.split('\\;')

      const id = `${name}: implies[${implied}]`

      if (!technologies[_name]) {
        throw new Error(`Implied technology does not exist: ${_name} (${id})`)
      }

      flags.forEach((flag) => {
        const [key, value] = flag.split(':')

        if (key === 'version') {
          return
        }

        if (key === 'confidence') {
          if (
            !/^\d+$/.test(value) ||
            parseInt(value, 10) < 0 ||
            parseInt(value, 10) > 99
          ) {
            throw new Error(
              `Confidence value must a number between 0 and 99: ${value} (${id})`
            )
          }
        } else {
          throw new Error(`Invalid flag: ${key} (${id})`)
        }
      })
    })
  }

  if (excludes) {
    ;(Array.isArray(excludes) ? excludes : [excludes]).forEach((excluded) => {
      const id = `${name}: excludes[${excluded}]`

      if (!technologies[excluded]) {
        throw new Error(
          `Excluded technology does not exist: ${excluded} (${id})`
        )
      }
    })
  }
})

// Validate icons
fs.readdirSync(iconPath).forEach((file) => {
  const filePath = `${iconPath}/${file}`

  if (fs.statSync(filePath).isFile() && !file.startsWith('.')) {
    if (!/^(png|svg)$/i.test(file.split('.').pop())) {
      throw new Error(`Incorrect file type, expected PNG or SVG: ${filePath}`)
    }

    if (
      !Object.values(technologies).some(({ icon }) => icon === file) &&
      file !== 'default.svg'
    ) {
      throw new Error(`Extraneous file: ${filePath}`)
    }
  }
})
