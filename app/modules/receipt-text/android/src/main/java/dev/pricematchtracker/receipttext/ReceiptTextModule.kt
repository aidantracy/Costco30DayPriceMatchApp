package dev.pricematchtracker.receipttext

import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the text in a receipt screenshot with on-device ML Kit and returns each line with
 * its box, so the parser can rebuild rows that the engine splits into columns.
 */
class ReceiptTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptText")

    // Async functions run off the main thread, so waiting on the ML Kit task here is safe.
    AsyncFunction("recognize") { uri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val image = InputImage.fromFilePath(context, Uri.parse(uri))
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      try {
        val result = Tasks.await(recognizer.process(image))
        result.textBlocks.flatMap { it.lines }.map { line ->
          val box = line.boundingBox
          mapOf(
            "text" to line.text,
            "left" to box?.left,
            "top" to box?.top,
            "right" to box?.right,
            "bottom" to box?.bottom,
          )
        }
      } finally {
        recognizer.close()
      }
    }
  }
}
