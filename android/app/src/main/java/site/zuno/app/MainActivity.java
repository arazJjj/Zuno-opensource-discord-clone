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
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends Activity {
    private static final int FILE_REQ = 7;
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
        SwipeRefreshLayout swipe = new SwipeRefreshLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#313338"));
        swipe.addView(web);
        swipe.setOnRefreshListener(() -> { web.reload(); swipe.setRefreshing(false); });
        swipe.setOnChildScrollUpCallback((p, c) -> web.getScrollY() > 0 || true); // chat scrolls inside the page, so pull-to-refresh stays off
        root.addView(swipe);
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
        s.setUserAgentString(s.getUserAgentString() + " ZunoAndroid/1.0");
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
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT); i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*"); i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(Intent.createChooser(i, "Choose files"), FILE_REQ); } catch (Exception e) { fileCallback = null; return false; }
                return true;
            }
        });
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
    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
