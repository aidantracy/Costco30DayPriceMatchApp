package dev.pricematchtracker.costcosavings

internal const val COSTCO_PACKAGE = "com.costco.app.android"

/** One piece of text on the Costco app's screen and where it is, in screen pixels. */
internal data class TextLine(
  val text: String,
  val left: Int,
  val top: Int,
  val right: Int,
  val bottom: Int,
)

/**
 * The current reading, shared by the module (which starts it and reports it to JavaScript)
 * and the accessibility service (which does it). Both run in the app's process.
 */
internal object ReaderSession {
  enum class State(val js: String) {
    IDLE("idle"),
    RUNNING("running"),
    DONE("done"),
    FAILED("failed"),
    CANCELLED("cancelled"),
  }

  /** A reading stops on its own when it finds nothing new for this long... */
  const val IDLE_TIMEOUT_MS = 90 * 1000L

  /** ...or after this long in all, so the service can't be left active. */
  const val MAX_MS = 8 * 60 * 1000L

  @Volatile var state = State.IDLE
    private set

  @Volatile var step = ""

  @Volatile var error = ""
    private set

  /** Changes with every reading, so the service knows to start fresh. */
  @Volatile var runId = 0
    private set

  @Volatile private var startedAt = 0L

  @Volatile private var progressAt = 0L

  private val pages = mutableListOf<List<TextLine>>()

  @Synchronized
  fun begin(now: Long) {
    pages.clear()
    error = ""
    step = "opening"
    startedAt = now
    progressAt = now
    runId += 1
    state = State.RUNNING
  }

  fun isActive(now: Long): Boolean =
    state == State.RUNNING && now - progressAt < IDLE_TIMEOUT_MS && now - startedAt < MAX_MS

  /** New offers were read: keep going. */
  fun progress(now: Long) {
    progressAt = now
  }

  @Synchronized
  fun addPage(page: List<TextLine>) {
    if (state == State.RUNNING) pages.add(page)
  }

  @Synchronized
  fun pageCount(): Int = pages.size

  @Synchronized
  fun finish() {
    if (state == State.RUNNING) state = State.DONE
  }

  @Synchronized
  fun fail(message: String) {
    if (state == State.RUNNING) {
      error = message
      state = State.FAILED
    }
  }

  @Synchronized
  fun cancel() {
    if (state == State.RUNNING) state = State.CANCELLED
  }

  @Synchronized
  fun reset() {
    pages.clear()
    error = ""
    step = ""
    state = State.IDLE
  }

  /** What JavaScript sees. No nulls: every value is a string, number or list. */
  @Synchronized
  fun snapshot(): Map<String, Any> =
    mapOf(
      "state" to state.js,
      "step" to step,
      "error" to error,
      "pages" to
        pages.map { page ->
          page.map { line ->
            mapOf(
              "text" to line.text,
              "left" to line.left,
              "top" to line.top,
              "right" to line.right,
              "bottom" to line.bottom,
            )
          }
        },
    )
}
