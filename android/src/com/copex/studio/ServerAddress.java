package com.copex.studio;

import java.net.URI;
import java.util.Locale;

public final class ServerAddress {

  private ServerAddress() {}

  public static String normalize(String raw) {
    String value = raw == null ? "" : raw.trim();
    if (!value.contains("://")) value = "http://" + value;
    try {
      URI u = new URI(value);
      String host = u.getHost();
      String scheme = u.getScheme().toLowerCase(Locale.ROOT);
      if (
        host == null ||
        host.isEmpty() ||
        u.getUserInfo() != null ||
        u.getQuery() != null ||
        u.getFragment() != null ||
        !(
          u.getPath() == null ||
          u.getPath().isEmpty() ||
          u.getPath().equals("/")
        ) ||
        u.getPort() == 0 ||
        u.getPort() > 65535
      ) throw new Exception();
      if (
        !scheme.equals("https") && !(scheme.equals("http") && isLocal(host))
      ) throw new Exception();
      int port = u.getPort();
      if (port < 0 && scheme.equals("http")) port = 3001;
      if (port == 443 && scheme.equals("https")) port = -1;
      return new URI(
        scheme,
        null,
        host.toLowerCase(Locale.ROOT),
        port,
        null,
        null,
        null
      ).toASCIIString();
    } catch (Exception e) {
      throw new IllegalArgumentException(
        "Use o endereço HTTPS do Copex online ou o IP local do PC, como 192.168.1.10:3001."
      );
    }
  }

  public static boolean isLocal(String host) {
    if (
      host.equalsIgnoreCase("localhost") ||
      host.equals("[::1]") ||
      host.equals("::1")
    ) return true;
    String[] parts = host.split("\\.");
    if (parts.length != 4) return false;
    int[] n = new int[4];
    try {
      for (int i = 0; i < 4; i++) {
        if (!parts[i].matches("[0-9]{1,3}")) return false;
        n[i] = Integer.parseInt(parts[i]);
        if (n[i] > 255) return false;
      }
    } catch (Exception e) {
      return false;
    }
    return (
      n[0] == 10 ||
      n[0] == 127 ||
      (n[0] == 192 && n[1] == 168) ||
      (n[0] == 172 && n[1] >= 16 && n[1] <= 31)
    );
  }

  public static boolean sameOrigin(String base, String candidate) {
    try {
      URI a = new URI(base),
        b = new URI(candidate);
      return (
        a.getScheme().equalsIgnoreCase(b.getScheme()) &&
        a.getHost().equalsIgnoreCase(b.getHost()) &&
        effectivePort(a) == effectivePort(b)
      );
    } catch (Exception e) {
      return false;
    }
  }

  private static int effectivePort(URI u) {
    return u.getPort() < 0
      ? "https".equalsIgnoreCase(u.getScheme())
        ? 443
        : 80
      : u.getPort();
  }
}
