/**
 * update-icons.mjs
 * web の icon.png（ネイビー）を EXE・Android のアイコンに反映する
 *
 * 使い方:
 *   node scripts/update-icons.mjs
 */

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const SRC_ICON = path.join(ROOT, 'apps', 'web', 'src', 'app', 'icon.png')

// ── 1. build/icon.png（Electron ビルド用） ───────────────────────
console.log('[update-icons] EXE用 build/icon.png を更新中...')
const iconPng1024 = await sharp(SRC_ICON).resize(1024, 1024).png().toBuffer()
writeFileSync(path.join(ROOT, 'build', 'icon.png'), iconPng1024)
console.log('[update-icons] build/icon.png ✓')

// ── 2. build/icon.ico（EXE アイコン、複数サイズ埋め込み） ────────
console.log('[update-icons] EXE用 build/icon.ico を生成中...')
const icoSizes = [16, 32, 48, 64, 128, 256]
const icoBuffers = await Promise.all(
  icoSizes.map((size) => sharp(SRC_ICON).resize(size, size).png().toBuffer())
)
const icoBuffer = await pngToIco(icoBuffers)
writeFileSync(path.join(ROOT, 'build', 'icon.ico'), icoBuffer)
console.log('[update-icons] build/icon.ico ✓ (sizes:', icoSizes.join(', '), 'px)')

// ── 3. Android mipmap アイコン ────────────────────────────────────
// ic_launcher      … 四角（システムが丸くクリップする場合あり）
// ic_launcher_round … 丸型（丸くクリップ済みの画像を要求するランチャー用）
const ANDROID_RES = path.join(ROOT, 'apps', 'mobile', 'android', 'app', 'src', 'main', 'res')

const mipmapSizes = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
]

console.log('[update-icons] Android mipmap アイコンを生成中...')

for (const { dir, size } of mipmapSizes) {
  const destDir = path.join(ANDROID_RES, dir)
  mkdirSync(destDir, { recursive: true })

  // ic_launcher（そのままリサイズ）
  await sharp(SRC_ICON)
    .resize(size, size)
    .png()
    .toFile(path.join(destDir, 'ic_launcher.png'))

  // ic_launcher_round（円形にクリップ）
  const circlesvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  await sharp(SRC_ICON)
    .resize(size, size)
    .composite([{ input: Buffer.from(circlesvg), blend: 'dest-in' }])
    .png()
    .toFile(path.join(destDir, 'ic_launcher_round.png'))

  console.log(`[update-icons]   ${dir} (${size}x${size}) ✓`)
}

// ── 4. web/src/app/apple-icon.png も更新 ─────────────────────────
console.log('[update-icons] apple-icon.png を更新中...')
const appleIcon = await sharp(SRC_ICON).resize(180, 180).png().toBuffer()
writeFileSync(path.join(ROOT, 'apps', 'web', 'src', 'app', 'apple-icon.png'), appleIcon)
console.log('[update-icons] apple-icon.png ✓')

console.log('\n[update-icons] 完了！')
console.log('  次のステップ: npm run dist:win:sync でビルド')
