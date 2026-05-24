/**
 * update-mobile-build-number.mjs
 * build-and-sync.mjs から呼ばれ、updateService.ts の CURRENT_BUILD_NUMBER を更新する
 *
 * 使い方: node scripts/update-mobile-build-number.mjs <buildNumber> <version>
 */

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const [, , buildNumber, version] = process.argv
if (!buildNumber) {
  console.error('使い方: node update-mobile-build-number.mjs <buildNumber> <version>')
  process.exit(1)
}

const updateServicePath = path.join(ROOT, 'apps', 'mobile', 'src', 'services', 'updateService.ts')
let src = readFileSync(updateServicePath, 'utf-8')

src = src.replace(
  /export const CURRENT_BUILD_NUMBER = \d+/,
  `export const CURRENT_BUILD_NUMBER = ${buildNumber}`,
)
src = src.replace(
  /export const CURRENT_VERSION\s+=\s+'[^']+'/,
  `export const CURRENT_VERSION      = '${version ?? '1.0.0'}'`,
)

writeFileSync(updateServicePath, src, 'utf-8')
console.log(`[update-mobile-build-number] CURRENT_BUILD_NUMBER → ${buildNumber}, version → ${version}`)
