package com.a2z.billing;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int DEFAULT_SYSTEM_BAR_BG = Color.parseColor("#0F2D2E");
    private static final String PREFS_NAME = "a2z_system_bars";
    private static final String KEY_BAR_COLOR = "bar_color";
    private static final String KEY_LIGHT_BG = "light_bg";

    private int currentBarColor = DEFAULT_SYSTEM_BAR_BG;
    private boolean currentLightBackground = false;

    public class SystemBarsBridge {
        @JavascriptInterface
        public void setSystemBars(final String hexColor, final boolean isLightBackground) {
            runOnUiThread(() -> {
                try {
                    int parsedColor = Color.parseColor(hexColor);
                    updateSystemBars(parsedColor, isLightBackground);
                    try {
                        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                        prefs.edit()
                            .putString(KEY_BAR_COLOR, hexColor)
                            .putBoolean(KEY_LIGHT_BG, isLightBackground)
                            .apply();
                    } catch (Exception ignored) {}
                } catch (Exception e) {
                    // Ignore parse error
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Call super.onCreate first so BridgeActivity switches from splash theme to NoActionBar
        // before DecorView is created.
        super.onCreate(savedInstanceState);

        // Switch app theme resource so windowBackground matches our dark status/nav bar strip.
        setTheme(R.style.AppTheme_NoActionBar);

        // Restore saved role-based system bar appearance if previously persisted
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String savedColorHex = prefs.getString(KEY_BAR_COLOR, "#0F2D2E");
            boolean savedLightBg = prefs.getBoolean(KEY_LIGHT_BG, false);
            currentBarColor = Color.parseColor(savedColorHex);
            currentLightBackground = savedLightBg;
        } catch (Exception e) {
            currentBarColor = DEFAULT_SYSTEM_BAR_BG;
            currentLightBackground = false;
        }

        applySystemBarAppearance();

        // Expose AndroidSystemBars to the WebView for dynamic role-based theme transitions
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.addJavascriptInterface(new SystemBarsBridge(), "AndroidSystemBars");
            }
        } catch (Exception ignored) {}

        // Single authoritative native inset strategy on the activity content root.
        // The WebView is laid out strictly inside system bars, display cutouts, and soft keyboard,
        // and those insets are consumed so WebView does not receive duplicate safe-area insets.
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
                boolean imeVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
                int bottomInset = imeVisible ? Math.max(systemBars.bottom, ime.bottom) : systemBars.bottom;

                v.setPadding(systemBars.left, systemBars.top, systemBars.right, bottomInset);

                return new WindowInsetsCompat.Builder(windowInsets)
                    .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.NONE)
                    .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .setVisible(WindowInsetsCompat.Type.ime(), false)
                    .build();
            });
            ViewCompat.requestApplyInsets(contentView);
        }
    }

    public void updateSystemBars(int color, boolean isLightBackground) {
        this.currentBarColor = color;
        this.currentLightBackground = isLightBackground;
        applySystemBarAppearance();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarAppearance();
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.requestApplyInsets(contentView);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBarAppearance();
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.requestApplyInsets(contentView);
        }
    }

    private void applySystemBarAppearance() {
        // Set the window background drawable to currentBarColor so the insets area matches
        getWindow().setBackgroundDrawable(new ColorDrawable(currentBarColor));

        View decorView = getWindow().getDecorView();
        decorView.setBackgroundColor(currentBarColor);

        // Ensure flags allow custom system bar coloring
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        // Explicit status and nav bar colors
        getWindow().setStatusBarColor(currentBarColor);
        getWindow().setNavigationBarColor(currentBarColor);

        // Update EdgeToEdge with currentBarColor as the scrim
        EdgeToEdge.enable(
            this,
            currentLightBackground ? SystemBarStyle.light(currentBarColor, currentBarColor) : SystemBarStyle.dark(currentBarColor),
            currentLightBackground ? SystemBarStyle.light(currentBarColor, currentBarColor) : SystemBarStyle.dark(currentBarColor)
        );

        // Update light/dark status bar and navigation bar icon appearance
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decorView);
        if (controller != null) {
            controller.setAppearanceLightStatusBars(currentLightBackground);
            controller.setAppearanceLightNavigationBars(currentLightBackground);
        }
    }
}
