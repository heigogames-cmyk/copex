import http from "node:http";
import { spawn } from "node:child_process";
const cp = process.env.ANDROID_TEST_CLASSPATH;
if (!cp)
  throw Error(
    "Defina ANDROID_TEST_CLASSPATH com classes de teste e org.json para a JVM.",
  );
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url.startsWith("/auth/")) {
    res.writeHead(401);
    res.end("{}");
  } else if (req.url.startsWith("/old/"))
    res.end(
      JSON.stringify({ ok: true, app: "copex-studio", version: "3.0.1" }),
    );
  else if (req.url.startsWith("/other/"))
    res.end(JSON.stringify({ ok: true, app: "other", androidClient: 1 }));
  else if (req.url.startsWith("/missing/")) {
    res.writeHead(404);
    res.end("{}");
  } else res.end("invalid json");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      "java",
      [
        "-cp",
        cp,
        "com.copex.studio.ServerProbeTest",
        process.env.COPEX_CHECK_ORIGIN || "http://127.0.0.1:3004",
        base + "/auth",
        base + "/old",
        base + "/other",
        base + "/missing",
        base + "/bad",
      ],
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw Error("Android probe test failed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
