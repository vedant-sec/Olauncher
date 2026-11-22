package app.olauncher.helper

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.ContentValues
import android.graphics.Color
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.View
import androidx.webkit.WebViewAssetLoader
import app.olauncher.BuildConfig
import app.olauncher.listener.DeviceAdmin

// Full-screen WebView that hosts the "Progress Mirror" web app, served from the app's assets
// through WebViewAssetLoader under the https://appassets.androidplatform.net/assets/ domain.
class ProgressMirrorWebView(context: Context) {

    val webView: WebView = WebView(context)

    init {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean = !isMirrorUrl(request.url)
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: WebChromeClient.FileChooserParams,
            ): Boolean = true
        }

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportMultipleWindows(false)
        settings.setSupportZoom(false)
        settings.setBuiltInZoomControls(false)
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.setTextZoom(100)

        // The web app renders a text input; let it receive IME focus
        webView.setFocusable(true)
        webView.setFocusableInTouchMode(true)
        webView.requestFocus()

        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.setBackgroundColor(Color.BLACK)

        // Render with hardware layers when available
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        webView.addJavascriptInterface(ProgressMirrorWebBridge(context), "AndroidBridge")
        webView.addJavascriptInterface(SleepBridge(webView.context), "SleepBridge")

        webView.loadUrl("https://appassets.androidplatform.net/assets/mirror/index.html?launcher=1")
    }

    private class SleepBridge(private val context: Context) {
        @JavascriptInterface
        fun onSleep() {
            if (BuildConfig.DEBUG) android.util.Log.d("PMWeb", "onSleep()")
            val activity = context as? android.app.Activity ?: return
            activity.runOnUiThread {
                try {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? android.view.accessibility.AccessibilityManager
                        val isEnabled = am?.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK)?.any {
                            it.resolveInfo.serviceInfo.name == app.olauncher.helper.MyAccessibilityService::class.java.name
                        } == true
                        if (BuildConfig.DEBUG) android.util.Log.d("PMWeb", "accessibility enabled=$isEnabled")
                        if (!isEnabled) {
                            if (BuildConfig.DEBUG) android.util.Log.w("PMWeb", "accessibility not enabled")
                            // Open accessibility settings
                            val intent = android.content.Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)
                            activity.startActivity(intent)
                            return@runOnUiThread
                        }
                        val lockView = activity.findViewById<View>(app.olauncher.R.id.lock)
                        if (lockView != null) {
                            lockView.performClick()
                            if (BuildConfig.DEBUG) android.util.Log.d("PMWeb", "lock view clicked")
                        } else {
                            if (BuildConfig.DEBUG) android.util.Log.w("PMWeb", "lock view not found")
                        }
                    } else {
                        val deviceManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
                        if (deviceManager == null) return@runOnUiThread
                        val component = DeviceAdmin.componentFor(context)
                        if (deviceManager.activeAdmins?.contains(component) == true) {
                            deviceManager.lockNow()
                            if (BuildConfig.DEBUG) android.util.Log.d("PMWeb", "lockNow OK")
                        } else {
                            if (BuildConfig.DEBUG) android.util.Log.w("PMWeb", "not device admin")
                        }
                    }
                } catch (e: Exception) {
                    if (BuildConfig.DEBUG) android.util.Log.e("PMWeb", "lock failed", e)
                    e.printStackTrace()
                }
            }
        }

        @JavascriptInterface
        fun isDeviceAdmin(): Boolean {
            val deviceManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            val component = DeviceAdmin.componentFor(context)
            return deviceManager?.activeAdmins?.contains(component) == true
        }
    }

    private fun isMirrorUrl(uri: Uri): Boolean = uri.toString().startsWith(MIRROR_URL)

    companion object {
        private const val MIRROR_URL = "https://appassets.androidplatform.net/assets/"
    }
}

// JS interface exposed to the web app as window.AndroidBridge
private class ProgressMirrorWebBridge(private val context: Context) {

    @JavascriptInterface
    fun saveFile(filename: String?, mimeType: String?, base64Content: String?): Boolean {
        if (filename.isNullOrBlank() || base64Content.isNullOrBlank()) return false
        val bytes = android.util.Base64.decode(base64Content, android.util.Base64.DEFAULT)
        val uri = createDocumentUri(filename) ?: return false
        return try {
            context.contentResolver.openOutputStream(uri).use { stream -> stream?.write(bytes) }
            context.showToast("Progress Mirror: saved to device storage")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    private fun createDocumentUri(filename: String?): Uri? {
        val values = ContentValues().apply {
            put("display_name", filename?.takeIf { it.isNotBlank() } ?: "progress_mirror_export")
        }
        return try {
            context.contentResolver.insert(
                android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                values
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
