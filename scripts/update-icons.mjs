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
const ANDROID_RES = path.join(ROOT, 'apps', 'mobile', 'android', 'app', 'src', 'main', 'res')

// ── アイコン背景色をサンプリング（中央左端・角丸の内側） ──────────
// コーナーはアンチエイリアスで白と混ざるため、中央左端（高さ50%、幅10%）から取得
const meta = await sharp(SRC_ICON).metadata()
const sw = meta.width, sh = meta.height
const sampleLeft = Math.round(sw * 0.05)
const sampleTop  = Math.round(sh * 0.45)
const { data: cornerData } = await sharp(SRC_ICON)
  .extract({ left: sampleLeft, top: sampleTop, width: 4, height: 4 })
  .raw()
  .toBuffer({ resolveWithObject: true })
const r = cornerData[0], g = cornerData[1], b = cornerData[2]
const bgColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
console.log(`[update-icons] 背景色: ${bgColor}`)

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

// ── 3. Android mipmap アイコン（通常 + ラウンド） ────────────────
//
// ic_launcher      : 四角アイコン（そのままリサイズ）
// ic_launcher_round: 丸型ランチャー用。余白が白く見える問題を防ぐため
//                    背景色で塗りつぶした円の上にアイコンを合成する
//
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

  // ic_launcher_round：背景色の円 + アイコン（55%サイズ）を中央合成
  // 素材がiOS角丸アイコンでロゴが端ギリギリのため余白を多めに確保
  const iconSize = Math.round(size * 0.55)
  const offset   = Math.round((size - iconSize) / 2)

  const bgCircleSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${bgColor}"/></svg>`
  const iconBuf = await sharp(SRC_ICON).resize(iconSize, iconSize).png().toBuffer()

  await sharp(Buffer.from(bgCircleSvg))
    .composite([{ input: iconBuf, left: offset, top: offset }])
    .png()
    .toFile(path.join(destDir, 'ic_launcher_round.png'))

  console.log(`[update-icons]   ${dir} (${size}x${size}) ✓`)
}

// ── 4. Android Adaptive Icons（API 26+） ────────────────────────
//
// background: 背景色の単色XMLレイヤー（マスクまで余白なく塗りつぶす）
// foreground: アイコンを108dpキャンバスのセーフゾーン（72dp）内に配置
// → デバイスごとのマスク形状（円・角丸・ティアドロップ等）に対応
//
// iconSize = canvas の 55%（ロゴが端まであるiOSアイコン素材の場合、
// 66.7%では円マスクに引っかかるため余白を多めに取る）
const adaptiveSizes = [
  { dir: 'mipmap-mdpi',    canvas: 108, iconSize: 60  },
  { dir: 'mipmap-hdpi',    canvas: 162, iconSize: 89  },
  { dir: 'mipmap-xhdpi',   canvas: 216, iconSize: 119 },
  { dir: 'mipmap-xxhdpi',  canvas: 324, iconSize: 178 },
  { dir: 'mipmap-xxxhdpi', canvas: 432, iconSize: 238 },
]

console.log('[update-icons] Android Adaptive Icon フォアグラウンドを生成中...')

for (const { dir, canvas, iconSize } of adaptiveSizes) {
  const destDir = path.join(ANDROID_RES, dir)
  mkdirSync(destDir, { recursive: true })

  const padding = Math.round((canvas - iconSize) / 2)
  await sharp(SRC_ICON)
    .resize(iconSize, iconSize)
    .extend({
      top: padding, bottom: padding, left: padding, right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // 透明パディング
    })
    .png()
    .toFile(path.join(destDir, 'ic_launcher_foreground.png'))

  console.log(`[update-icons]   ${dir} foreground (${canvas}x${canvas}, icon ${iconSize}px) ✓`)
}

// drawable/ic_launcher_background.xml（背景色）
const drawableDir = path.join(ANDROID_RES, 'drawable')
mkdirSync(drawableDir, { recursive: true })
writeFileSync(
  path.join(drawableDir, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="${bgColor}"/>
</shape>
`
)
console.log(`[update-icons] ic_launcher_background.xml (${bgColor}) ✓`)

// mipmap-anydpi-v26/（Adaptive Icon XML）
const anydpiDir = path.join(ANDROID_RES, 'mipmap-anydpi-v26')
mkdirSync(anydpiDir, { recursive: true })

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveXml)
writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveXml)
console.log('[update-icons] mipmap-anydpi-v26/ Adaptive Icon XML ✓')

// ── 5. web/src/app/apple-icon.png も更新 ─────────────────────────
console.log('[update-icons] apple-icon.png を更新中...')
const appleIcon = await sharp(SRC_ICON).resize(180, 180).png().toBuffer()
writeFileSync(path.join(ROOT, 'apps', 'web', 'src', 'app', 'apple-icon.png'), appleIcon)
console.log('[update-icons] apple-icon.png ✓')

console.log('\n[update-icons] 完了！')
console.log('  次のステップ: npm run dist:win:sync でビルド')
