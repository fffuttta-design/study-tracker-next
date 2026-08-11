/**
 * generate-notionplus-icon.mjs
 * NotionPlus（学習トラッカーから独立起動する専用アイコン）用アイコンを生成する。
 * 学習トラッカー（琥珀色の本）と一目で区別できるよう、藍〜紫のグラデ＋白いページ＋「＋」バッジ。
 *
 * 出力:
 *   build/icon-notionplus.png (1024px)   … Electron / 参照用
 *   build/icon-notionplus.ico            … Windows ショートカット / ウィンドウ用
 *   apps/mobile/android/res/mipmap-[density]/ic_launcher_np.png        Android ランチャー（角丸）
 *   apps/mobile/android/res/mipmap-[density]/ic_launcher_np_round.png  Android ランチャー（丸）
 *
 * 実行: node scripts/generate-notionplus-icon.mjs
 */

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SIZE = 1024
const R = 200 // 角丸半径

// ── SVG デザイン（1024 × 1024）─────────────────────────────────────
// コンセプト: 藍→紫グラデ背景 / 白いノートページ（Notion風の行）/ 右下に紫丸＋白い「＋」バッジ
function makeSvg({ rounded = true } = {}) {
  const bgShape = rounded
    ? `<rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="url(#bg)"/>`
    : `<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>` // 丸はマスクで抜くので四角のまま
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${SIZE}" y2="${SIZE}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#6366F1"/>
      <stop offset="55%"  stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F3F4F6"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="22" stdDeviation="30" flood-color="#2E1065" flood-opacity="0.40"/>
    </filter>
    <filter id="badgeShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#2E1065" flood-opacity="0.45"/>
    </filter>
  </defs>

  ${bgShape}

  <!-- 背景の光の筋 -->
  <ellipse cx="320" cy="210" rx="520" ry="210" fill="white" opacity="0.06" transform="rotate(-20 320 210)"/>

  <!-- ノートページ -->
  <g filter="url(#shadow)">
    <rect x="256" y="212" width="512" height="600" rx="44" ry="44" fill="url(#page)"/>
  </g>

  <!-- ページ上部の見出しバー（紫） -->
  <rect x="320" y="300" width="300" height="40" rx="20" fill="#7C3AED" opacity="0.9"/>
  <!-- 本文行（グレー） -->
  <g fill="#9CA3AF" opacity="0.75">
    <rect x="320" y="386" width="384" height="26" rx="13"/>
    <rect x="320" y="446" width="330" height="26" rx="13"/>
    <rect x="320" y="506" width="360" height="26" rx="13"/>
    <rect x="320" y="566" width="270" height="26" rx="13"/>
  </g>

  <!-- 右下「＋」バッジ（Plus を表す） -->
  <g filter="url(#badgeShadow)">
    <circle cx="760" cy="770" r="126" fill="#4F46E5"/>
    <circle cx="760" cy="770" r="126" fill="none" stroke="#FFFFFF" stroke-width="8" opacity="0.9"/>
    <!-- 白い十字（＋） -->
    <rect x="742" y="700" width="36" height="140" rx="18" fill="#FFFFFF"/>
    <rect x="690" y="752" width="140" height="36" rx="18" fill="#FFFFFF"/>
  </g>
</svg>`
}

// ── Android 密度 → px（ランチャーアイコン） ─────────────────────────
const ANDROID_MIPMAPS = [
  { dir: 'mipmap-mdpi', px: 48 },
  { dir: 'mipmap-hdpi', px: 72 },
  { dir: 'mipmap-xhdpi', px: 96 },
  { dir: 'mipmap-xxhdpi', px: 144 },
  { dir: 'mipmap-xxxhdpi', px: 192 },
]
const ANDROID_RES = resolve(ROOT, 'apps', 'mobile', 'android', 'app', 'src', 'main', 'res')

// 丸型マスク（円形に切り抜く）
function circleMask(px) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`
  )
}
// 角丸マスク（adaptive でない端末向けに軽く角丸）
function roundedMask(px) {
  const r = Math.round(px * 0.18)
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"><rect width="${px}" height="${px}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
  )
}

console.log('NotionPlus アイコン生成中...')

const svgSquare = Buffer.from(makeSvg({ rounded: true }))
const svgFull = Buffer.from(makeSvg({ rounded: false }))

// ── Electron 用: PNG(1024) + ICO ──────────────────────────────────
const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]
const pngBufs = []
for (const s of SIZES) {
  const buf = await sharp(svgSquare).resize(s, s).png().toBuffer()
  pngBufs.push({ size: s, buf })
}
writeFileSync(resolve(ROOT, 'build', 'icon-notionplus.png'), pngBufs.find(p => p.size === 1024).buf)
console.log('  build/icon-notionplus.png ✓')

const icoSizes = [16, 32, 48, 64, 128, 256]
const icoBuf = await pngToIco(pngBufs.filter(p => icoSizes.includes(p.size)).map(p => p.buf))
writeFileSync(resolve(ROOT, 'build', 'icon-notionplus.ico'), icoBuf)
console.log('  build/icon-notionplus.ico ✓')

// ── Android 用 mipmap（角丸 + 丸） ────────────────────────────────
for (const { dir, px } of ANDROID_MIPMAPS) {
  const outDir = resolve(ANDROID_RES, dir)
  mkdirSync(outDir, { recursive: true })

  // 通常（軽く角丸）
  const sq = await sharp(svgFull)
    .resize(px, px)
    .composite([{ input: roundedMask(px), blend: 'dest-in' }])
    .png()
    .toBuffer()
  writeFileSync(resolve(outDir, 'ic_launcher_np.png'), sq)

  // 丸
  const rd = await sharp(svgFull)
    .resize(px, px)
    .composite([{ input: circleMask(px), blend: 'dest-in' }])
    .png()
    .toBuffer()
  writeFileSync(resolve(outDir, 'ic_launcher_np_round.png'), rd)

  console.log(`  ${dir}/ic_launcher_np(.png/_round.png) ${px}px ✓`)
}

console.log('\n✅ NotionPlus アイコン生成完了！')
