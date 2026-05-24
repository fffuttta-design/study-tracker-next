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
//   ゴールド（深琥珀 → 明るい金）のグラデーション背景
//   白い開いた本（左右ページ + 背表紙）
//   右ページに白いチェックマーク
const SIZE = 1024
const R    = 200  // 角丸半径

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <!-- 背景グラデーション: ビビッドゴールド -->
    <linearGradient id="bg" x1="0" y1="0" x2="${SIZE}" y2="${SIZE}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#F59E0B"/>
      <stop offset="60%"  stop-color="#FBBF24"/>
      <stop offset="100%" stop-color="#FEF08A"/>
    </linearGradient>
    <!-- 本の光沢グラデーション（左ページ） -->
    <linearGradient id="pageL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#FFFBEB"/>
      <stop offset="100%" stop-color="#FEF3C7"/>
    </linearGradient>
    <!-- 本のシャドウ -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="20" stdDeviation="28" flood-color="#92400E" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- 背景 -->
  <rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="url(#bg)"/>

  <!-- 背景に微細なテクスチャ（光の筋）-->
  <ellipse cx="300" cy="200" rx="500" ry="200" fill="white" opacity="0.04" transform="rotate(-20 300 200)"/>

  <!-- ── 本体（開いた本）── -->
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
      fill="url(#pageL)"/>

    <!-- 右ページ -->
    <path d="
      M 864 290
      Q 864 260 832 258
      L 536 272
      L 536 730
      L 832 716
      Q 864 714 864 684
      Z"
      fill="#FEF9EE" opacity="0.92"/>

    <!-- 背表紙（中央の綴じ目）-->
    <rect x="483" y="256" width="58" height="476" rx="10" fill="#FDE68A"/>
  </g>

  <!-- 左ページ: テキスト行（学習記録のイメージ）-->
  <g opacity="0.2">
    <rect x="210" y="360" width="238" height="22" rx="11" fill="#92400E"/>
    <rect x="210" y="410" width="198" height="22" rx="11" fill="#92400E"/>
    <rect x="210" y="460" width="220" height="22" rx="11" fill="#92400E"/>
    <rect x="210" y="510" width="170" height="22" rx="11" fill="#92400E"/>
    <rect x="210" y="560" width="210" height="22" rx="11" fill="#92400E"/>
    <rect x="210" y="610" width="150" height="22" rx="11" fill="#92400E"/>
  </g>

  <!-- 右ページ: 大きなチェックマーク（白）-->
  <path d="M 590 490 L 680 600 L 820 400"
    stroke="#FFFFFF"
    stroke-width="72"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"/>

  <!-- チェックマーク: 内側ハイライト（金色）-->
  <path d="M 590 490 L 680 600 L 820 400"
    stroke="#FDE68A"
    stroke-width="30"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
    opacity="0.6"/>
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
