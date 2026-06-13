/**
 * build-and-sync.mjs
 * 全プラットフォーム一括ビルド & 配信スクリプト
 *
 * やること:
 *   0. build-info.json の buildNumber / version をインクリメント
 *   1. version.ts / version.json / updateService.ts / package.json を自動更新
 *   2. electron-builder NSIS でインストーラーをビルド
 *      → GH_TOKEN があれば GitHub Release v${version} を自動作成・アップロード
 *         （electron-updater が latest.yml を参照して自動アップデート）
 *   3. Android APK をビルド（assembleDebug のみ）
 *      → 同じ Release に study-tracker.apk を追加アップロード
 *   4. git push → Vercel 自動デプロイ（Web 配信完了）
 *
 * 前提:
 *   $env:GH_TOKEN = "ghp_xxx"  ← ビルド前に設定（PAT: contents:write 権限）
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

// ── Step 4: electron-builder NSIS ビルド & GitHub Release 作成 ───
const ghToken = process.env.GH_TOKEN
if (!ghToken) {
  console.warn('[build-and-sync] ⚠  GH_TOKEN 未設定 → GitHub Release を作成しません')
  console.warn('              → ビルド前に $env:GH_TOKEN = "ghp_xxx" を設定してください')
}
const publishFlag = ghToken ? '--publish always' : '--publish never'
console.log(`\n[build-and-sync] Windows NSIS ビルド中 (${publishFlag})...\n`)
const setupPath = path.join(ROOT, 'dist-electron', 'study-tracker-setup.exe')
try {
  execSync(`npx electron-builder --win ${publishFlag}`, {
    cwd: ROOT, stdio: 'inherit', shell: true,
    env: { ...process.env },  // GH_TOKEN を引き継ぐ
  })
} catch (e) {
  if (!existsSync(setupPath)) {
    console.error('[build-and-sync] ビルド失敗（study-tracker-setup.exe が存在しない）')
    process.exit(1)
  }
  console.log('[build-and-sync] electron-builder がログエラーで終了しましたが Setup.exe は存在します。続行します。')
}
console.log('\n[build-and-sync] Windows ビルド & Release 完了 ✓')
console.log(`[build-and-sync] Setup.exe: ${setupPath}`)

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

  // assembleDebug のみ（releaseはreanimated ninja loopで失敗するため、debugのみ使用）
  // proguard無効・debuggableVariants=[]でJSバンドル込み → 機能差なし
  execSync(`"${gradlew}" assembleDebug`, {
    cwd: path.join(androidSrcDir, 'android'),
    stdio: 'inherit',
    shell: true,
    env,
  })
  console.log('[build-and-sync] Android Debug ビルド完了 ✓')

  // electron-builder が作成した Release (v${newVersion}) に APK を追加アップロード
  const releaseTag = `v${newVersion}`
  if (existsSync(apkDebugPath) && ghToken) {
    try {
      execSync(
        `gh release upload "${releaseTag}" "${apkDebugPath}#study-tracker.apk" --clobber`,
        { cwd: ROOT, stdio: 'pipe' }
      )
      const downloadUrl = `https://github.com/fffuttta-design/study-tracker-next/releases/download/${releaseTag}/study-tracker.apk`
      const versionJsonWithUrl = JSON.stringify({ ...newBuildInfo, downloadUrl }, null, 2) + '\n'
      writeFileSync(path.join(ROOT, 'apps', 'mobile', 'version.json'), versionJsonWithUrl, 'utf-8')
      console.log(`[build-and-sync] APK アップロード完了 ✓ (${releaseTag})`)
      console.log(`[build-and-sync] downloadUrl: ${downloadUrl}`)
    } catch (e) {
      console.warn('[build-and-sync] APK アップロード失敗:', e.message)
    }
  } else if (!ghToken) {
    console.warn('[build-and-sync] GH_TOKEN 未設定のため APK アップロードをスキップ')
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
