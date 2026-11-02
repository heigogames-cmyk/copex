import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";
import {
  readRadarData,
  rankEntries,
  filterEntries,
  normalizeEntry,
} from "../shared/radar.js";
import { segmentsToSRT, groupWords } from "../shared/captions.js";
import { zonedLocalToISO } from "../shared/scheduling.js";
import { parseSignals, suggestCuts, analyzeCuts } from "../server/cuts.js";
import { run } from "../server/media.js";
import {
  createVault,
  createSocialClient,
  duePublications,
  registerSocial,
  safeError,
} from "../server/social.js";
import { mediaUrl } from "../server/advanced.js";

test("radar imports metadata and ranks known values without inventing missing metrics", () => {
  const rows = readRadarData(
    "id,titulo,visualizacoes,curtidas,comentarios,compartilhamentos,duracao\na,Forte,10000,800,100,100,30\nb,Pequeno,1000,10,,,20\nc,Sem dados,,,,,",
    "csv",
  );
  const ranked = rankEntries(rows, Date.now());
  assert.equal(ranked[0].id, "a");
  assert.equal(ranked[0].engagement, 0.1);
  assert.equal(ranked.find((e) => e.id === "b").engagement, null);
  assert.equal(ranked.find((e) => e.id === "c").score, null);
  assert.deepEqual(
    filterEntries(ranked, { minViews: 2000 }).map((x) => x.id),
    ["a"],
  );
  assert.equal(normalizeEntry({ id: "x", view_count: 0 }).views, 0);
  assert.equal(
    readRadarData('{"id":"1","view_count":10}\n{"id":"2","view_count":20}')
      .length,
    2,
  );
  assert.throws(() => mediaUrl("http://127.0.0.1/a"));
  assert.throws(() => mediaUrl("https://youtube.com.evil.test/video"));
  assert.equal(
    mediaUrl("https://www.tiktok.com/@user"),
    "https://www.tiktok.com/@user",
  );
});
test("cuts honor boundaries and prefer a detected pause", () => {
  const signals = parseSignals(
    "pts_time:20 silence_start:28 silence_end:30 pts_time:60",
    90,
  );
  const cuts = suggestCuts(90, signals, {
    minDuration: 15,
    targetDuration: 30,
    maxDuration: 40,
  });
  assert.equal(cuts[0].end, 29);
  assert.match(cuts[0].reason, /pausa/);
  assert.ok(cuts.every((c) => c.start >= 0 && c.end <= 90 && c.end > c.start));
  for (let i = 1; i < cuts.length; i++)
    assert.equal(cuts[i].start, cuts[i - 1].end);
});
test("real FFmpeg scene and silence analysis produces valid suggestions", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-cuts-"));
  try {
    const input = path.join(dir, "input.mp4");
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=240x320:rate=24",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=mono",
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-c:a",
      "aac",
      input,
    ]);
    const result = await analyzeCuts(input, 3, true, {
      minDuration: 1,
      maxDuration: 1.5,
      targetDuration: 1,
    });
    assert.ok(result.signals.silences.length);
    assert.ok(result.cuts.length >= 2);
    assert.ok(result.cuts.every((c) => c.end - c.start <= 1.5));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("word grouping creates timed captions and rejects invalid edits", () => {
  const chunks = groupWords([
    {
      words: [
        { word: " Olá", start: 0, end: 0.4 },
        { word: " mundo.", start: 0.4, end: 1 },
        { word: " Outra", start: 1.2, end: 1.6 },
        { word: " fala.", start: 1.6, end: 2 },
      ],
    },
  ]);
  assert.equal(chunks.length, 2);
  assert.match(segmentsToSRT(chunks), /00:00:00,000 --> 00:00:01,000/);
  assert.throws(() => segmentsToSRT([{ start: 2, end: 1, text: "x" }]));
  assert.throws(() => segmentsToSRT([{ start: 1, end: 2, text: "" }]));
});
test("publication schedule converts Brasília local time to UTC and detects invalid local dates", () => {
  assert.equal(
    zonedLocalToISO("2026-11-02T09:00", "America/Sao_Paulo"),
    "2026-11-02T12:00:00.000Z",
  );
  assert.equal(
    zonedLocalToISO("2026-11-02T09:00", "UTC"),
    "2026-11-02T09:00:00.000Z",
  );
  assert.throws(() => zonedLocalToISO("2026-02-30T09:00"));
  assert.throws(() => zonedLocalToISO("2026-03-08T02:30", "America/New_York"));
  assert.deepEqual(
    duePublications([
      { id: 1, status: "scheduled", scheduledAt: "2020-01-01" },
      { id: 2, status: "published", scheduledAt: "2020-01-01" },
      { id: 3, status: "scheduled", scheduledAt: "invalid" },
    ]).map((p) => p.id),
    [1],
  );
});
test("credential vault encrypts tokens, persists securely and never masks corruption", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-vault-"));
  try {
    const token = "test-secret-only";
    const v = await createVault(dir);
    await v.set("a", { accessToken: token });
    const encrypted = await fs.readFile(
      path.join(dir, "private", "accounts.enc"),
      "utf8",
    );
    assert.ok(!encrypted.includes(token));
    assert.equal(
      (await fs.stat(path.join(dir, "private", "vault.key"))).mode & 0o777,
      0o600,
    );
    assert.equal((await createVault(dir)).get("a").accessToken, token);
    await v.remove("a");
    assert.equal((await createVault(dir)).get("a"), undefined);
    await fs.writeFile(path.join(dir, "private", "accounts.enc"), "broken");
    await assert.rejects(createVault(dir), /cofre/);
    assert.ok(
      !safeError(Error("Bearer " + token + " " + token), token).includes(token),
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
const response = (body = {}, headers = {}) => ({
  body,
  headers: new Headers(headers),
  status: 200,
});
async function withMedia(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-social-"));
  try {
    const file = path.join(dir, "sample.mp4");
    await fs.writeFile(file, Buffer.alloc(1024, 1));
    await fn({
      file,
      size: 1024,
      duration: 3,
      type: "video",
      url: "/media/sample.mp4",
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("YouTube adapter follows resumable upload contract with a simulated official API", async () =>
  withMedia(async (media) => {
    const calls = [];
    const client = createSocialClient(async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/channels?"))
        return response({
          items: [
            {
              id: "channel",
              snippet: { title: "Canal" },
              statistics: { subscriberCount: "20" },
            },
          ],
        });
      if (url.includes("uploadType=resumable")) {
        assert.equal(JSON.parse(options.body).status.privacyStatus, "private");
        return response(
          {},
          {
            location:
              "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test",
          },
        );
      }
      if (options.method === "PUT") {
        let length = 0;
        for await (const b of options.body) length += b.length;
        assert.equal(length, 1024);
        return response({ id: "video-id" });
      }
      return response({
        items: [{ statistics: { viewCount: "100", likeCount: "10" } }],
      });
    });
    const a = { platform: "youtube" };
    assert.equal((await client.verify(a, "test-token")).name, "Canal");
    let checkpoint;
    const result = await client.publish(
      a,
      "test-token",
      { title: "Teste", caption: "Descrição" },
      media,
      (v) => {
        checkpoint = v;
      },
    );
    assert.equal(result.status, "published");
    assert.deepEqual(checkpoint, { uploadStarted: true });
    const metrics = await client.metrics(a, "test-token", result);
    assert.equal(metrics.views, 100);
    assert.equal(metrics.comments, null);
    assert.ok(
      calls.every(
        (c) => c.options.headers.Authorization === "Bearer test-token",
      ),
    );
  }));

test("upload credentials are never sent to an unexpected redirect host", async () =>
  withMedia(async (media) => {
    let calls = 0;
    const client = createSocialClient(async () => {
      calls++;
      return response({}, { location: "https://attacker.invalid/upload" });
    });
    await assert.rejects(
      client.publish(
        { platform: "youtube" },
        "secret",
        { title: "Teste" },
        media,
      ),
      /não autorizado/,
    );
    assert.equal(calls, 1);
  }));

test("TikTok adapter checks privacy, uploads a chunk and waits for a confirmed publication", async () =>
  withMedia(async (media) => {
    const client = createSocialClient(async (url, options) => {
      if (url.includes("creator_info"))
        return response({
          data: {
            privacy_level_options: ["SELF_ONLY"],
            max_video_post_duration_sec: 600,
          },
        });
      if (url.includes("video/init"))
        return response({
          data: {
            publish_id: "pub1",
            upload_url: "https://open-upload.tiktokapis.com/upload/1",
          },
        });
      if (options.method === "PUT") {
        assert.equal(options.headers["Content-Range"], "bytes 0-1023/1024");
        for await (const chunk of options.body) {
        }
        return response();
      }
      return response({
        data: {
          status: "PUBLISH_COMPLETE",
          publicaly_available_post_id: ["video-1"],
        },
      });
    });
    const a = { platform: "tiktok" },
      sent = await client.publish(
        a,
        "token",
        { title: "Teste", privacy: "SELF_ONLY" },
        media,
      );
    assert.equal(sent.status, "processing");
    const final = await client.status(a, "token", sent);
    assert.equal(final.status, "published");
    assert.equal(final.remoteId, "video-1");
    await assert.rejects(
      client.publish(
        a,
        "token",
        { title: "Teste", privacy: "PUBLIC_TO_EVERYONE" },
        media,
      ),
      /privacidade/,
    );
  }));

test("Instagram adapter stages a Reel and publishes only after processing confirms readiness", async () =>
  withMedia(async (media) => {
    const calls = [];
    const client = createSocialClient(
      async (url, options) => {
        calls.push(url);
        if (url.endsWith("/user/media")) {
          assert.equal(
            JSON.parse(options.body).video_url,
            "https://media.example/video.mp4",
          );
          return response({ id: "container" });
        }
        if (url.includes("status_code"))
          return response({ status_code: "FINISHED" });
        if (url.endsWith("media_publish"))
          return response({ id: "instagram-video" });
        return response({});
      },
      { delay: async () => {} },
    );
    const a = { platform: "instagram", remoteId: "user" };
    await assert.rejects(
      client.publish(a, "token", { title: "Teste" }, media),
      /URL HTTPS pública/,
    );
    const result = await client.publish(
      a,
      "token",
      { title: "Teste", publicMediaUrl: "https://media.example/video.mp4" },
      media,
    );
    assert.equal(result.remoteId, "instagram-video");
    assert.equal(calls.length, 3);
  }));

test("scheduler persists states, prevents duplicate sends and marks uncertain uploads without automatic retries", async () =>
  withMedia(async (media) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-scheduler-"));
    const db = { accounts: [], publications: [] };
    const app = express();
    app.use(express.json());
    const wrap = (fn) => (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next);
    let calls = 0,
      failAfterUpload = false;
    const adapter = {
      verify: async () => ({ remoteId: "channel", name: "Canal de teste" }),
      publish: async (a, t, p, m, onRemote) => {
        calls++;
        await onRemote({ uploadStarted: true });
        if (failAfterUpload) throw Error("Conexão encerrada");
        return { status: "published", remoteId: "published-" + calls };
      },
    };
    const social = await registerSocial({
      app,
      db,
      save: async () => {},
      wrap,
      DATA: dir,
      resolveMedia: async () => media,
      client: adapter,
    });
    app.use((e, req, res, next) => res.status(400).json({ error: e.message }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const root = "http://127.0.0.1:" + server.address().port;
    const request = async (url, body, method = "POST") => {
      const r = await fetch(root + url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    try {
      const account = await request("/api/accounts", {
        platform: "youtube",
        accessToken: "test-token",
      });
      assert.equal(account.body.status, "ready");
      assert.ok(!JSON.stringify(account.body).includes("test-token"));
      const future = new Date(Date.now() + 60000).toISOString();
      const scheduled = await request("/api/publications", {
        accountId: account.body.id,
        title: "Teste",
        media: { assetId: "a" },
        scheduledAt: future,
      });
      assert.equal(scheduled.body.status, "scheduled");
      db.publications[0].scheduledAt = new Date(
        Date.now() - 1000,
      ).toISOString();
      await social.tick();
      assert.equal(calls, 0);
      await request("/api/social-settings", { schedulerEnabled: true }, "PUT");
      await social.tick();
      await social.tick();
      assert.equal(calls, 1);
      assert.equal(db.publications[0].status, "published");
      failAfterUpload = true;
      const draft = await request("/api/publications", {
        accountId: account.body.id,
        title: "Incerto",
        media: { assetId: "a" },
      });
      await request("/api/publications/" + draft.body.id + "/publish", {});
      assert.equal(db.publications[0].status, "uncertain");
      assert.equal(
        (await request("/api/publications/" + draft.body.id + "/publish", {}))
          .status,
        400,
      );
      await social.tick();
      assert.equal(calls, 2);
    } finally {
      social.close();
      await new Promise((r) => server.close(r));
      await fs.rm(dir, { recursive: true, force: true });
    }
  }));

test("uncertain Instagram status checks never initiate a new publication", async () => {
  const calls = [];
  const client = createSocialClient(async (url, options) => {
    calls.push({ url, options });
    return response({ status_code: "FINISHED" });
  });
  const result = await client.status(
    { platform: "instagram", remoteId: "owner" },
    "test-token",
    { status: "uncertain", remoteContainer: "container" },
  );
  assert.equal(result.status, "uncertain");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, undefined);
});

test("manual reconciliation checks account ownership before confirming a video", async () => {
  const client = createSocialClient(async () =>
    response({ items: [{ snippet: { channelId: "other" } }] }),
  );
  await assert.rejects(
    client.reconcile(
      { platform: "youtube", remoteId: "mine" },
      "test-token",
      "abc123",
    ),
    /pertence/,
  );
  const owned = createSocialClient(async () =>
    response({ items: [{ snippet: { channelId: "mine" } }] }),
  );
  assert.equal(
    (
      await owned.reconcile(
        { platform: "youtube", remoteId: "mine" },
        "test-token",
        "abc123",
      )
    ).status,
    "published",
  );
});
