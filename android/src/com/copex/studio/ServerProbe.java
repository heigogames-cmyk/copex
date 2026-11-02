package com.copex.studio;

import java.io.*;
import java.net.*;
import org.json.JSONObject;

public final class ServerProbe {

  private ServerProbe() {}

  public static void check(String base) throws Exception {
    HttpURLConnection c = (HttpURLConnection) new URL(
      base + "/api/ready"
    ).openConnection();
    c.setConnectTimeout(8000);
    c.setReadTimeout(8000);
    c.setInstanceFollowRedirects(false);
    try {
      int code = c.getResponseCode();
      if (code == 401) return;
      if (code == 404) throw new IOException(
        "Atualize o servidor Copex do PC para a versão 3.1 ou mais recente."
      );
      if (code != 200) throw new IOException("Servidor respondeu " + code);
      ByteArrayOutputStream data = new ByteArrayOutputStream();
      try (InputStream in = c.getInputStream()) {
        byte[] buffer = new byte[4096];
        int n;
        while ((n = in.read(buffer)) != -1) {
          if (data.size() + n > 65536) throw new IOException(
            "Resposta inválida."
          );
          data.write(buffer, 0, n);
        }
      }
      JSONObject health = new JSONObject(data.toString("UTF-8"));
      if (
        !health.optBoolean("ok") ||
        !"copex-studio".equals(health.optString("app"))
      ) throw new IOException("Este endereço não é um servidor Copex.");
      if (health.optInt("androidClient", 0) < 1) throw new IOException(
        "Atualize o servidor Copex para usar todos os recursos do aplicativo."
      );
    } finally {
      c.disconnect();
    }
  }
}
