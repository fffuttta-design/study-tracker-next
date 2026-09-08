/**
 * build-and-sync.mjs
 * 全プラットフォーム一括ビルド & 配信スクリプト
 *
 * やること:
 *   0. build-info.json の buildNumber / version をインクリメント
 *   1. version.ts / version.json / updateService.ts / package.json を自動更新
 *   2. electron-builder NSIS でインストーラーをビルド（--publish never）
 *      → gh CLI で GitHub Release v${version} を作成し setup.exe / blockmap / latest.yml を公開
 *         （electron-updater が latest.yml を参照して自動アップデート）
 *   3. Android APK をビルド（assembleDebug のみ）
 *      → 同じ Release に study-tracker.apk を追加アップロード＋version.json に downloadUrl 反映
 *   4. git push → Vercel 自動デプロイ（Web 配信完了）
 *
 * 前提:
 *   gh CLI がインストール済み＆ `gh auth login` 済みであること（GH_TOKEN/PAT は不要）。
 *   未認証の場合は GitHub Release だけスキップし、Web（git push）は配信される。
 *
 * 使い方:
 *   npm run dist:win:sync
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const buildInfoPath = path.join(ROOT, 'electron', 'build-info.json')


// ── Step -1: @futa/editor（ふたメモと共有のエディタ部品）を最新に進める ──────
// 🔥 Vercel は package-lock.json に書かれた commit を取りに行く。FutaEditor を直しても、
//    ここを進めないと配信物には古いままの物が載る。しかも手元はジャンクションで実フォルダを
//    見ているので「手元では直っているのに配信物だけ古い」＝いちばん気づけない形で食い違う。
//    詳しい配線は CLAUDE.md「配線」の節。
const FUTA_EDITOR_DIR  = 'C:\dev\CompanyOps\Application\Utility\FutaEditor'
const FUTA_EDITOR_SPEC = 'git+https://github.com/fffuttta-design/futa-editor.git#main'

if (existsSync(FUTA_EDITOR_DIR)) {
  // push されていない変更があるまま配信すると、配信物にだけ入らない。先に止める。
  let dirty = '', ahead = '0'
  try {
    dirty = execSync('git status --porcelain', { cwd: FUTA_EDITOR_DIR, stdio: 'pipe' }).toString().trim()
    ahead = execSync('git rev-list --count @{u}..HEAD', { cwd: FUTA_EDITOR_DIR, stdio: 'pipe' }).toString().trim()
  } catch { /* upstream 未設定などで判定できないときは素通り（配信は止めない） */ }

  if (dirty || ahead !== '0') {
    console.error('\n[build-and-sync] 🛑 FutaEditor に、まだ配信できない変更があります。')
    if (dirty) console.error('  未コミットの変更:\n' + dirty)
    if (ahead !== '0') console.error(`  未pushのコミット: ${ahead}件`)
    console.error(`\n  先に ${FUTA_EDITOR_DIR} で commit → push してから、もう一度配信してください。`)
    console.error('  （このまま進めると、手元では直っているのに配信物だけ古い状態になります）\n')
    process.exit(1)
  }

  // 🔥 version を上げ忘れていないか。
  //    webpack は node_modules の中身を「パッケージの version」で新旧判断する
  //    （snapshot.managedPaths）。中身だけ変えて version を据え置くと、
  //    Vercel のビルドキャッシュが前のファイルを使い回し、**ビルドは成功するのに
  //    配信物だけ古い**という一番気づけない形で食い違う（2026-09-08 に実際に発生）。
  try {
    const localVer  = JSON.parse(readFileSync(path.join(FUTA_EDITOR_DIR, 'package.json'), 'utf-8')).version
    const lock      = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8'))
    const lockedSha = (lock.packages?.['apps/web/node_modules/@futa/editor']?.resolved ?? '').split('#')[1] ?? ''
    const headSha   = execSync('git rev-parse HEAD', { cwd: FUTA_EDITOR_DIR, stdio: 'pipe' }).toString().trim()
    const pinnedVer = JSON.parse(
      execSync(`git show ${lockedSha}:package.json`, { cwd: FUTA_EDITOR_DIR, stdio: 'pipe' }).toString()
    ).version
    if (lockedSha && lockedSha !== headSha && localVer === pinnedVer) {
      console.error('\n[build-and-sync] 🛑 FutaEditor の version を上げ忘れています。')
      console.error(`  中身は進んでいる（取り込み済み ${lockedSha.slice(0, 7)} → 最新 ${headSha.slice(0, 7)}）のに version は ${localVer} のまま。`)
      console.error('  このまま配信すると Vercel のビルドキャッシュが古いファイルを使い回し、')
      console.error('  ビルドは成功するのに配信物だけ古い、という一番気づけない状態になります。')
      console.error(`\n  ${FUTA_EDITOR_DIR} の package.json の version を上げて commit → push してから、もう一度配信してください。\n`)
      process.exit(1)
    }
  } catch { /* 判定できないときは素通り（配信は止めない） */ }

}

console.log('[build-and-sync] @futa/editor を最新に進めています...')
try {
  execSync(`npm install @futa/editor@${FUTA_EDITOR_SPEC} -w apps/web --silent`, { cwd: ROOT, stdio: 'pipe' })
  execSync('node scripts/link-futa-editor.mjs', { cwd: ROOT, stdio: 'pipe' })
  const lock = readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8')
  const pin = lock.match(/futa-editor\.git#([0-9a-f]{40})/)?.[1]
  console.log(`[build-and-sync] @futa/editor 取り込み先: ${pin ? pin.slice(0, 7) : '(不明)'}`)
} catch (e) {
  console.error('[build-and-sync] @futa/editor の更新に失敗:', e.message)
  process.exit(1)
}

// ── Step 0: buildNumber と version をインクリメント ──────────────
const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf-8'))
const prevBuildNumber = buildInfo.buildNumber ?? 0
const newBuildNumber  = prevBuildNumber + 1

// patch を +1（例: 1.0.3 → 1.0.4）
const prevVersion = buildInfo.version ?? '1.0.0'
const [major, minor, patch] = prevVersion.split('.').map(Number)
const newVersion = `${major}.${minor}.${patch + 1}`

console.log(`\n[build-and-sync] buildNumber: ${prevBuildNumber} → ${newBuildNumber}`)
console.log(`[build-and-sync] version:     ${prevVersion} → ${newVersion}`)

// ── Step 1: builtAt を生成 ────────────────────────────────────────
const builtAt = new Date().toISOString()
console.log(`[build-and-sync] ビルド開始: ${builtAt}`)

// ── Step 2: electron/build-info.json に書き込む ───────────────────
const newBuildInfo = { version: newVersion, buildNumber: newBuildNumber, builtAt }
writeFileSync(buildInfoPath, JSON.stringify(newBuildInfo, null, 2) + '\n', 'utf-8')
console.log(`[build-and-sync] build-info.json 書き込み完了`)

// apps/web/src/lib/version.ts を自動更新（手動編集不要・ズレ防止）
writeFileSync(
  path.join(ROOT, 'apps', 'web', 'src', 'lib', 'version.ts'),
  `export const APP_VERSION = 'v${newVersion}';\n`,
  'utf-8'
)
console.log(`[build-and-sync] version.ts 書き込み完了 (v${newVersion})`)

// apps/mobile/version.json を更新（GitHub raw URL で参照される）
writeFileSync(
  path.join(ROOT, 'apps', 'mobile', 'version.json'),
  JSON.stringify(newBuildInfo, null, 2) + '\n',
  'utf-8'
)
console.log(`[build-and-sync] apps/mobile/version.json 書き込み完了`)

// Android の updateService.ts のビルド番号も更新
try {
  execSync(`node scripts/update-mobile-build-number.mjs ${newBuildNumber} ${newVersion}`, {
    cwd: ROOT, stdio: 'pipe',
  })
  console.log(`[build-and-sync] updateService.ts ビルド番号更新完了`)
} catch (e) {
  console.warn('[build-and-sync] updateService.ts 更新失敗:', e.message)
}

// ── Step 3: package.json version を同期（electron-updater が参照する）──
const pkgPath = path.join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
pkg.version = newVersion
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
console.log(`[build-and-sync] package.json version 更新: ${newVersion}`)

// ── GitHub 配信は gh CLI の認証を使う（GH_TOKEN 不要）─────────────
// 以前は GH_TOKEN(PAT) を要求していたが、未設定だと Release が作られず自動更新が止まる事故が
// あったため、ログイン済みの gh CLI を使う方式へ変更（`gh auth login` 済みなら何もいらない）。
const REPO = 'fffuttta-design/study-tracker-next'
const releaseTag = `v${newVersion}`
// gh が使えるか（インストール済み＆認証済み）を確認
let ghReady = false
try {
  execSync('gh auth status', { cwd: ROOT, stdio: 'pipe' })
  ghReady = true
} catch {
  console.warn('[build-and-sync] ⚠  gh CLI が未インストール or 未認証 → GitHub Release をスキップ')
  console.warn('              → `gh auth login` を一度実行すれば次回から自動で配信されます（Web は git push で配信済み）')
}
// 指定アセットを Release へ公開（無ければ作成・あればクロバー上書き）。失敗しても false を返すだけ。
const publishAssets = (assets, { latest = false } = {}) => {
  if (!ghReady) return false
  const files = assets.filter(existsSync)
  if (files.length === 0) { console.warn('[build-and-sync] 公開アセットが見つかりません'); return false }
  const quoted = files.map((p) => `"${p}"`).join(' ')
  try {
    let exists = false
    try { execSync(`gh release view "${releaseTag}" --repo ${REPO}`, { cwd: ROOT, stdio: 'pipe' }); exists = true } catch { exists = false }
    if (exists) {
      execSync(`gh release upload "${releaseTag}" ${quoted} --repo ${REPO} --clobber`, { cwd: ROOT, stdio: 'inherit' })
      if (latest) execSync(`gh release edit "${releaseTag}" --repo ${REPO} --draft=false --latest`, { cwd: ROOT, stdio: 'pipe' })
    } else {
      const latestFlag = latest ? '--latest' : ''
      execSync(`gh release create "${releaseTag}" --repo ${REPO} --title "v${newVersion} (build ${newBuildNumber})" --notes "自動配信 build ${newBuildNumber}" ${latestFlag} ${quoted}`, { cwd: ROOT, stdio: 'inherit' })
    }
    return true
  } catch (e) {
    console.warn('[build-and-sync] GitHub Release 公開失敗:', e.message)
    return false
  }
}

// ── Step 4: electron-builder NSIS ビルド & GitHub Release 作成 ───
console.log(`\n[build-and-sync] Windows NSIS ビルド中 (--publish never)...\n`)
const setupPath = path.join(ROOT, 'dist-electron', 'study-tracker-setup.exe')
try {
  execSync(`npx electron-builder --win --publish never`, {
    cwd: ROOT, stdio: 'inherit', shell: true,
    env: { ...process.env },
  })
} catch (e) {
  if (!existsSync(setupPath)) {
    console.error('[build-and-sync] ビルド失敗（study-tracker-setup.exe が存在しない）')
    process.exit(1)
  }
  console.log('[build-and-sync] electron-builder がログエラーで終了しましたが Setup.exe は存在します。続行します。')
}
console.log('\n[build-and-sync] Windows ビルド完了 ✓')
console.log(`[build-and-sync] Setup.exe: ${setupPath}`)

// GitHub Release を gh CLI で公開（latest.yml が無いと自動更新が一切効かないため必ず含める）
const de = path.join(ROOT, 'dist-electron')
const winPublished = publishAssets([
  path.join(de, 'study-tracker-setup.exe'),
  path.join(de, 'study-tracker-setup.exe.blockmap'),
  path.join(de, 'latest.yml'),
], { latest: true })
if (winPublished) console.log(`[build-and-sync] GitHub Release ${releaseTag} 公開 ✓ (Windows 自動更新)`)

// ── Step 5: Android APK ビルド & 既存 Release に追加 ─────────────
const androidSrcDir  = path.join(ROOT, 'apps', 'mobile')
const apkDebugPath   = path.join(androidSrcDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

console.log('\n[build-and-sync] Android APK ビルド中...')
try {
  const javaHome = 'C:\\Program Files\\Android\\Android Studio\\jbr'
  const androidHome = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
    : 'C:\\Users\\visit\\AppData\\Local\\Android\\Sdk'
  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    Path: `${javaHome}\\bin;${androidHome}\\platform-tools;${process.env.Path ?? ''}`,
  }
  const gradlew = path.join(androidSrcDir, 'android', 'gradlew.bat')

  // JS バンドルのキャッシュを削除して必ず最新の JS を再コンパイルさせる
  const { rmSync } = await import('fs')
  const bundlePaths = [
    path.join(androidSrcDir, 'android', 'app', 'src', 'main', 'assets', 'index.android.bundle'),
    path.join(androidSrcDir, 'android', 'app', 'src', 'main', 'assets', 'index.android.bundle.map'),
  ]
  for (const bp of bundlePaths) {
    if (existsSync(bp)) {
      rmSync(bp, { force: true })
      console.log(`[build-and-sync] JS バンドルキャッシュ削除: ${path.basename(bp)}`)
    }
  }

  // 古い gradle/java デーモンを掃除（16GB機ではデーモンが居座るとメモリ枯渇で
  // 「Gradle build daemon disappeared」＝OS が JVM を kill してビルドが落ちる）
  try {
    execSync('powershell -NoProfile -Command "Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' })
    console.log('[build-and-sync] 古い java デーモンを掃除')
  } catch { /* いなければ無視 */ }

  // assembleDebug のみ（releaseはreanimated ninja loopで失敗するため、debugのみ使用）
  // proguard無効・debuggableVariants=[]でJSバンドル込み → 機能差なし
  //
  // ⚠️ 全4ABI（armeabi-v7a/arm64-v8a/x86/x86_64）を並列で C++ コンパイルすると、
  //    新アーキ(newArchEnabled)の clang/ninja が RAM を食い尽くし、この16GB機では
  //    デーモンが OS に kill されてビルドが落ちる。arm64-v8a 単一 ABI ＋ワーカー2 に
  //    絞って通す（現代のスマホは全て arm64 なので実用上の問題なし）。
  execSync(`"${gradlew}" assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2`, {
    cwd: path.join(androidSrcDir, 'android'),
    stdio: 'inherit',
    shell: true,
    env,
  })
  console.log('[build-and-sync] Android Debug ビルド完了 ✓')

  // Release (v${newVersion}) に APK を追加アップロード（gh CLI 認証を使用）
  // gh release upload はファイル名をそのまま使う。正しい名前でコピーしてからアップロード
  const apkFinalPath = path.join(path.dirname(apkDebugPath), 'study-tracker.apk')
  if (existsSync(apkDebugPath) && ghReady) {
    const { copyFileSync } = await import('fs')
    copyFileSync(apkDebugPath, apkFinalPath)
    const apkPublished = publishAssets([apkFinalPath], { latest: true })
    if (apkPublished) {
      // Android はこの version.json の downloadUrl を見て更新する（master raw 経由）
      const downloadUrl = `https://github.com/fffuttta-design/study-tracker-next/releases/download/${releaseTag}/study-tracker.apk`
      const versionJsonWithUrl = JSON.stringify({ ...newBuildInfo, downloadUrl }, null, 2) + '\n'
      writeFileSync(path.join(ROOT, 'apps', 'mobile', 'version.json'), versionJsonWithUrl, 'utf-8')
      console.log(`[build-and-sync] APK アップロード & Release 公開完了 ✓ (${releaseTag})`)
      console.log(`[build-and-sync] downloadUrl: ${downloadUrl}`)
    }
  } else if (!ghReady) {
    console.warn('[build-and-sync] gh CLI 未認証のため APK アップロードをスキップ')
  } else {
    console.warn('[build-and-sync] APK ファイルが見つかりません（スキップ）')
  }
} catch (e) {
  console.warn('[build-and-sync] Android ビルド失敗（Windows ビルドは成功）:', e.message)
}

// ── Step 9: GitHub へ自動プッシュ ────────────────────────────────
console.log('[build-and-sync] GitHub へプッシュ中...')
let pushed = false
try {
  execSync('git add -A', { cwd: ROOT, stdio: 'pipe' })
  const diffOut = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf-8' })
  if (diffOut.trim()) {
    execSync(`git commit -m "build: ${newBuildNumber} (v${newVersion})"`, { cwd: ROOT, stdio: 'pipe' })
    execSync('git push origin master', { cwd: ROOT, stdio: 'pipe' })
    console.log(`[build-and-sync] GitHub プッシュ完了 ✓ (build ${newBuildNumber})`)
    pushed = true
  } else {
    console.log('[build-and-sync] 変更なし、プッシュスキップ')
  }
} catch (e) {
  console.warn('[build-and-sync] GitHub プッシュ失敗（ビルド自体は成功）:', e.message)
}

// ── Step 10: GitHub 反映確認（テスト可能チェック）────────────────
if (pushed) {
  const GITHUB_VERSION_URL = 'https://api.github.com/repos/fffuttta-design/study-tracker-next/contents/apps/mobile/version.json'
  console.log('\n[build-and-sync] GitHub 反映確認中...')
  const maxWait = 60000  // 最大60秒
  const interval = 3000  // 3秒ごとにチェック
  const startTime = Date.now()
  let confirmed = false

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, interval))
    try {
      const res = await fetch(GITHUB_VERSION_URL, {
        headers: { Accept: 'application/vnd.github.raw+json' },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.buildNumber === newBuildNumber) {
          confirmed = true
          break
        }
        process.stdout.write(`\r[build-and-sync] 待機中... (GitHub: build ${data.buildNumber}, 目標: build ${newBuildNumber})`)
      }
    } catch {
      // ネットワークエラーは無視してリトライ
    }
  }

  if (confirmed) {
    console.log(`\n[build-and-sync] ✅ build ${newBuildNumber} (v${newVersion}) GitHub 反映確認済み`)
    console.log('[build-and-sync] 📱 今すぐアップデートをテストできます！')
  } else {
    console.warn(`\n[build-and-sync] ⚠️  60秒以内に GitHub 反映を確認できませんでした`)
    console.warn('[build-and-sync]    しばらく待ってからテストしてください')
  }
}
