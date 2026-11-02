package com.copex.studio;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.text.InputType;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.webkit.CookieManager;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.util.*;
import org.json.JSONObject;

public class MainActivity extends Activity {

  private static final HashMap<String, String> sessionAuth = new HashMap<>();

  private static final int PICK_FILES = 31,
    SAVE_FILE = 32;
  private static final int BG = Color.rgb(23, 30, 20),
    ACCENT = Color.rgb(217, 244, 115);
  private View fullScreenVideo;
  private WebChromeClient.CustomViewCallback fullScreenCallback;
  private WebView web;
  private LinearLayout root;
  private ProgressBar progress;
  private String origin = "",
    authorization = "";
  private volatile boolean trusted = false;
  private ValueCallback<Uri[]> upload;
  private final HashMap<String, PendingFile> files = new HashMap<>();
  private volatile PendingFile saving;
  private final DownloadBridge bridge = new DownloadBridge();
  private final Handler ui = new Handler(Looper.getMainLooper());

  private static class PendingFile {

    File file;
    OutputStream stream;
    String name, mime;
    long size, written;
  }

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow()
      .getDecorView()
      .setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
          View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
          View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      );
    String stored = getPreferences(0).getString("server", "");
    if (stored.isEmpty()) showConnection(null);
    else {
      try {
        showStudio(ServerAddress.normalize(stored));
      } catch (Exception e) {
        showConnection(null);
      }
    }
  }

  private int dp(int n) {
    return Math.round(n * getResources().getDisplayMetrics().density);
  }

  private TextView text(String value, int size) {
    TextView t = new TextView(this);
    t.setText(value);
    t.setTextSize(size);
    t.setTextColor(Color.rgb(239, 241, 228));
    return t;
  }

  private Button button(String title) {
    Button b = new Button(this);
    b.setText(title);
    b.setTextColor(BG);
    b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(ACCENT));
    b.setAllCaps(false);
    return b;
  }

  private void frame() {
    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(BG);
    root.setOnApplyWindowInsetsListener((v, insets) -> {
      v.setPadding(
        0,
        insets.getSystemWindowInsetTop(),
        0,
        insets.getSystemWindowInsetBottom()
      );
      return insets.consumeSystemWindowInsets();
    });
    setContentView(root);
    root.requestApplyInsets();
  }

  private void showConnection(String error) {
    exitFullScreen();
    trusted = false;
    if (web != null) {
      web.stopLoading();
      web.removeJavascriptInterface("CopexFiles");
      web.destroy();
      web = null;
    }
    frame();
    ScrollView scroll = new ScrollView(this);
    LinearLayout content = new LinearLayout(this);
    content.setPadding(dp(24), dp(28), dp(24), dp(24));
    content.setOrientation(1);
    scroll.addView(content);
    root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
    content.addView(text("COPEX / SEU ESTÚDIO", 13));
    TextView title = text("Crie onde estiver.", 32);
    title.setPadding(0, dp(20), 0, dp(16));
    content.addView(title);
    content.addView(
      text(
        "Conecte o aplicativo ao seu Copex. O mesmo estúdio, arquivos e ferramentas ficam disponíveis no PC e no celular.",
        17
      )
    );
    TextView label = text("Endereço do Copex", 15);
    label.setPadding(0, dp(28), 0, dp(8));
    content.addView(label);
    EditText address = new EditText(this);
    address.setSingleLine(true);
    address.setTextColor(Color.WHITE);
    address.setHintTextColor(Color.LTGRAY);
    address.setInputType(
      InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI
    );
    address.setHint("https://seu-copex.com ou IP do PC");
    address.setText(getPreferences(0).getString("server", ""));
    address.setContentDescription("Endereço do Copex");
    content.addView(address);
    TextView help = text(
      "Online: use o endereço HTTPS da sua hospedagem.\nNa rede local: PC ligado, mesmo Wi-Fi e porta 3001 acessível. localhost é o próprio celular.",
      14
    );
    help.setPadding(0, dp(14), 0, dp(20));
    content.addView(help);
    TextView status = text(error == null ? "" : error, 15);
    status.setTextColor(error == null ? ACCENT : Color.rgb(255, 174, 150));
    content.addView(status);
    Button connect = button("Abrir meu estúdio");
    content.addView(connect);
    connect.setOnClickListener(v -> {
      final String target;
      try {
        target = ServerAddress.normalize(address.getText().toString());
      } catch (Exception e) {
        status.setText(e.getMessage());
        return;
      }
      connect.setEnabled(false);
      status.setText("Conectando…");
      new Thread(() -> {
        String failure = null;
        try {
          ServerProbe.check(target);
        } catch (Exception e) {
          failure =
            "Não consegui acessar esse Copex. Confira o endereço, internet/Wi-Fi e se o servidor está ligado. Detalhe: " +
            e.getMessage();
        }
        final String message = failure;
        ui.post(() -> {
          if (isFinishing() || isDestroyed()) return;
          if (message != null) {
            connect.setEnabled(true);
            status.setText(message);
          } else {
            getPreferences(0).edit().putString("server", target).apply();
            authorization = "";
            showStudio(target);
          }
        });
      }).start();
    });
  }

  @SuppressWarnings("SetJavaScriptEnabled")
  private void showStudio(String target) {
    origin = target;
    authorization = sessionAuth.getOrDefault(target, "");
    frame();
    LinearLayout toolbar = new LinearLayout(this);
    toolbar.setGravity(Gravity.CENTER_VERTICAL);
    root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(52)));
    Button back = button("‹");
    back.setContentDescription("Voltar");
    toolbar.addView(back, new LinearLayout.LayoutParams(dp(52), dp(44)));
    TextView brand = text("copex studio", 17);
    brand.setPadding(dp(10), 0, 0, 0);
    toolbar.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
    Button reload = button("↻");
    reload.setContentDescription("Recarregar");
    toolbar.addView(reload, new LinearLayout.LayoutParams(dp(52), dp(44)));
    Button connection = button("⋯");
    connection.setContentDescription("Conexão e ajuda");
    toolbar.addView(connection, new LinearLayout.LayoutParams(dp(52), dp(44)));
    progress = new ProgressBar(
      this,
      null,
      android.R.attr.progressBarStyleHorizontal
    );
    root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
    web = new WebView(this);
    web.setBackgroundColor(BG);
    root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setUseWideViewPort(true);
    settings.setLoadWithOverviewMode(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setMediaPlaybackRequiresUserGesture(true);
    settings.setBuiltInZoomControls(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setUserAgentString(
      settings.getUserAgentString() + " CopexAndroid/3.1.0"
    );
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
    web.addJavascriptInterface(bridge, "CopexFiles");
    web.setWebViewClient(
      new WebViewClient() {
        @Override
        public void onPageStarted(
          WebView view,
          String url,
          android.graphics.Bitmap icon
        ) {
          trusted = ServerAddress.sameOrigin(origin, url);
          progress.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
          trusted = ServerAddress.sameOrigin(origin, url);
          progress.setVisibility(View.GONE);
          CookieManager.getInstance().flush();
          if (trusted) injectDownloads();
        }

        @Override
        public boolean shouldOverrideUrlLoading(
          WebView view,
          WebResourceRequest req
        ) {
          String url = req.getUrl().toString();
          if (ServerAddress.sameOrigin(origin, url)) return false;
          if (!req.isForMainFrame()) return true;
          openExternal(url);
          return true;
        }

        @Override
        public void onReceivedError(
          WebView view,
          WebResourceRequest req,
          WebResourceError err
        ) {
          if (req.isForMainFrame()) connectionError();
        }

        @Override
        public void onReceivedHttpError(
          WebView view,
          WebResourceRequest req,
          WebResourceResponse response
        ) {
          if (
            req.isForMainFrame() && response.getStatusCode() >= 500
          ) connectionError();
        }

        @Override
        public void onReceivedHttpAuthRequest(
          WebView view,
          HttpAuthHandler handler,
          String host,
          String realm
        ) {
          if (!host.equalsIgnoreCase(Uri.parse(origin).getHost())) {
            handler.cancel();
            return;
          }
          LinearLayout form = new LinearLayout(MainActivity.this);
          form.setOrientation(1);
          form.setPadding(dp(20), 0, dp(20), 0);
          EditText user = new EditText(MainActivity.this),
            pass = new EditText(MainActivity.this);
          user.setHint("Usuário do servidor");
          user.setText("copex");
          user.setSelectAllOnFocus(true);
          pass.setHint("Senha do Copex");
          pass.setInputType(
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
          );
          form.addView(user);
          form.addView(pass);
          CheckBox showPassword = new CheckBox(MainActivity.this);
          showPassword.setText("Mostrar senha");
          showPassword.setOnCheckedChangeListener((button, checked) -> {
            pass.setTransformationMethod(
              checked
                ? null
                : android.text.method.PasswordTransformationMethod.getInstance()
            );
            pass.setSelection(pass.getText().length());
          });
          form.addView(showPassword);
          new AlertDialog.Builder(MainActivity.this)
            .setTitle("Acesso ao seu servidor")
            .setView(form)
            .setPositiveButton("Entrar", (d, w) -> {
              String u = user.getText().toString(),
                p = pass.getText().toString();
              authorization =
                "Basic " +
                Base64.encodeToString(
                  (u + ":" + p).getBytes(
                    java.nio.charset.StandardCharsets.UTF_8
                  ),
                  Base64.NO_WRAP
                );
              if (view != web) {
                handler.cancel();
                return;
              }
              sessionAuth.put(origin, authorization);
              handler.proceed(u, p);
            })
            .setNegativeButton("Cancelar", (d, w) -> handler.cancel())
            .setOnCancelListener(d -> handler.cancel())
            .show();
        }
      }
    );
    web.setWebChromeClient(
      new WebChromeClient() {
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
          if (fullScreenVideo != null) {
            callback.onCustomViewHidden();
            return;
          }
          fullScreenVideo = view;
          fullScreenCallback = callback;
          root.setVisibility(View.GONE);
          ((FrameLayout) getWindow().getDecorView()).addView(
            view,
            new FrameLayout.LayoutParams(-1, -1)
          );
          getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        @Override
        public void onHideCustomView() {
          exitFullScreen();
        }

        @Override
        public void onProgressChanged(WebView view, int value) {
          progress.setProgress(value);
        }

        @Override
        public boolean onShowFileChooser(
          WebView view,
          ValueCallback<Uri[]> callback,
          FileChooserParams params
        ) {
          if (upload != null) upload.onReceiveValue(null);
          upload = callback;
          Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.setType("*/*");
          intent.putExtra(
            Intent.EXTRA_ALLOW_MULTIPLE,
            params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE
          );
          intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
          try {
            startActivityForResult(intent, PICK_FILES);
          } catch (Exception e) {
            upload.onReceiveValue(null);
            upload = null;
            toast("Nenhum seletor de arquivos disponível.");
          }
          return true;
        }

        @Override
        public boolean onJsAlert(
          WebView view,
          String url,
          String message,
          JsResult result
        ) {
          new AlertDialog.Builder(MainActivity.this)
            .setMessage(message)
            .setPositiveButton("OK", (d, w) -> result.confirm())
            .setOnCancelListener(d -> result.cancel())
            .show();
          return true;
        }
      }
    );
    web.setDownloadListener((url, agent, disposition, mime, length) ->
      downloadUrl(url, agent, disposition, mime)
    );
    back.setOnClickListener(v -> goBack());
    reload.setOnClickListener(v -> web.reload());
    connection.setOnClickListener(v ->
      new AlertDialog.Builder(this)
        .setTitle("Seu Copex")
        .setMessage(
          origin +
            "\n\nAs ferramentas e arquivos são os mesmos do servidor. Para uso online, mantenha a hospedagem ativa. Na rede local, mantenha o PC ligado."
        )
        .setPositiveButton("Trocar endereço", (d, w) -> showConnection(null))
        .setNegativeButton("Continuar", null)
        .show()
    );
    web.loadUrl(origin);
  }

  private void injectDownloads() {
    try {
      InputStream in = getAssets().open("downloads.js");
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] b = new byte[4096];
      int n;
      while ((n = in.read(b)) != -1) out.write(b, 0, n);
      in.close();
      web.evaluateJavascript(out.toString("UTF-8"), null);
    } catch (Exception e) {
      toast("Não foi possível preparar os downloads. Reabra o aplicativo.");
    }
  }

  private void openExternal(String url) {
    if (!url.startsWith("https://") && !url.startsWith("http://")) return;
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    } catch (Exception e) {
      toast("Nenhum navegador disponível.");
    }
  }

  private void connectionError() {
    trusted = false;
    ui.post(() -> {
      if (isFinishing() || isDestroyed()) return;
      new AlertDialog.Builder(this)
        .setTitle("Conexão interrompida")
        .setMessage(
          "Confira a conexão e se o servidor Copex continua ligado. Seu trabalho salvo permanece no servidor."
        )
        .setPositiveButton("Tentar novamente", (d, w) -> web.loadUrl(origin))
        .setNegativeButton("Trocar endereço", (d, w) -> showConnection(null))
        .show();
    });
  }

  private void toast(String s) {
    ui.post(() -> Toast.makeText(this, s, Toast.LENGTH_LONG).show());
  }

  private static String safeName(String s) {
    String name = (s == null ? "copex-download" : s).replaceAll(
      "[\\\\/:*?\"<>|\\p{Cntrl}]",
      "_"
    );
    if (name.length() > 160) name = name.substring(name.length() - 160);
    return name.isEmpty() ? "copex-download" : name;
  }

  private void downloadUrl(
    String url,
    String agent,
    String disposition,
    String mime
  ) {
    if (url.startsWith("blob:")) {
      toast("Toque novamente em baixar. Se persistir, recarregue o estúdio.");
      return;
    }
    if (!ServerAddress.sameOrigin(origin, url)) {
      toast("Download de outra origem não autorizado.");
      return;
    }
    try {
      DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
      r.setTitle(safeName(URLUtil.guessFileName(url, disposition, mime)));
      r.setNotificationVisibility(
        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
      );
      r.setDestinationInExternalPublicDir(
        Environment.DIRECTORY_DOWNLOADS,
        System.currentTimeMillis() +
          "-" +
          safeName(URLUtil.guessFileName(url, disposition, mime))
      );
      if (mime != null) r.setMimeType(mime);
      String cookie = CookieManager.getInstance().getCookie(url);
      if (cookie != null) r.addRequestHeader("Cookie", cookie);
      if (!authorization.isEmpty()) r.addRequestHeader(
        "Authorization",
        authorization
      );
      if (agent != null) r.addRequestHeader("User-Agent", agent);
      ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
      toast("Download iniciado. Veja em Downloads do Android.");
    } catch (Exception e) {
      toast("Não foi possível iniciar o download: " + e.getMessage());
    }
  }

  public class DownloadBridge {

    @JavascriptInterface
    public synchronized String begin(String name, String mime, long size) {
      if (!trusted || size < 0) return "";
      try {
        if (files.size() >= 2 || saving != null) throw new IOException(
          "Conclua o salvamento anterior."
        );
        if (
          size > getCacheDir().getUsableSpace() - 16 * 1024 * 1024
        ) throw new IOException("Espaço insuficiente no celular.");
        String id = UUID.randomUUID().toString();
        PendingFile p = new PendingFile();
        p.file = new File(getCacheDir(), "download-" + id);
        p.stream = new FileOutputStream(p.file);
        p.name = safeName(name);
        p.mime =
          mime == null || !mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")
            ? "application/octet-stream"
            : mime;
        p.size = size;
        p.written = 0;
        files.put(id, p);
        return id;
      } catch (Exception e) {
        toast(e.getMessage());
        return "";
      }
    }

    @JavascriptInterface
    public synchronized boolean append(String id, String base64) {
      PendingFile p = files.get(id);
      if (
        !trusted || p == null || base64 == null || base64.length() > 500000
      ) return false;
      try {
        byte[] data = Base64.decode(base64, Base64.DEFAULT);
        if (p.written + data.length > p.size) return false;
        p.stream.write(data);
        p.written += data.length;
        return true;
      } catch (Exception e) {
        cancel(id);
        return false;
      }
    }

    @JavascriptInterface
    public synchronized void cancel(String id) {
      PendingFile p = files.remove(id);
      if (p != null) {
        try {
          p.stream.close();
        } catch (Exception ignored) {}
        p.file.delete();
      }
    }

    @JavascriptInterface
    public synchronized boolean finish(String id) {
      PendingFile p = files.remove(id);
      if (p == null) return false;
      try {
        p.stream.close();
        if (!trusted || p.written != p.size) throw new IOException(
          "Download incompleto."
        );
        ui.post(() -> saveFile(p));
        return true;
      } catch (Exception e) {
        p.file.delete();
        toast(e.getMessage());
        return false;
      }
    }
  }

  private void saveFile(PendingFile p) {
    if (isFinishing() || isDestroyed() || saving != null) {
      p.file.delete();
      toast("Conclua o salvamento anterior e tente novamente.");
      return;
    }
    saving = p;
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(p.mime);
    intent.putExtra(Intent.EXTRA_TITLE, p.name);
    try {
      startActivityForResult(intent, SAVE_FILE);
    } catch (Exception e) {
      saving = null;
      p.file.delete();
      toast("Não foi possível abrir o seletor de destino.");
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == PICK_FILES && upload != null) {
      ArrayList<Uri> uris = new ArrayList<>();
      if (result == RESULT_OK && data != null) {
        if (data.getClipData() != null) {
          for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(
            data.getClipData().getItemAt(i).getUri()
          );
        } else if (data.getData() != null) uris.add(data.getData());
      }
      upload.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
      upload = null;
    }
    if (request == SAVE_FILE && saving != null) {
      PendingFile p = saving;
      saving = null;
      if (result != RESULT_OK || data == null || data.getData() == null) {
        p.file.delete();
        toast("Salvamento cancelado.");
        return;
      }
      final Uri destination = data.getData();
      new Thread(() -> {
        try (
          InputStream in = new FileInputStream(p.file);
          OutputStream out = getContentResolver().openOutputStream(
            destination,
            "w"
          )
        ) {
          if (out == null) throw new IOException("Destino indisponível.");
          byte[] b = new byte[65536];
          int n;
          while ((n = in.read(b)) != -1) out.write(b, 0, n);
          toast("Arquivo salvo: " + p.name);
        } catch (Exception e) {
          toast("Não foi possível salvar: " + e.getMessage());
        } finally {
          p.file.delete();
        }
      }).start();
    }
  }

  private void exitFullScreen() {
    if (fullScreenVideo == null) return;
    ((FrameLayout) getWindow().getDecorView()).removeView(fullScreenVideo);
    fullScreenVideo = null;
    root.setVisibility(View.VISIBLE);
    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    if (fullScreenCallback != null) {
      fullScreenCallback.onCustomViewHidden();
      fullScreenCallback = null;
    }
  }

  private void confirmExit() {
    new AlertDialog.Builder(this)
      .setMessage("Sair do Copex?")
      .setPositiveButton("Sair", (d, w) -> finish())
      .setNegativeButton("Continuar", null)
      .show();
  }

  private void goBack() {
    if (fullScreenVideo != null) {
      exitFullScreen();
      return;
    }
    if (web == null) {
      confirmExit();
      return;
    }
    web.evaluateJavascript(
      "(()=>{const close=document.querySelector('.modal-backdrop [aria-label=Fechar]')||document.querySelector('.design-overlay [aria-label=Voltar]');if(close){close.click();return true;}return false;})()",
      handled -> {
        if ("true".equals(handled)) return;
        if (web != null && web.canGoBack()) web.goBack();
        else confirmExit();
      }
    );
  }

  @Override
  public void onBackPressed() {
    goBack();
  }

  @Override
  protected void onDestroy() {
    exitFullScreen();
    trusted = false;
    if (upload != null) {
      upload.onReceiveValue(null);
      upload = null;
    }
    synchronized (bridge) {
      for (PendingFile p : files.values()) {
        try {
          p.stream.close();
        } catch (Exception ignored) {}
        p.file.delete();
      }
      files.clear();
    }
    if (saving != null) saving.file.delete();
    if (web != null) {
      web.removeJavascriptInterface("CopexFiles");
      web.destroy();
      web = null;
    }
    super.onDestroy();
  }
}
