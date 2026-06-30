package com.studytracker

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * 共有(ACTION_SEND)・テキスト選択メニュー(PROCESS_TEXT)から渡されたテキストを
 * React Native(JS)側へ受け渡すための小さなネイティブモジュール。
 *
 * - コールドスタート: 起動インテントから getInitialSharedText() で取り出す
 * - 起動中(ウォームスタート): MainActivity.onNewIntent → SharedTextHolder.push →
 *   "SharedTextReceived" イベントで JS へ通知
 */
object SharedTextHolder {
  // JS のリスナーがまだ無い時に溜めておく
  var pending: String? = null
  // モジュール生成後にセットされる送出関数
  var emit: ((String) -> Unit)? = null

  fun push(text: String?) {
    val t = text?.trim()
    if (t.isNullOrEmpty()) return
    val e = emit
    if (e != null) e(t) else pending = t
  }

  /** インテントから共有テキストを取り出す（SEND / PROCESS_TEXT 両対応） */
  fun extract(intent: Intent?): String? {
    if (intent == null) return null
    return when (intent.action) {
      Intent.ACTION_SEND -> {
        if (intent.type == "text/plain") {
          val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
          val body = intent.getStringExtra(Intent.EXTRA_TEXT)
          val joined = listOfNotNull(subject, body).joinToString("\n")
          joined.ifBlank { null }
        } else null
      }
      Intent.ACTION_PROCESS_TEXT ->
        intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
      else -> null
    }
  }
}

class SharedTextModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SharedText"

  init {
    // 起動中に新しい共有が来たら JS へイベント送出
    SharedTextHolder.emit = { text -> sendEvent(text) }
  }

  private fun sendEvent(text: String) {
    try {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("SharedTextReceived", text)
    } catch (e: Exception) {
      // JS インスタンスがまだ生きていない → 溜めておく
      SharedTextHolder.pending = text
    }
  }

  @ReactMethod
  fun getInitialSharedText(promise: Promise) {
    // 1) 溜まっている分を優先
    val pending = SharedTextHolder.pending
    if (!pending.isNullOrEmpty()) {
      SharedTextHolder.pending = null
      promise.resolve(pending)
      return
    }
    // 2) コールドスタートの起動インテントから取り出す
    val activity = reactContext.currentActivity
    if (activity != null) {
      val text = SharedTextHolder.extract(activity.intent)
      if (!text.isNullOrEmpty()) {
        // 二重取り込み防止：取り出したら起動インテントを通常状態に戻す
        activity.intent = Intent(Intent.ACTION_MAIN)
        promise.resolve(text)
        return
      }
    }
    promise.resolve(null)
  }

  // NativeEventEmitter 警告抑制（RN が登録/解除時に呼ぶ）
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
