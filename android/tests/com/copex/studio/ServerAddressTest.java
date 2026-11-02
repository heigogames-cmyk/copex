package com.copex.studio;

public final class ServerAddressTest {

  private static void equal(Object expected, Object actual) {
    if (!expected.equals(actual)) throw new AssertionError(
      expected + " != " + actual
    );
  }

  private static void invalid(String address) {
    try {
      ServerAddress.normalize(address);
      throw new AssertionError("Accepted: " + address);
    } catch (IllegalArgumentException expected) {}
  }

  public static void main(String[] args) {
    equal("http://192.168.1.10:3001", ServerAddress.normalize("192.168.1.10"));
    equal(
      "http://10.0.0.8:4000",
      ServerAddress.normalize("http://10.0.0.8:4000/")
    );
    equal(
      "https://copex.example.com",
      ServerAddress.normalize("https://Copex.example.com/")
    );
    equal(
      "https://copex.example.com",
      ServerAddress.normalize("https://copex.example.com:443")
    );
    for (String s : new String[] {
      "http://example.com",
      "https://user:pass@example.com",
      "file:///sdcard/test",
      "https://host:0",
      "https://host:99999",
      "https://host/path",
      "https://host?x=1",
      "https://host#x",
      "http://192.168.1.999",
      "http://172.32.0.1",
      "javascript:alert(1)",
    })
      invalid(s);
    equal(
      true,
      ServerAddress.sameOrigin(
        "https://copex.example.com",
        "https://copex.example.com:443/api/state"
      )
    );
    equal(
      false,
      ServerAddress.sameOrigin(
        "https://copex.example.com",
        "https://copex.example.com.evil.test/api/state"
      )
    );
    equal(
      false,
      ServerAddress.sameOrigin(
        "http://192.168.1.10:3001",
        "http://192.168.1.10:3002/api/state"
      )
    );
    equal(
      false,
      ServerAddress.sameOrigin(
        "https://copex.example.com",
        "http://copex.example.com/api/state"
      )
    );
    System.out.println(
      "Android: endereços, portas, credenciais e isolamento de origem passaram."
    );
  }
}
