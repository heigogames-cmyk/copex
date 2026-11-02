package com.copex.studio;

public final class ServerProbeTest {

  public static void main(String[] args) throws Exception {
    ServerProbe.check(args[0]);
    ServerProbe.check(args[1]);
    for (int i = 2; i < args.length; i++) {
      try {
        ServerProbe.check(args[i]);
        throw new AssertionError("Accepted incompatible server: " + args[i]);
      } catch (AssertionError e) {
        throw e;
      } catch (Exception expected) {
      }
    }
    System.out.println(
      "Android: conexão real com servidor compatível e rejeição de respostas antigas/inválidas passaram."
    );
  }
}
