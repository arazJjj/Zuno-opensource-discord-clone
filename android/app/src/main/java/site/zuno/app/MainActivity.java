package site.zuno.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.view.Gravity;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final int FILE_REQ = 7;
    private static final int PERM_REQ = 8;
    private PermissionRequest pendingPerm;
    private int notifId = 1;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private TextView offline;
    private final String home = BuildConfig.ZUNO_URL;

    @SuppressLint("SetJavaScriptEnabled")
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#1e1f22"));
        getWindow().setNavigationBarColor(Color.parseColor("#1e1f22"));
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#313338"));
        root.addView(web);
        offline = new TextView(this);
        offline.setText("Zuno is waking up or you're offline.\nTap to retry.");
        offline.setTextColor(Color.WHITE); offline.setGravity(Gravity.CENTER); offline.setTextSize(17);
        offline.setBackgroundColor(Color.parseColor("#1e1f22")); offline.setVisibility(View.GONE);
        offline.setOnClickListener(v -> { offline.setVisibility(View.GONE); web.reload(); });
        root.addView(offline, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " ZunoAndroid/1.1");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl(); Uri h = Uri.parse(home);
                if (u.getHost() != null && u.getHost().equals(h.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, u)); return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) offline.setVisibility(View.VISIBLE);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> {
                    ArrayList<String> need = new ArrayList<>();
                    for (String r : req.getResources()) {
                        if (r.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECORD_AUDIO);
                        if (r.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.CAMERA);
                    }
                    if (need.isEmpty()) { req.grant(req.getResources()); return; }
                    pendingPerm = req; requestPermissions(need.toArray(new String[0]), PERM_REQ);
                });
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT); i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*"); i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(Intent.createChooser(i, "Choose files"), FILE_REQ); } catch (Exception e) { fileCallback = null; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "ZunoAndroid");
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("zuno", "Messages & calls", NotificationManager.IMPORTANCE_HIGH);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 9);
        if (b != null) web.restoreState(b); else web.loadUrl(home);
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req != FILE_REQ || fileCallback == null) { super.onActivityResult(req, res, data); return; }
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount(); out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) out = new Uri[]{ data.getData() };
        }
        fileCallback.onReceiveValue(out); fileCallback = null;
    }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == PERM_REQ && pendingPerm != null) {
            boolean ok = res.length > 0; for (int r : res) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
            if (ok) pendingPerm.grant(pendingPerm.getResources()); else pendingPerm.deny();
            pendingPerm = null;
        }
    }

    class Bridge {
        @JavascriptInterface public void notify(String title, String body) {
            Intent open = new Intent(MainActivity.this, MainActivity.class); open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(MainActivity.this, "zuno") : new Notification.Builder(MainActivity.this);
            nb.setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle(title).setContentText(body).setAutoCancel(true).setContentIntent(pi);
            try { getSystemService(NotificationManager.class).notify(notifId++, nb.build()); } catch (Exception ignored) {}
        }
        @JavascriptInterface public void askNotify() {
            if (Build.VERSION.SDK_INT >= 33) runOnUiThread(() -> requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 9));
        }
    }

    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
