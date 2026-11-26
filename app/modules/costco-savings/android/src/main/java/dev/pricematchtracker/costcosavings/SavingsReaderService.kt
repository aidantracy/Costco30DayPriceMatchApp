package dev.pricematchtracker.costcosavings

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast

/**
 * Reads the Costco app's Warehouse Savings list when the owner asks for it
 * ([ReaderSession] is running). It opens Warehouse → Warehouse Savings if it can, then reads
 * the text on screen, scrolls, and repeats until the end of the list, and returns to Price
 * Match Tracker. The service only gets events from the Costco app (see
 * res/xml/costco_savings_service.xml) and does nothing at all between readings.
 */
class SavingsReaderService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())
  private var ticking = false
  private var runId = -1
  private var clicks = 0
  private var lastClickAt = 0L
  private var hinted = false
  private var stalePages = 0
  private val seenItems = mutableSetOf<String>()
  @Volatile private var lastEventAt = 0L

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    lastEventAt = System.currentTimeMillis()
    if (ticking || ReaderSession.state != ReaderSession.State.RUNNING) return
    if (runId != ReaderSession.runId) startRun()
    ticking = true
    handler.postDelayed({ tick() }, FIRST_TICK_MS)
  }

  override fun onInterrupt() {
    // Nothing to stop: readings are short and driven by tick().
  }

  private fun startRun() {
    runId = ReaderSession.runId
    clicks = 0
    lastClickAt = 0L
    hinted = false
    stalePages = 0
    seenItems.clear()
  }

  private fun tick() {
    val now = System.currentTimeMillis()
    if (ReaderSession.state != ReaderSession.State.RUNNING || runId != ReaderSession.runId) {
      ticking = false
      return
    }
    if (!ReaderSession.isActive(now)) {
      ReaderSession.fail(
        if (ReaderSession.pageCount() == 0) "Couldn't find Warehouse Savings in the Costco app."
        else "Reading took too long."
      )
      stop()
      return
    }

    val root = rootInActiveWindow
    if (root == null || root.packageName?.toString() != COSTCO_PACKAGE) {
      ReaderSession.step = "waiting"
      later(TICK_MS)
      return
    }

    val lines = collect(root)
    if (isSavingsList(lines)) {
      readPage(root, lines)
    } else {
      ReaderSession.step = "finding"
      navigate(root, lines, now)
      later(TICK_MS)
    }
  }

  private fun readPage(root: AccessibilityNodeInfo, lines: List<TextLine>) {
    ReaderSession.step = "reading"
    ReaderSession.addPage(lines)
    var fresh = 0
    for (line in lines) {
      val item = ITEM.matchEntire(line.text)?.groupValues?.get(1) ?: continue
      if (seenItems.add(item)) fresh += 1
    }
    stalePages = if (fresh == 0) stalePages + 1 else 0
    if (fresh > 0) ReaderSession.progress(System.currentTimeMillis())

    if (stalePages >= STALE_PAGES_TO_STOP || ReaderSession.pageCount() >= MAX_PAGES) {
      finish()
      return
    }
    val list = largestScrollable(root)
    if (list == null) {
      finish()
      return
    }
    // Swipe most of a screen, leaving an overlap so every line is whole on at least one page;
    // a full-page scroll (ACTION_SCROLL_FORWARD) can skip the lines at the page break.
    if (!swipeUp(list)) {
      if (!list.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) {
        // Can't scroll any further: this was the last page.
        finish()
        return
      }
      afterScroll()
    }
  }

  /** Reads the next page as soon as the list stops changing, instead of a fixed wait. */
  private fun afterScroll() {
    val start = System.currentTimeMillis()
    fun check() {
      if (runId != ReaderSession.runId) return
      val now = System.currentTimeMillis()
      if (now - lastEventAt >= QUIET_MS || now - start >= MAX_SETTLE_MS) tick()
      else handler.postDelayed({ check() }, POLL_MS)
    }
    handler.postDelayed({ check() }, POLL_MS)
  }

  /**
   * Drags the list up by most of its height, then holds still so it doesn't fling. Schedules the
   * next tick when the gesture ends. False if the gesture couldn't be sent.
   */
  private fun swipeUp(list: AccessibilityNodeInfo): Boolean {
    val bounds = Rect()
    list.getBoundsInScreen(bounds)
    if (bounds.height() < MIN_SWIPE_HEIGHT) return false
    // Right of the product photos, on the offer text.
    val x = bounds.left + bounds.width() * 0.7f
    val from = bounds.top + bounds.height() * SWIPE_FROM
    val to = bounds.top + bounds.height() * SWIPE_TO
    val drag = Path().apply {
      moveTo(x, from)
      lineTo(x, to)
    }
    val hold = Path().apply {
      moveTo(x, to)
      lineTo(x, to + 1f)
    }
    val dragStroke = GestureDescription.StrokeDescription(drag, 0, SWIPE_MS, true)
    val holdStroke = dragStroke.continueStroke(hold, 0, HOLD_MS, false)
    val gesture = GestureDescription.Builder().addStroke(dragStroke).build()
    val run = runId
    val sent =
      dispatchGesture(
        gesture,
        object : GestureResultCallback() {
          override fun onCompleted(description: GestureDescription?) {
            if (run != runId) return
            val release = GestureDescription.Builder().addStroke(holdStroke).build()
            dispatchGesture(release, null, handler)
            handler.postDelayed({ afterScroll() }, HOLD_MS)
          }

          override fun onCancelled(description: GestureDescription?) {
            if (run == runId) afterScroll()
          }
        },
        handler,
      )
    return sent
  }

  /** Taps Warehouse, then Warehouse Savings, the way the owner would. */
  private fun navigate(root: AccessibilityNodeInfo, lines: List<TextLine>, now: Long) {
    // The savings screen is open but its list is still loading.
    if (lines.any { VIEWED_ON.containsMatchIn(it.text) }) return
    if (now - lastClickAt < CLICK_GAP_MS) return
    val target =
      if (clicks < MAX_CLICKS) clickable(root, "Warehouse Savings") ?: clickable(root, "Warehouse")
      else null
    if (target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
      clicks += 1
      lastClickAt = now
    } else if (!hinted) {
      hinted = true
      Toast.makeText(this, "Open Warehouse → Warehouse Savings", Toast.LENGTH_LONG).show()
    }
  }

  private fun finish() {
    ReaderSession.finish()
    stop()
  }

  private fun stop() {
    ticking = false
    handler.removeCallbacksAndMessages(null)
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    startActivity(intent)
  }

  private fun later(delayMs: Long) {
    handler.postDelayed({ tick() }, delayMs)
  }

  companion object {
    private const val FIRST_TICK_MS = 800L
    private const val TICK_MS = 900L
    private const val CLICK_GAP_MS = 2_000L
    private const val MAX_CLICKS = 6
    private const val MAX_PAGES = 400
    private const val STALE_PAGES_TO_STOP = 2
    // Drag from 88% to 18% of the list: 70% of a screen per step, 30% overlap.
    private const val SWIPE_FROM = 0.88f
    private const val SWIPE_TO = 0.18f
    private const val SWIPE_MS = 300L
    private const val HOLD_MS = 100L
    // The list has settled when no change has been reported for this long.
    private const val QUIET_MS = 150L
    private const val MAX_SETTLE_MS = 1_000L
    private const val POLL_MS = 50L
    private const val MIN_SWIPE_HEIGHT = 200
    private const val MAX_NODES = 3_000

    private val ITEM = Regex("""^item\s*#?\s*(\d{3,9})$""", RegexOption.IGNORE_CASE)
    private val VALID = Regex("""valid\s*through""", RegexOption.IGNORE_CASE)
    private val VIEWED_ON = Regex("""viewed\s*on""", RegexOption.IGNORE_CASE)

    private fun isSavingsList(lines: List<TextLine>): Boolean =
      lines.any { ITEM.matches(it.text) } && lines.any { VALID.containsMatchIn(it.text) }

    /** Every visible piece of text with its position on screen. */
    private fun collect(root: AccessibilityNodeInfo): List<TextLine> {
      val out = mutableListOf<TextLine>()
      val stack = ArrayDeque<AccessibilityNodeInfo>()
      stack.addLast(root)
      var visited = 0
      val bounds = Rect()
      while (stack.isNotEmpty() && visited < MAX_NODES) {
        val node = stack.removeLast()
        visited += 1
        for (i in node.childCount - 1 downTo 0) node.getChild(i)?.let { stack.addLast(it) }
        if (!node.isVisibleToUser) continue
        // A container's description often repeats its children's text, so only leaves use it.
        val text =
          node.text?.toString()
            ?: if (node.childCount == 0) node.contentDescription?.toString() else null
        val trimmed = text?.replace(Regex("\\s+"), " ")?.trim()
        if (trimmed.isNullOrEmpty()) continue
        node.getBoundsInScreen(bounds)
        if (bounds.isEmpty) continue
        out.add(TextLine(trimmed, bounds.left, bounds.top, bounds.right, bounds.bottom))
      }
      return out
    }

    private fun largestScrollable(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
      var best: AccessibilityNodeInfo? = null
      var bestArea = 0
      val stack = ArrayDeque<AccessibilityNodeInfo>()
      stack.addLast(root)
      var visited = 0
      val bounds = Rect()
      while (stack.isNotEmpty() && visited < MAX_NODES) {
        val node = stack.removeLast()
        visited += 1
        for (i in 0 until node.childCount) node.getChild(i)?.let { stack.addLast(it) }
        if (!node.isScrollable || !node.isVisibleToUser) continue
        node.getBoundsInScreen(bounds)
        val area = bounds.width() * bounds.height()
        if (area > bestArea) {
          best = node
          bestArea = area
        }
      }
      return best
    }

    /** A tappable element whose own text is exactly [label], or its tappable parent. */
    private fun clickable(root: AccessibilityNodeInfo, label: String): AccessibilityNodeInfo? {
      for (node in root.findAccessibilityNodeInfosByText(label)) {
        val text = (node.text ?: node.contentDescription)?.toString()?.trim() ?: continue
        if (!text.equals(label, ignoreCase = true) || !node.isVisibleToUser) continue
        var candidate: AccessibilityNodeInfo? = node
        var depth = 0
        while (candidate != null && depth <= 2) {
          if (candidate.isClickable && candidate.isEnabled) return candidate
          candidate = candidate.parent
          depth += 1
        }
      }
      return null
    }
  }
}
