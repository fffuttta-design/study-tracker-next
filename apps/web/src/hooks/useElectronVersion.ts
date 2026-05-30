'use client'
import { useState, useEffect } from 'react'
import { APP_VERSION } from '@/lib/version'

/**
 * Electron 環境ではインストール済みシェルの実際のバージョンを返す。
 * Web 環境では Vercel デプロイ版（APP_VERSION）を返す。
 * これにより UI と更新ダイアログのバージョン表示が一致する。
 */
export function useElectronVersion(): string {
  const [version, setVersion] = useState<string>(APP_VERSION)

  useEffect(() => {
    const api = (typeof window !== 'undefined' ? (window as Window & { electronAPI?: { getBuildInfo?: () => Promise<{ version: string } | null> } }).electronAPI : null)
    if (!api?.getBuildInfo) return

    api.getBuildInfo().then((info) => {
      if (info?.version) setVersion(`v${info.version}`)
    }).catch(() => {})
  }, [])

  return version
}
