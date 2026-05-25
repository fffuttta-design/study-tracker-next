/**
 * build-and-sync.mjs
 * ビルド → Google Drive 同期を一本で行うスクリプト
 *
 * やること:
 *   0. electron/build-info.json の buildNumber をインクリメント
 *   1. builtAt タイムスタンプを生成
 *   2. electron/build-info.json に version + buildNumber + builtAt を書き込む
 *   3. 起動中のアプリを終了（DLL ロック解除）
 *   4. electron-builder で win-unpacked ビルド（インストーラーなし）
 *   5. win-unpacked/version.json に version + buildNumber + builtAt を書き込む
 *   6. robocopy で Google Drive に同期（version.json も含む）
 *   7. アプリを再起動
 *   8. GitHub へ自動プッシュ
 *
 * 前提:
 *   .sync-dest ファイルに Google Drive のフォルダパスを書いておく
 *   例: H:\マイドライブ\ツール\StudyTracker
 *
 * 使い方:
 *   npm run dist:win:sync
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { execSync, spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const configFile   = path.join(ROOT, '.sync-dest')
const srcDir       = path.join(ROOT, 'dist-electron', 'win-unpacked')
const buildInfoPath = path.join(ROOT, 'electron', 'build-info.json')

// ── .sync-dest チェック ────────────────────────────────────────────
if (!existsSync(configFile)) {
  console.log('')
  console.log('================================================================')
  console.log('  .sync-dest ファイルが見つかりません')
  console.log('  プロジェクトルートに同期先パスを書いて作成してください')
  console.log('  例: H:\\マイドライブ\\ツール\\StudyTracker')
  console.log('================================================================')
  console.log('')
  process.exit(0)
}

const destDir = readFileSync(configFile, 'utf-8').trim()
if (!destDir) {
  console.error('[build-and-sync] .sync-dest が空です')
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

// ── Step 2.5: ビルド前にアプリを終了（DLL ロック解除）────────────
console.log('\n[build-and-sync] 起動中の 学習トラッカー.exe を終了（ビルド前）...')
try {
  execSync('taskkill /IM "学習トラッカー.exe" /F /T', { stdio: 'pipe' })
  console.log('[build-and-sync] アプリを終了しました。プロセス消滅を待機中...')
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500))
    try {
      const out = execSync('tasklist /FI "IMAGENAME eq 学習トラッカー.exe" /NH', { encoding: 'utf-8', stdio: 'pipe' })
      if (!out.includes('学習トラッカー.exe')) break
    } catch { break }
  }
  console.log('[build-and-sync] プロセス終了確認 ✓')
  await new Promise(r => setTimeout(r, 2000))
} catch {
  console.log('[build-and-sync] 起動中のアプリなし（スキップ）')
}

// win-unpacked を事前削除してロック後を防ぐ
console.log('[build-and-sync] win-unpacked を事前クリア...')
try {
  execSync('if exist "dist-electron\\win-unpacked" rmdir /s /q "dist-electron\\win-unpacked"', {
    cwd: ROOT, stdio: 'pipe', shell: true,
  })
  console.log('[build-and-sync] クリア完了')
} catch {
  console.log('[build-and-sync] クリアスキップ（存在しない）')
}

// ── Step 3: electron-builder でビルド（win-unpacked のみ）────────
console.log('\n[build-and-sync] ビルド中...\n')
try {
  execSync('npx electron-builder --win --dir', {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  })
} catch {
  const exePath = path.join(srcDir, '学習トラッカー.exe')
  if (!existsSync(exePath)) {
    console.error('[build-and-sync] ビルド失敗（学習トラッカー.exe が存在しない）')
    process.exit(1)
  }
  console.log('[build-and-sync] electron-builder がログエラーで終了しましたが exe は存在します。続行します。')
}
console.log('\n[build-and-sync] ビルド完了 ✓')

// ── Step 4: version.json を win-unpacked に書き込む ───────────────
writeFileSync(
  path.join(srcDir, 'version.json'),
  JSON.stringify(newBuildInfo, null, 2) + '\n',
  'utf-8'
)
console.log(`[build-and-sync] version.json 書き込み完了 (build ${newBuildNumber})`)

// ── Step 5: robocopy で Google Drive に同期 ───────────────────────
console.log(`\n[build-and-sync] 同期開始`)
console.log(`  FROM: ${srcDir}`)
console.log(`  TO  : ${destDir}\n`)
try {
  execSync(
    `robocopy "${srcDir}" "${destDir}" /MIR /R:0 /W:0 /NFL /NDL /NJH /NJS /NC /NS /NP`,
    { stdio: 'inherit' }
  )
} catch (e) {
  if ((e.status ?? 0) >= 8) {
    console.error(`[build-and-sync] 同期に失敗しました (exit code ${e.status})`)
    process.exit(1)
  }
}
console.log('[build-and-sync] 同期完了 ✓')

// ── Step 6: アプリを再起動 ────────────────────────────────────────
const exeLaunchPath = path.join(destDir, '学習トラッカー.exe')
if (existsSync(exeLaunchPath)) {
  console.log('[build-and-sync] アプリを再起動...')
  spawn(exeLaunchPath, [], { detached: true, stdio: 'ignore' }).unref()
  console.log(`[build-and-sync] 起動完了 ✓ (v${newVersion} / build ${newBuildNumber})\n`)
}

// ── Step 7: Android APK ビルド & Drive 同期 ───────────────────────
const androidSrcDir  = path.join(ROOT, 'apps', 'mobile')
const androidDestDir = path.join(destDir, 'android')
const apkSrcPath     = path.join(androidSrcDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
const apkDebugPath   = path.join(androidSrcDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

console.log('\n[build-and-sync] Android APK ビルド中...')
try {
  // JAVA_HOME を設定してビルド
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
  // assembleRelease を試みる（署名未設定なら debug にフォールバック）
  try {
    execSync(`"${gradlew}" assembleRelease`, {
      cwd: path.join(androidSrcDir, 'android'),
      stdio: 'inherit',
      shell: true,
      env,
    })
    console.log('[build-and-sync] Android Release ビルド完了 ✓')
  } catch {
    console.log('[build-and-sync] Release 失敗 → Debug ビルドにフォールバック')
    execSync(`"${gradlew}" assembleDebug`, {
      cwd: path.join(androidSrcDir, 'android'),
      stdio: 'inherit',
      shell: true,
      env,
    })
    console.log('[build-and-sync] Android Debug ビルド完了 ✓')
  }

  // APK を Drive にもコピー（手動インストール用）
  const apkPath = existsSync(apkSrcPath) ? apkSrcPath : apkDebugPath
  if (existsSync(apkPath)) {
    execSync(`if not exist "${androidDestDir}" mkdir "${androidDestDir}"`, { shell: true, stdio: 'pipe' })
    execSync(`copy /Y "${apkPath}" "${path.join(androidDestDir, 'study-tracker.apk')}"`, { shell: true, stdio: 'pipe' })
    console.log(`[build-and-sync] Android APK → Drive コピー完了 ✓`)

    // GitHub Release に APK をアップロード
    const tagName = `build-${newBuildNumber}`
    try {
      try {
        execSync(`gh release delete "${tagName}" --yes --cleanup-tag`, { cwd: ROOT, stdio: 'pipe' })
      } catch {}
      execSync(
        `gh release create "${tagName}" "${apkPath}#study-tracker.apk" --title "v${newVersion} (build ${newBuildNumber})" --notes "Build ${newBuildNumber}"`,
        { cwd: ROOT, stdio: 'pipe' }
      )
      const apkUrl = `https://github.com/fffuttta-design/study-tracker-next/releases/download/${tagName}/study-tracker.apk`
      // version.json に apkUrl を追記して上書き
      const versionJsonWithUrl = JSON.stringify({ ...newBuildInfo, apkUrl }, null, 2) + '\n'
      writeFileSync(path.join(ROOT, 'apps', 'mobile', 'version.json'), versionJsonWithUrl, 'utf-8')
      console.log(`[build-and-sync] GitHub Release アップロード完了 ✓ (${tagName})`)
    } catch (e) {
      console.warn('[build-and-sync] GitHub Release 失敗:', e.message)
    }
  } else {
    console.warn('[build-and-sync] APK ファイルが見つかりません（スキップ）')
  }
} catch (e) {
  console.warn('[build-and-sync] Android ビルド失敗（Windows ビルドは成功）:', e.message)
}

// ── Step 8: GitHub へ自動プッシュ ────────────────────────────────
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

// ── Step 9: GitHub 反映確認（テスト可能チェック）────────────────
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
