package com.a2z.billing;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Enable Android edge-to-edge rendering using AndroidX API
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        // System bar background color and icon styling (white icons on dark plum bar)
        getWindow().getDecorView().setBackgroundColor(Color.parseColor("#49364A"));

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }

        // Apply window insets to the activity content view so all screens,
        // including the Login Page, start strictly below the status bar
        // and within system navigation and display cutout safe areas.
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                return windowInsets;
            });
            contentView.requestApplyInsets();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            contentView.requestApplyInsets();
        }
    }
}
