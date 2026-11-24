package dev.pricematchtracker.costcosavings

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Starts a reading of the Costco app's Warehouse Savings list and reports its progress.
 * The reading itself is done by [SavingsReaderService].
 */
class CostcoSavingsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CostcoSavings")

    Function("isCostcoInstalled") {
      context().packageManager.getLaunchIntentForPackage(COSTCO_PACKAGE) != null
    }

    Function("isServiceEnabled") { isServiceEnabled(context()) }

    Function("openSettings") {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context().startActivity(intent)
    }

    // Opens the Costco app; the service takes it from there. False if Costco isn't installed.
    Function("start") {
      val ctx = context()
      val launch = ctx.packageManager.getLaunchIntentForPackage(COSTCO_PACKAGE)
      if (launch == null) {
        false
      } else {
        ReaderSession.begin(System.currentTimeMillis())
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(launch)
        true
      }
    }

    Function("status") { ReaderSession.snapshot() }

    Function("cancel") { ReaderSession.cancel() }

    Function("clear") { ReaderSession.reset() }
  }

  private fun context(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun isServiceEnabled(ctx: Context): Boolean {
    val manager = ctx.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
    return manager
      .getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
      .any { info ->
        val service = info.resolveInfo.serviceInfo
        service.packageName == ctx.packageName &&
          service.name == SavingsReaderService::class.java.name
      }
  }
}
