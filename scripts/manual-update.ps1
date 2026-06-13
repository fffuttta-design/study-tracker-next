# Study Tracker 手動アップデートスクリプト
# build 209 のアップデーターが失敗する場合に直接実行してください

$ErrorActionPreference = "SilentlyContinue"
$logFile = "$env:TEMP\study-tracker-manual-update.log"
"" | Out-File $logFile -Encoding UTF8 -Force

function wl {
  param($m, $c = "White")
  $line = (Get-Date).ToString("HH:mm:ss") + " " + $m
  Write-Host $line -ForegroundColor $c
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

try {
  wl "===== Study Tracker 手動アップデート =====" "Cyan"
  wl ""

  # update-source.json からソースパスを取得
  $configPath = "$env:APPDATA\学習トラッカー\update-source.json"
  $srcPath = $null

  if (Test-Path $configPath) {
    $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
    $srcPath = $cfg.sourcePath
    wl "設定ファイルから取得: $srcPath" "Gray"
  }

  # フォールバック: 既知の Drive パス
  if (-not $srcPath -or -not (Test-Path $srcPath)) {
    $srcPath = "H:\マイドライブ\ツール開発\StudyTracker"
    wl "既知パスを使用: $srcPath" "Gray"
  }

  if (-not (Test-Path $srcPath)) {
    throw "ソースフォルダが見つかりません: $srcPath"
  }

  $dst = "$env:LOCALAPPDATA\StudyTracker"
  $exe = "$dst\学習トラッカー.exe"

  # バージョン情報を表示
  $vJsonPath = Join-Path $srcPath "version.json"
  if (Test-Path $vJsonPath) {
    $vJson = Get-Content $vJsonPath -Raw | ConvertFrom-Json
    wl "アップデート先: v$($vJson.version) (build $($vJson.buildNumber))" "Yellow"
  }
  wl "元: $srcPath"
  wl "先: $dst"
  wl ""

  wl "[1/3] アプリを終了中..." "Green"
  $null = & taskkill /IM "学習トラッカー.exe" /F /T
  Start-Sleep -Seconds 2
  $i = 0
  while ((Get-Process -Name "学習トラッカー" -ErrorAction SilentlyContinue) -and ($i -lt 10)) {
    Start-Sleep -Seconds 1; $i++
  }
  wl "    プロセス終了確認 ✓" "Green"
  wl ""

  wl "[2/3] コピー中..." "Yellow"
  robocopy $srcPath $dst /MIR /R:3 /W:2 /NFL /NDL /NJH /NJS /NC /NS /NP
  $rc = $LASTEXITCODE
  wl "    robocopy 終了コード: $rc" "Gray"
  if ($rc -ge 8) { throw "robocopy 失敗 (code=$rc)" }
  wl "    コピー完了 ✓" "Green"
  wl ""

  Start-Sleep -Seconds 1
  wl "[3/3] アプリを起動します..." "Cyan"
  Start-Sleep -Seconds 1
  & cmd.exe /c start "" $exe

  wl ""
  wl "アップデート完了！" "Green"
  wl "ログ保存先: $logFile" "Gray"
  wl ""
  Read-Host "Enterキーで閉じる"

} catch {
  wl ""
  wl "===== エラー発生 =====" "Red"
  wl "  $($_.Exception.Message)" "Red"
  if ($_.InvocationInfo) {
    wl "  発生箇所: 行 $($_.InvocationInfo.ScriptLineNumber)" "Yellow"
  }
  wl ""
  wl "ログ保存先: $logFile" "Yellow"
  wl ""
  Read-Host "Enterキーで閉じる"
  exit 1
}
