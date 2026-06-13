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

// android/app/build.gradle の versionCode / versionName を更新
const buildGradlePath = path.join(ROOT, 'apps', 'mobile', 'android', 'app', 'build.gradle')
let gradle = readFileSync(buildGradlePath, 'utf-8')
gradle = gradle.replace(/versionCode \d+/, `versionCode ${buildNumber}`)
gradle = gradle.replace(/versionName "[^"]+"/, `versionName "${version ?? '1.0.0'}"`)
writeFileSync(buildGradlePath, gradle, 'utf-8')
console.log(`[update-mobile-build-number] build.gradle → versionCode ${buildNumber}, versionName "${version}"`)

// updateService.ts のフォールバック定数も更新（react-native-device-info 読み取り失敗時用）
const updateServicePath = path.join(ROOT, 'apps', 'mobile', 'src', 'services', 'updateService.ts')
let src = readFileSync(updateServicePath, 'utf-8')
src = src.replace(
  /export const FALLBACK_BUILD_NUMBER = \d+/,
  `export const FALLBACK_BUILD_NUMBER = ${buildNumber}`,
)
src = src.replace(
  /export const FALLBACK_VERSION\s+=\s+'[^']+'/,
  `export const FALLBACK_VERSION      = '${version ?? '1.0.0'}'`,
)
writeFileSync(updateServicePath, src, 'utf-8')
console.log(`[update-mobile-build-number] updateService.ts → FALLBACK_BUILD_NUMBER ${buildNumber}, FALLBACK_VERSION "${version}"`)
