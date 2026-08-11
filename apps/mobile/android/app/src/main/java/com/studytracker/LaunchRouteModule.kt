package com.studytracker

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * 専用ランチャーアイコン（activity-alias）から起動されたとき、
 * どの画面を最初に開くかを React Native(JS) 側へ受け渡す小さなネイティブモジュール。
 *
 * 例: NotionPlus 専用アイコンをタップ → intent の component が
 *     "com.studytracker.NotionPlusAlias" → JS に "NotionPlus" を渡す。
 *
 * - コールドスタート: 起動インテントから getInitialLaunchRoute() で取り出す
 * - 起動中(ウォームスタート): MainActivity.onNewIntent → LaunchRouteHolder.push →
 *   "LaunchRouteReceived" イベントで JS へ通知
 */
object LaunchRouteHolder {
  // JS のリスナーがまだ無い時に溜めておく
  var pending: String? = null
  // モジュール生成後にセットされる送出関数
  var emit: ((String) -> Unit)? = null

  fun push(route: String?) {
    val r = route?.trim()
    if (r.isNullOrEmpty()) return
    val e = emit
    if (e != null) e(r) else pending = r
  }

  /** インテントの起動元コンポーネント名から、開くべき画面名を判定 */
  fun extract(intent: Intent?): String? {
    val cls = intent?.component?.className ?: return null
    return if (cls.endsWith("NotionPlusAlias")) "NotionPlus" else null
  }
}

class LaunchRouteModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LaunchRoute"

  init {
    LaunchRouteHolder.emit = { route -> sendEvent(route) }
  }

  private fun sendEvent(route: String) {
    try {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("LaunchRouteReceived", route)
    } catch (e: Exception) {
      // JS インスタンスがまだ生きていない → 溜めておく
      LaunchRouteHolder.pending = route
    }
  }

  @ReactMethod
  fun getInitialLaunchRoute(promise: Promise) {
    // 1) 溜まっている分を優先
    val pending = LaunchRouteHolder.pending
    if (!pending.isNullOrEmpty()) {
      LaunchRouteHolder.pending = null
      promise.resolve(pending)
      return
    }
    // 2) コールドスタートの起動インテントから取り出す（intent は消費しない）
    val activity = reactContext.currentActivity
    promise.resolve(LaunchRouteHolder.extract(activity?.intent))
  }

  // NativeEventEmitter 警告抑制（RN が登録/解除時に呼ぶ）
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
