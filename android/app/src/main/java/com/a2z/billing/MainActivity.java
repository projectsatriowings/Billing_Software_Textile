package com.a2z.billing;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Configure Android edge-to-edge rendering using supported AndroidX API
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Ensure Android window insets are correctly handled by the Capacitor WebView
        View decorView = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );

            float density = getResources().getDisplayMetrics().density;
            int topDp = Math.round(insets.top / density);
            int bottomDp = Math.round(insets.bottom / density);
            int leftDp = Math.round(insets.left / density);
            int rightDp = Math.round(insets.right / density);

            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                String js = String.format(
                    java.util.Locale.US,
                    "try {" +
                    "  document.documentElement.style.setProperty('--safe-area-inset-top', '%dpx');" +
                    "  document.documentElement.style.setProperty('--safe-area-inset-bottom', '%dpx');" +
                    "  document.documentElement.style.setProperty('--safe-area-inset-left', '%dpx');" +
                    "  document.documentElement.style.setProperty('--safe-area-inset-right', '%dpx');" +
                    "} catch(e) {}",
                    topDp, bottomDp, leftDp, rightDp
                );
                webView.evaluateJavascript(js, null);
            }

            // In edge-to-edge mode with CSS insets handling, avoid duplicate native padding
            v.setPadding(0, 0, 0, 0);

            return windowInsets;
        });

        // Ensure insets are delivered as soon as web page is committed/loaded
        if (getBridge() != null) {
            getBridge().addWebViewListener(new com.getcapacitor.WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    super.onPageLoaded(webView);
                    decorView.requestApplyInsets();
                }
            });
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        View decorView = getWindow().getDecorView();
        decorView.requestApplyInsets();
    }
}
