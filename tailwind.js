import fs from 'fs'
import path from 'path'

import postcss from 'postcss'
import postcssJs from 'postcss-js'

// Tailwind Core
export function tailwind({ root, result: _result, configPath }) {
  // Resolve the config
  let config = require(configPath)

  // Figure out all the used classes
  let candidates = new Set()

  // Parse each file.
  // NOTE: Not important about what's going on here, just that we need access to the content files
  // and we should be able to read the raw contents so that we can parse the file.
  for (let file of config.content) {
    let contents = fs.readFileSync(path.resolve(__dirname, file), 'utf8')
    // NOTE: Details here are not important, most important part is that we can "read" the files.
    for (let candidate of contents.split(/['"\s<>=/]/g)) {
      candidates.add(candidate)
    }
  }

  // This will contain a list of plugin functions. The plugins can be defined in:
  // - The core of tailwind itself
  // - The css file
  // - The external config file
  let plugins = []

  // Built-in plugins
  // NOTE: Quick example in reality there will be many many more, but idea is that this should be
  // possible.
  plugins.push(function ({ addUtilities }) {
    addUtilities({
      '.built-in-utility': {
        color: 'red',
      },
    })
  })

  // Example built-in plugin that can read values from the config
  plugins.push(function ({ addUtilities }) {
    addUtilities({
      '.text-primary': {
        color: config?.theme?.colors?.primary,
      },
    })
  })

  // External plugins from config.
  if (config.plugins) {
    plugins = plugins.concat(config.plugins)
  }

  // Collect "plugins" from the CSS
  //
  // NOTE: In reality we want to collect information for the correct layer. But for this proof of
  // concept that does not matter. Idea is that we _can_ read the css file.
  root.walkAtRules('layer', (layer) => {
    layer.walkRules((node) => {
      let declarations = {}
      node.walkDecls((decl) => {
        declarations[decl.prop] = decl.value
      })

      plugins.push(function ({ addUtilities }) {
        addUtilities({
          [node.selector]: declarations,
        })
      })
    })

    // Remove the layer from the CSS.
    layer.remove()
  })

  // Generate all the new rules based on information from the `content` found in the config.
  let newRules = []
  for (let plugin of plugins) {
    plugin({
      addUtilities(definition) {
        for (let [selector, declarations] of Object.entries(definition)) {
          // Only generate the rules that we care about.
          // .slice(1) is a quick way of getting rid of the `.` of the selector
          // Very naive, but as a proof of concept this works
          if (candidates.has(selector.slice(1))) {
            for (let node of parseObjectStyles({ [selector]: declarations })) {
              newRules.push(node)
            }
          }
        }
      },
    })
  }

  // Replace the @tailwind rule with the newly generated rules.
  root.walkAtRules('tailwind', (node) => {
    node.replaceWith(newRules)
    node.remove()
  })
}

// A function that allows us to generate PostCSS nodes from raw objects.
function parseObjectStyles(styles) {
  if (!Array.isArray(styles)) {
    return parseObjectStyles([styles])
  }

  return styles.flatMap((style) => {
    return postcss().process(style, {
      parser: postcssJs,
    }).root.nodes
  })
}
