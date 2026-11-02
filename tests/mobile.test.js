import test from "node:test";
import assert from "node:assert/strict";
import { uid } from "../shared/core.js";
import { accessControl } from "../server/access.js";
test("mobile HTTP creates valid UUIDs without secure-context randomUUID", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const real = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: real.getRandomValues.bind(real) },
    });
    const ids = Array.from({ length: 200 }, () => uid());
    assert.equal(new Set(ids).size, 200);
    for (const id of ids)
      assert.match(
        id,
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
      );
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
test("online gateway requires a configured secret and protects APIs without adding app accounts", () => {
  assert.throws(
    () => accessControl("", { required: true }),
    /COPEX_ACCESS_PASSWORD/,
  );
  const guard = accessControl("local-test-only");
  let allowed = 0,
    status;
  const res = {
    set: () => res,
    status: (n) => {
      status = n;
      return res;
    },
    json: () => res,
  };
  for (const authorization of [
    "",
    "Bearer x",
    "Basic " + Buffer.from("copex:wrong").toString("base64"),
    "Basic " + Buffer.from("other:local-test-only").toString("base64"),
  ]) {
    guard({ headers: { authorization } }, res, () => allowed++);
    assert.equal(status, 401);
  }
  guard(
    {
      headers: {
        authorization:
          "Basic " + Buffer.from("copex:local-test-only").toString("base64"),
      },
    },
    res,
    () => allowed++,
  );
  assert.equal(allowed, 1);
  accessControl("")({}, {}, () => allowed++);
  assert.equal(allowed, 2);
});

test("Instagram media capabilities expire, bind one publication and reject tampering", async () => {
  const { mediaSigner } = await import("../server/public-media.js");
  const signer = mediaSigner(Buffer.alloc(32, 7));
  const p = { id: "publication", media: { assetId: "one-video" } };
  const now = Date.now();
  const url = new URL(signer.sign(p, "https://copex.example", now));
  const expires = url.searchParams.get("expires"),
    signature = url.searchParams.get("signature");
  assert.equal(signer.verify(p, expires, signature, now), true);
  assert.equal(signer.verify(p, expires, signature, now + 86400000), false);
  assert.equal(
    signer.verify(
      { ...p, media: { assetId: "other" } },
      expires,
      signature,
      now,
    ),
    false,
  );
  assert.equal(signer.verify(p, Number(expires) + 1, signature, now), false);
  assert.equal(signer.verify(p, expires, "0".repeat(64), now), false);
  assert.throws(() => signer.sign(p, "http://private.example", now));
});
test("signed media serves only an active Instagram video, supports ranges and leaves private routes protected", async () => {
  const express = (await import("express")).default;
  const { registerPublicMedia } = await import("../server/public-media.js");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-signed-media-"));
  const video = path.join(dir, "test.mp4");
  await fs.writeFile(video, "video-test-content");
  const p = {
    id: "pub",
    platform: "instagram",
    status: "draft",
    media: { assetId: "one" },
  };
  const db = { publications: [p] },
    app = express();
  const sign = await registerPublicMedia({
    app,
    db,
    DATA: dir,
    wrap: (fn) => (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next),
    resolveMedia: async () => ({ file: video, type: "video" }),
  });
  app.use(accessControl("private-test"));
  app.get("/api/state", (_req, res) => res.json({ private: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const link = new URL(sign(p, "https://example.com"));
  const route = link.pathname + link.search;
  try {
    assert.equal((await fetch(base + "/api/state")).status, 401);
    assert.equal((await fetch(base + route)).status, 403);
    p.status = "publishing";
    let r = await fetch(base + route, { headers: { Range: "bytes=0-4" } });
    assert.equal(r.status, 206);
    assert.equal(await r.text(), "video");
    p.status = "cancelled";
    assert.equal((await fetch(base + route)).status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("local mobile setup preserves its password, strips Windows line endings and restricts the file", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-local-password-"));
  try {
    const options = {
      env: { ...process.env, COPEX_WINDOWS_APP_DIR: dir },
      encoding: "utf8",
    };
    let r = spawnSync("sh", ["scripts/mobile-secret.sh"], {
      ...options,
      input: "test-only-secret\r\n",
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "test-only-secret");
    r = spawnSync("sh", ["scripts/mobile-secret.sh"], {
      ...options,
      input: "different\r\n",
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "test-only-secret");
    assert.equal(
      (await fs.stat(path.join(dir, ".access-password"))).mode & 0o777,
      0o600,
    );
    assert.equal(
      await fs.readFile(path.join(dir, ".mobile-private"), "utf8"),
      "1",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
