/**
 * generate-icon.mjs
 * 学習トラッカー用アイコンを生成する
 * 出力: build/icon.png (1024px), build/icon.ico (16/32/48/64/128/256)
 *
 * 実行: node scripts/generate-icon.mjs
 */

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── SVG デザイン（1024 × 1024）──────────────────────────────────
// コンセプト:
//   インディゴ→パープルのグラデーション背景
//   白い開いた本（左右ページ + 背表紙）
//   右ページに緑のチェックマーク
//   本の下に白い横線3本（学習記録のイメージ）
const SIZE = 1024
const R    = 200  // 角丸半径

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <!-- 背景グラデーション: インディゴ → バイオレット -->
    <linearGradient id="bg" x1="0" y1="0" x2="${SIZE}" y2="${SIZE}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#3730A3"/>
      <stop offset="100%" stop-color="#6D28D9"/>
    </linearGradient>
    <!-- 本のシャドウ -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#1e1b4b" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- 背景 -->
  <rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="url(#bg)"/>

  <!-- ── 本体（開いた本）filter="url(#shadow)" ── -->
  <g filter="url(#shadow)">
    <!-- 左ページ -->
    <path d="
      M 160 290
      Q 160 260 192 258
      L 488 272
      L 488 730
      L 192 716
      Q 160 714 160 684
      Z"
      fill="#FFFFFF" opacity="1"/>

    <!-- 右ページ -->
    <path d="
      M 864 290
      Q 864 260 832 258
      L 536 272
      L 536 730
      L 832 716
      Q 864 714 864 684
      Z"
      fill="#EDE9FE" opacity="1"/>

    <!-- 背表紙（中央の綴じ目） -->
    <rect x="483" y="256" width="58" height="476" rx="10" fill="#C4B5FD"/>
  </g>

  <!-- 左ページ: テキスト行（学習記録のイメージ）-->
  <g opacity="0.28">
    <rect x="210" y="360" width="238" height="22" rx="11" fill="#312E81"/>
    <rect x="210" y="410" width="198" height="22" rx="11" fill="#312E81"/>
    <rect x="210" y="460" width="220" height="22" rx="11" fill="#312E81"/>
    <rect x="210" y="510" width="170" height="22" rx="11" fill="#312E81"/>
    <rect x="210" y="560" width="210" height="22" rx="11" fill="#312E81"/>
    <rect x="210" y="610" width="150" height="22" rx="11" fill="#312E81"/>
  </g>

  <!-- 右ページ: 大きなチェックマーク（達成・完了のイメージ）-->
  <path d="M 590 490 L 680 600 L 820 400"
    stroke="#10B981"
    stroke-width="68"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"/>

  <!-- 右ページ: チェックのハイライト（光沢感）-->
  <path d="M 590 490 L 680 600 L 820 400"
    stroke="#6EE7B7"
    stroke-width="28"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
    opacity="0.5"/>
</svg>`

// ── Sharp で各サイズの PNG を生成 ─────────────────────────────────
const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]
const pngBufs = []

console.log('アイコン生成中...')

for (const s of SIZES) {
  const buf = await sharp(Buffer.from(svg))
    .resize(s, s)
    .png()
    .toBuffer()
  pngBufs.push({ size: s, buf })
  console.log(`  ${s}x${s} PNG ✓`)
}

// ── 1024px PNG を build/icon.png として保存 ────────────────────
const png1024 = pngBufs.find(p => p.size === 1024).buf
writeFileSync(resolve(ROOT, 'build', 'icon.png'), png1024)
console.log('\nbuild/icon.png 保存完了 ✓')

// ── ICO（16 / 32 / 48 / 64 / 128 / 256）を生成 ────────────────
const icoSizes = [16, 32, 48, 64, 128, 256]
const icoBufs  = pngBufs.filter(p => icoSizes.includes(p.size)).map(p => p.buf)

const icoBuf = await pngToIco(icoBufs)
writeFileSync(resolve(ROOT, 'build', 'icon.ico'), icoBuf)
console.log('build/icon.ico 保存完了 ✓')

console.log('\n✅ アイコン生成完了！')
