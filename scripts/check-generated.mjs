import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'

const paths = ['generated/@typespec/openapi3', 'src/generated/sdk', 'server/generated']
function snapshot() {
  const result = new Map()
  function walk(path) {
    for (const entry of readdirSync(path).sort()) {
      const file = `${path}/${entry}`
      if (statSync(file).isDirectory()) walk(file)
      else result.set(file, createHash('sha256').update(readFileSync(file)).digest('hex'))
    }
  }
  for (const path of paths) walk(path)
  return result
}

const before = snapshot()
execFileSync('npm', ['run', 'generate:api'], { stdio: 'inherit' })
const after = snapshot()
const changed = new Set([...before.keys(), ...after.keys()].filter((file) => before.get(file) !== after.get(file)))
if (changed.size) {
  console.error(`Generated artifacts have drifted:\n${[...changed].join('\n')}`)
  process.exitCode = 1
}
