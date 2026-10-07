package com.littlechefpizza.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    /**
     * Creates the "lcp_orders" notification channel used by FCM.
     * Must be called before any notification is shown (Android 8+).
     * The custom sound file must be placed at:
     *   app/android/app/src/main/res/raw/notification.mp3
     *
     * Steps for you to do:
     *   1. Download your custom sound file (MP3 or OGG format).
     *   2. Rename it to "notification.mp3"
     *   3. Place it in:  app/android/app/src/main/res/raw/notification.mp3
     *      (create the "raw" folder inside "res" if it doesn't exist)
     *   4. Rebuild the APK.
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "Order Notifications";
            String description = "Little Chef Pizza order updates and new orders";
            int importance = NotificationManager.IMPORTANCE_HIGH;

            NotificationChannel channel = new NotificationChannel(
                "lcp_orders",
                name,
                importance
            );
            channel.setDescription(description);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 300, 150, 300});

            // Custom sound setup
            // If you placed your sound at res/raw/notification.mp3, this will use it.
            // If the file doesn't exist yet, Android will use the default sound.
            try {
                Uri soundUri = Uri.parse(
                    "android.resource://" + getPackageName() + "/raw/notification"
                );
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build();
                channel.setSound(soundUri, audioAttributes);
            } catch (Exception e) {
                // Fallback to default sound if custom file missing
            }

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}

