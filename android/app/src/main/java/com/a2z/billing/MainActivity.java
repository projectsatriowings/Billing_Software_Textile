package com.a2z.billing;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int SYSTEM_BAR_BG = Color.parseColor("#0F2D2E");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Call super.onCreate first so BridgeActivity switches from splash theme to NoActionBar
        // before DecorView is created.
        super.onCreate(savedInstanceState);

        // Switch app theme resource so windowBackground matches our dark status/nav bar strip.
        setTheme(R.style.AppTheme_NoActionBar);

        // Enforce consistent edge-to-edge behavior across Android 7..17 with dark system bar contrast.
        EdgeToEdge.enable(
            this,
            SystemBarStyle.dark(Color.TRANSPARENT),
            SystemBarStyle.dark(Color.TRANSPARENT)
        );

        applySystemBarAppearance();

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
        View decorView = getWindow().getDecorView();
        decorView.setBackgroundColor(SYSTEM_BAR_BG);
        getWindow().setStatusBarColor(SYSTEM_BAR_BG);
        getWindow().setNavigationBarColor(SYSTEM_BAR_BG);

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decorView);
        if (controller != null) {
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
        }
    }
}
