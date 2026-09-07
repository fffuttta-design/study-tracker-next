package com.studytracker

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(SharedTextPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createReviewChannel()
  }

  /**
   * 「今日の復習」通知のチャンネルを作る（Android 8以降は必須）。
   *
   * ⚠ サーバー(study-review-notifier)が android_channel_id="study_review" を指定して送るので、
   *   ここで同じIDのチャンネルを作っておかないと既定チャンネルに落ちる。
   *   チャンネルを分けておくと、本人が「復習の通知だけ音を消す」等を端末側で選べる。
   *   ※ 一度作られたチャンネルの設定は後から変えられない（名前だけは更新される）。
   */
  private fun createReviewChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val ch = NotificationChannel(
      "study_review",
      "今日の復習",
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply { description = "毎朝、その日に復習するアイテムを知らせます" }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(ch)
  }
}
