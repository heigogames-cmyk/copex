import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  randomUUID,
} from "node:crypto";
import { fetch, EnvHttpProxyAgent } from "undici";

export async function createVault(dataDir) {
  const dir = path.join(dataDir, "private");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const keyFile = path.join(dir, "vault.key");
  let key;
  try {
    key = await fs.readFile(keyFile);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    key = randomBytes(32);
    await fs.writeFile(keyFile, key, { mode: 0o600, flag: "wx" });
  }
  if (key.length !== 32)
    throw Error(
      "Chave do cofre inválida. Restaure a pasta private a partir do backup.",
    );
  const file = path.join(dir, "accounts.enc");
  let records = {};
  try {
    const content = JSON.parse(await fs.readFile(file, "utf8"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(content.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(content.tag, "base64"));
    records = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(content.data, "base64")),
        decipher.final(),
      ]).toString(),
    );
  } catch (e) {
    if (e.code !== "ENOENT")
      throw Error(
        "Não foi possível abrir o cofre de contas. Restaure a chave e o arquivo juntos.",
      );
  }
  let pending = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.stringify(records);
    pending = pending
      .catch(() => {})
      .then(async () => {
        const iv = randomBytes(12),
          cipher = createCipheriv("aes-256-gcm", key, iv),
          data = Buffer.concat([cipher.update(snapshot), cipher.final()]);
        await fs.writeFile(
          file + ".tmp",
          JSON.stringify({
            iv: iv.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
            data: data.toString("base64"),
          }),
          { mode: 0o600 },
        );
        await fs.rename(file + ".tmp", file);
      });
    return pending;
  };
  return {
    get: (id) => records[id],
    set: async (id, value) => {
      records[id] = value;
      await persist();
    },
    remove: async (id) => {
      delete records[id];
      await persist();
    },
  };
}
export function safeError(error, token) {
  let message = String(error?.message || error);
  if (token) message = message.split(token).join("[credencial removida]");
  return message.replace(/Bearer\s+\S+/gi, "Bearer [removido]").slice(0, 700);
}
const proxy = new EnvHttpProxyAgent();
export async function http(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    dispatcher: proxy,
    signal: options.signal || AbortSignal.timeout(120000),
    redirect: "error",
    ...(options.body &&
    typeof options.body !== "string" &&
    !Buffer.isBuffer(options.body)
      ? { duplex: "half" }
      : {}),
  });
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = {};
  }
  if (!response.ok || (body.error?.code && body.error.code !== "ok"))
    throw Error(
      body.error?.message ||
        body.error?.error_user_msg ||
        `API retornou HTTP ${response.status}. Confira credenciais, permissões e acesso de rede.`,
    );
  return { body, headers: response.headers, status: response.status };
}
const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const auth = (token, options = {}) => ({
  ...options,
  headers: { ...options.headers, Authorization: "Bearer " + token },
});
const number = (v) =>
  v === undefined || v === null
    ? null
    : Number.isFinite(Number(v))
      ? Number(v)
      : null;
function uploadLocation(value, platform) {
  const u = new URL(value);
  const host = u.hostname;
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !(platform === "youtube"
      ? ["www.googleapis.com", "youtube.googleapis.com"].includes(host)
      : host === "open-upload.tiktokapis.com" ||
        host.endsWith(".tiktokapis.com"))
  )
    throw Error("A API retornou um destino de upload não autorizado.");
  return u.toString();
}
export function createSocialClient(
  send = http,
  { delay = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
  const graph = (account) =>
    `https://graph.instagram.com/${/^v\d+\.\d+$/.test(account.apiVersion || "") ? account.apiVersion : "v24.0"}`;
  async function verify(account, token) {
    if (!token) throw Error("Token da conta ausente.");
    if (account.platform === "youtube") {
      const { body } = await send(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        auth(token),
      );
      const c = body.items?.[0];
      if (!c) throw Error("Nenhum canal disponível para este token.");
      return {
        remoteId: c.id,
        name: c.snippet.title,
        followers: number(c.statistics?.subscriberCount),
      };
    }
    if (account.platform === "instagram") {
      const { body } = await send(
        graph(account) + "/me?fields=user_id,username,account_type",
        auth(token),
      );
      if (!body.user_id && !body.id)
        throw Error("Token sem acesso a uma conta profissional do Instagram.");
      return {
        remoteId: String(body.user_id || body.id),
        name: body.username || account.name,
      };
    }
    if (account.platform === "tiktok") {
      const { body } = await send(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        auth(token),
      );
      const user = body.data?.user;
      if (!user?.open_id) throw Error("Token sem acesso ao perfil TikTok.");
      return {
        remoteId: user.open_id,
        name: user.display_name || account.name,
      };
    }
    throw Error("Plataforma não suportada.");
  }
  async function publish(account, token, publication, media, onRemote) {
    if (account.platform === "youtube") {
      const request = json({
        snippet: {
          title: publication.title.slice(0, 100),
          description: publication.caption || "",
          tags: publication.tags || [],
          categoryId: "22",
        },
        status: {
          privacyStatus: publication.privacy || "private",
          selfDeclaredMadeForKids: !!publication.madeForKids,
        },
      });
      request.headers = {
        ...request.headers,
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(media.size),
      };
      const init = await send(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        auth(token, request),
      );
      const location = uploadLocation(init.headers.get("location"), "youtube");
      await onRemote?.({ uploadStarted: true });
      const result = await send(
        location,
        auth(token, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(media.size),
          },
          body: createReadStream(media.file),
        }),
      );
      if (!result.body.id) throw Error("A API não confirmou o ID do vídeo.");
      return {
        remoteId: result.body.id,
        url: "https://www.youtube.com/watch?v=" + result.body.id,
        status: "published",
      };
    }
    if (account.platform === "instagram") {
      const publicUrl = new URL(
        publication.publicMediaUrl || "https://invalid.local",
      );
      if (
        publicUrl.protocol !== "https:" ||
        publicUrl.hostname === "invalid.local" ||
        publicUrl.username ||
        publicUrl.password
      )
        throw Error(
          "Instagram exige uma URL HTTPS pública para o vídeo. Informe o endereço hospedado ou configure a URL pública do estúdio.",
        );
      let container = publication.remoteContainer;
      if (!container) {
        const r = await send(
          `${graph(account)}/${account.remoteId}/media`,
          auth(
            token,
            json({
              media_type: "REELS",
              video_url: publicUrl.toString(),
              caption: publication.caption || publication.title,
              share_to_feed: !!publication.shareToFeed,
            }),
          ),
        );
        container = r.body.id;
        if (!container)
          throw Error("Instagram não retornou o identificador do contêiner.");
        await onRemote?.({ remoteContainer: container });
      }
      let ready = false;
      for (let i = 0; i < 30; i++) {
        const { body } = await send(
          `${graph(account)}/${container}?fields=status_code,status`,
          auth(token),
        );
        if (body.status_code === "PUBLISHED")
          return { status: "published", remoteContainer: container };
        if (body.status_code === "FINISHED") {
          ready = true;
          break;
        }
        if (["ERROR", "EXPIRED"].includes(body.status_code))
          throw Error(
            "O Instagram rejeitou o processamento do vídeo: " +
              (body.status || body.status_code),
          );
        await delay(3000);
      }
      if (!ready) return { status: "processing", remoteContainer: container };
      const { body } = await send(
        `${graph(account)}/${account.remoteId}/media_publish`,
        auth(token, json({ creation_id: container })),
      );
      if (!body.id) throw Error("Instagram não confirmou a publicação.");
      return { status: "published", remoteId: body.id };
    }
    if (account.platform === "tiktok") {
      if (publication.remotePublishId)
        return status(account, token, publication);
      const info = await send(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        auth(token, json({})),
      );
      const privacy = publication.privacy || "SELF_ONLY";
      if (!info.body.data?.privacy_level_options?.includes(privacy))
        throw Error(
          "A privacidade escolhida não está disponível nesta conta TikTok.",
        );
      if (
        info.body.data?.max_video_post_duration_sec &&
        media.duration > info.body.data.max_video_post_duration_sec
      )
        throw Error("Vídeo excede a duração permitida pela conta TikTok.");
      const chunkSize = Math.min(media.size, 10 * 1024 * 1024),
        count = Math.max(1, Math.floor(media.size / chunkSize));
      const init = await send(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        auth(
          token,
          json({
            post_info: {
              title: (publication.caption || publication.title).slice(0, 2200),
              privacy_level: privacy,
              disable_duet: true,
              disable_comment: !!publication.disableComments,
              disable_stitch: true,
              video_cover_timestamp_ms: 0,
            },
            source_info: {
              source: "FILE_UPLOAD",
              video_size: media.size,
              chunk_size: chunkSize,
              total_chunk_count: count,
            },
          }),
        ),
      );
      const publishId = init.body.data?.publish_id,
        location = uploadLocation(init.body.data?.upload_url, "tiktok");
      if (!publishId) throw Error("TikTok não retornou o ID de envio.");
      await onRemote?.({ remotePublishId: publishId });
      for (let i = 0; i < count; i++) {
        const start = i * chunkSize,
          end = i === count - 1 ? media.size - 1 : start + chunkSize - 1;
        await send(location, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${media.size}`,
          },
          body: createReadStream(media.file, { start, end }),
        });
      }
      return { status: "processing", remotePublishId: publishId };
    }
    throw Error("Plataforma não suportada.");
  }
  async function status(account, token, p) {
    if (account.platform === "tiktok" && p.remotePublishId) {
      const { body } = await send(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        auth(token, json({ publish_id: p.remotePublishId })),
      );
      const data = body.data || {};
      if (data.status === "FAILED")
        return {
          status: "failed",
          error:
            "TikTok rejeitou a publicação: " +
            (data.fail_reason || "sem motivo informado"),
        };
      if (data.status === "PUBLISH_COMPLETE") {
        const id =
          data.publicaly_available_post_id?.[0] ||
          data.publicly_available_post_id?.[0];
        return {
          status: "published",
          remoteId: id ? String(id) : null,
          remotePublishId: p.remotePublishId,
        };
      }
      return { status: "processing", remotePublishId: p.remotePublishId };
    }
    if (account.platform === "instagram" && p.remoteContainer) {
      if (p.status === "uncertain") {
        const { body } = await send(
          `${graph(account)}/${p.remoteContainer}?fields=status_code,status`,
          auth(token),
        );
        if (body.status_code === "PUBLISHED") return { status: "published" };
        if (["ERROR", "EXPIRED"].includes(body.status_code))
          return {
            status: "failed",
            error: "Contêiner rejeitado ou expirado na rede.",
          };
        return {
          status: "uncertain",
          error:
            "O contêiner existe, mas a publicação ainda não foi confirmada. Confira a conta antes de repetir.",
        };
      }
      return publish(account, token, p, {}, undefined);
    }
    return { status: p.status };
  }
  async function metrics(account, token, p) {
    if (!p.remoteId)
      throw Error(
        "A rede ainda não informou o identificador público deste vídeo.",
      );
    if (account.platform === "youtube") {
      const { body } = await send(
        "https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=" +
          encodeURIComponent(p.remoteId),
        auth(token),
      );
      const video = body.items?.[0];
      if (!video) throw Error("Vídeo não encontrado no canal.");
      return {
        views: number(video.statistics?.viewCount),
        likes: number(video.statistics?.likeCount),
        comments: number(video.statistics?.commentCount),
        shares: null,
      };
    }
    if (account.platform === "tiktok") {
      const { body } = await send(
        "https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count",
        auth(token, json({ filters: { video_ids: [p.remoteId] } })),
      );
      const v = body.data?.videos?.[0];
      if (!v) throw Error("TikTok não retornou métricas para este vídeo.");
      return {
        views: number(v.view_count),
        likes: number(v.like_count),
        comments: number(v.comment_count),
        shares: number(v.share_count),
      };
    }
    const { body } = await send(
      `${graph(account)}/${p.remoteId}?fields=like_count,comments_count,permalink`,
      auth(token),
    );
    const result = {
      views: null,
      likes: number(body.like_count),
      comments: number(body.comments_count),
      shares: null,
      url: body.permalink,
    };
    try {
      const insights = await send(
        `${graph(account)}/${p.remoteId}/insights?metric=views,reach,saved,shares`,
        auth(token),
      );
      for (const m of insights.body.data || [])
        result[m.name] = number(m.values?.[0]?.value ?? m.total_value?.value);
    } catch {
      result.warning =
        "A API não liberou todos os insights. As métricas indisponíveis permanecem sem valor.";
    }
    return result;
  }
  async function reconcile(account, token, remoteId) {
    const id = String(remoteId || "").trim();
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(id))
      throw Error("Informe o ID público do vídeo.");
    if (account.platform === "youtube") {
      const { body } = await send(
        "https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" +
          encodeURIComponent(id),
        auth(token),
      );
      const video = body.items?.[0];
      if (!video || video.snippet.channelId !== account.remoteId)
        throw Error("Vídeo não pertence ao canal conectado.");
      return {
        status: "published",
        remoteId: id,
        url: "https://www.youtube.com/watch?v=" + id,
      };
    }
    if (account.platform === "tiktok") {
      const { body } = await send(
        "https://open.tiktokapis.com/v2/video/query/?fields=id",
        auth(token, json({ filters: { video_ids: [id] } })),
      );
      if (!body.data?.videos?.some((v) => String(v.id) === id))
        throw Error("Vídeo não encontrado na conta conectada.");
      return { status: "published", remoteId: id };
    }
    const { body } = await send(
      `${graph(account)}/${id}?fields=id,owner,permalink`,
      auth(token),
    );
    if (String(body.owner?.id || body.owner) !== String(account.remoteId))
      throw Error("Vídeo não pertence à conta conectada.");
    return { status: "published", remoteId: id, url: body.permalink };
  }
  return { verify, publish, status, metrics, reconcile };
}
export function duePublications(publications, now = Date.now()) {
  return publications.filter(
    (p) =>
      p.status === "scheduled" &&
      Number.isFinite(Date.parse(p.scheduledAt)) &&
      Date.parse(p.scheduledAt) <= now,
  );
}
export async function registerSocial({
  app,
  db,
  save,
  wrap,
  DATA,
  assetPath,
  resolveMedia,
  client: providedClient,
}) {
  db.plans ||= [];
  db.accounts ||= [];
  db.publications ||= [];
  db.socialSettings ||= { schedulerEnabled: false, publicBaseUrl: "" };
  const vault = await createVault(DATA),
    client = providedClient || createSocialClient();
  let busy = false;
  for (const p of db.publications)
    if (p.status === "publishing") {
      p.status = "uncertain";
      p.error =
        "O servidor reiniciou durante o envio. Confira a rede antes de repetir para evitar duplicação.";
    }
  const accountFor = (id) => {
    const a = db.accounts.find((a) => a.id === id);
    if (!a) throw Error("Conta não encontrada.");
    return a;
  };
  function updatePlan(p) {
    const plan = db.plans.find((plan) => plan.publicationId === p.id);
    if (plan && p.status === "published") plan.status = "published";
  }
  const checking = new Set();
  async function checkStatus(p) {
    if (checking.has(p.id)) return p;
    const a = accountFor(p.accountId),
      token = vault.get(a.id)?.accessToken;
    if (!token) throw Error("Credencial da conta não disponível.");
    checking.add(p.id);
    try {
      const result = await client.status(a, token, p);
      Object.assign(p, result, { updatedAt: new Date().toISOString() });
      if (p.status === "published") {
        p.publishedAt ||= new Date().toISOString();
        p.error = null;
        updatePlan(p);
      }
    } catch (e) {
      p.error = safeError(e, token);
    } finally {
      checking.delete(p.id);
    }
    await save();
    return p;
  }
  async function execute(p) {
    const account = accountFor(p.accountId),
      secret = vault.get(account.id);
    if (account.status !== "ready" || !secret?.accessToken)
      throw Error("Verifique a conexão da conta antes de publicar.");
    if (account.expiresAt && Date.parse(account.expiresAt) <= Date.now())
      throw Error("Token expirado. Atualize a conexão da conta.");
    const media = await resolveMedia(p.media);
    if (media.type !== "video" || !media.file.endsWith(".mp4"))
      throw Error("Exporte um vídeo MP4 no editor antes de publicar.");
    if (p.status === "failed" && !p.remoteId) {
      delete p.remotePublishId;
      delete p.remoteContainer;
      delete p.uploadStarted;
    }
    p.status = "publishing";
    p.error = null;
    p.attempts = (p.attempts || 0) + 1;
    p.startedAt = new Date().toISOString();
    await save();
    try {
      const result = await client.publish(
        account,
        secret.accessToken,
        p,
        media,
        async (remote) => {
          Object.assign(p, remote);
          await save();
        },
      );
      Object.assign(p, result, { updatedAt: new Date().toISOString() });
      if (p.status === "published") {
        p.publishedAt = new Date().toISOString();
        updatePlan(p);
      }
    } catch (e) {
      p.status =
        p.uploadStarted || p.remoteContainer || p.remotePublishId
          ? "uncertain"
          : "failed";
      p.error = safeError(e, secret.accessToken);
    }
    await save();
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      if (db.socialSettings.schedulerEnabled) {
        for (const p of duePublications(db.publications).sort(
          (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
        )) {
          try {
            await execute(p);
          } catch (e) {
            p.status = "failed";
            p.error = safeError(e);
            await save();
          }
        }
      }
      for (const p of db.publications.filter(
        (p) => p.status === "processing",
      )) {
        try {
          await checkStatus(p);
        } catch (e) {
          p.error = safeError(e);
          await save();
        }
      }
    } finally {
      busy = false;
    }
  }
  app.post(
    "/api/accounts",
    wrap(async (req, res) => {
      const platform = req.body.platform;
      if (!["instagram", "tiktok", "youtube"].includes(platform))
        throw Error("Escolha Instagram, TikTok ou YouTube.");
      const accessToken = String(req.body.accessToken || "").trim();
      if (!accessToken)
        throw Error("Informe o token da API no campo protegido.");
      const account = {
        id: randomUUID(),
        platform,
        name: String(req.body.name || platform).slice(0, 100),
        apiVersion: req.body.apiVersion || "v24.0",
        status: "unverified",
        expiresAt: req.body.expiresAt || null,
        createdAt: new Date().toISOString(),
      };
      await vault.set(account.id, { accessToken });
      db.accounts.push(account);
      try {
        Object.assign(account, await client.verify(account, accessToken), {
          status: "ready",
          verifiedAt: new Date().toISOString(),
        });
      } catch (e) {
        account.error = safeError(e, accessToken);
      }
      await save();
      res.status(201).json(account);
    }),
  );
  app.post(
    "/api/accounts/:id/verify",
    wrap(async (req, res) => {
      const a = accountFor(req.params.id);
      if (req.body.accessToken)
        await vault.set(a.id, {
          accessToken: String(req.body.accessToken).trim(),
        });
      if (req.body.expiresAt) a.expiresAt = req.body.expiresAt;
      const token = vault.get(a.id)?.accessToken;
      try {
        Object.assign(a, await client.verify(a, token), {
          status: "ready",
          error: null,
          verifiedAt: new Date().toISOString(),
        });
      } catch (e) {
        a.status = "unverified";
        a.error = safeError(e, token);
      }
      await save();
      res.json(a);
    }),
  );
  app.delete(
    "/api/accounts/:id",
    wrap(async (req, res) => {
      if (
        db.publications.some(
          (p) =>
            p.accountId === req.params.id &&
            ["scheduled", "publishing", "processing", "uncertain"].includes(
              p.status,
            ),
        )
      )
        throw Error(
          "Cancele ou conclua as publicações desta conta antes de removê-la.",
        );
      db.accounts = db.accounts.filter((a) => a.id !== req.params.id);
      await vault.remove(req.params.id);
      await save();
      res.json({ ok: true });
    }),
  );
  app.put(
    "/api/social-settings",
    wrap(async (req, res) => {
      if (typeof req.body.schedulerEnabled === "boolean")
        db.socialSettings.schedulerEnabled = req.body.schedulerEnabled;
      if (req.body.publicBaseUrl !== undefined) {
        const value = String(req.body.publicBaseUrl).trim();
        if (value) {
          const u = new URL(value);
          if (
            u.protocol !== "https:" ||
            u.username ||
            u.password ||
            ["localhost", "127.0.0.1"].includes(u.hostname)
          )
            throw Error("Informe uma URL HTTPS pública do estúdio.");
        }
        db.socialSettings.publicBaseUrl = value.replace(/\/$/, "");
      }
      await save();
      res.json(db.socialSettings);
    }),
  );
  app.post(
    "/api/publications",
    wrap(async (req, res) => {
      const b = req.body,
        a = accountFor(b.accountId);
      if (a.status !== "ready")
        throw Error(
          "A conta precisa estar verificada para publicar ou agendar.",
        );
      const media = await resolveMedia(b.media);
      if (media.type !== "video" || !media.file.endsWith(".mp4"))
        throw Error("Selecione um vídeo MP4 exportado.");
      if (!String(b.title || "").trim()) throw Error("Informe um título.");
      const scheduledAt = b.scheduledAt
        ? new Date(b.scheduledAt).toISOString()
        : null;
      if (scheduledAt && Date.parse(scheduledAt) <= Date.now())
        throw Error("Escolha uma data futura para agendar.");
      const allowed =
        a.platform === "youtube"
          ? ["private", "unlisted", "public"]
          : a.platform === "tiktok"
            ? [
                "SELF_ONLY",
                "PUBLIC_TO_EVERYONE",
                "MUTUAL_FOLLOW_FRIENDS",
                "FOLLOWER_OF_CREATOR",
              ]
            : ["public"];
      const privacy = allowed.includes(b.privacy) ? b.privacy : allowed[0];
      const p = {
        id: randomUUID(),
        accountId: a.id,
        platform: a.platform,
        title: String(b.title).slice(0, 150),
        caption: String(b.caption || "").slice(0, 5000),
        media: b.media,
        privacy,
        shareToFeed: !!b.shareToFeed,
        madeForKids: !!b.madeForKids,
        disableComments: !!b.disableComments,
        status: scheduledAt ? "scheduled" : "draft",
        scheduledAt,
        publicMediaUrl:
          String(b.publicMediaUrl || "") ||
          (db.socialSettings.publicBaseUrl
            ? db.socialSettings.publicBaseUrl + media.url
            : ""),
        createdAt: new Date().toISOString(),
        attempts: 0,
      };
      if (a.platform === "instagram" && !p.publicMediaUrl)
        throw Error(
          "Instagram precisa de uma URL pública de vídeo. Configure a base HTTPS ou informe o endereço do vídeo.",
        );
      db.publications.unshift(p);
      if (p.scheduledAt) {
        const f = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }),
          parts = Object.fromEntries(
            f
              .formatToParts(new Date(p.scheduledAt))
              .map((p) => [p.type, p.value]),
          );
        db.plans.unshift({
          id: "publication-" + p.id,
          publicationId: p.id,
          title: p.title,
          date: `${parts.year}-${parts.month}-${parts.day}`,
          time: `${parts.hour}:${parts.minute}`,
          platform:
            a.platform === "youtube"
              ? "YouTube"
              : a.platform === "tiktok"
                ? "TikTok"
                : "Instagram",
          caption: p.caption,
          status: "planned",
          createdAt: p.createdAt,
        });
      }

      await save();
      res.status(201).json(p);
    }),
  );
  app.post(
    "/api/publications/:id/publish",
    wrap(async (req, res) => {
      const p = db.publications.find((p) => p.id === req.params.id);
      if (!p) throw Error("Publicação não encontrada.");
      if (!["draft", "failed"].includes(p.status))
        throw Error(
          "Este envio não pode ser repetido. Confira o estado remoto para evitar duplicação.",
        );
      if (busy) throw Error("Outro envio está em andamento.");
      busy = true;
      try {
        await execute(p);
      } finally {
        busy = false;
      }
      res.json(p);
    }),
  );
  app.post(
    "/api/publications/:id/status",
    wrap(async (req, res) => {
      const p = db.publications.find((p) => p.id === req.params.id);
      if (!p) throw Error("Publicação não encontrada.");
      if (!["processing", "uncertain"].includes(p.status)) return res.json(p);
      await checkStatus(p);
      res.json(p);
    }),
  );
  app.post(
    "/api/publications/:id/cancel",
    wrap(async (req, res) => {
      const p = db.publications.find((p) => p.id === req.params.id);
      if (!p || !["draft", "scheduled", "failed"].includes(p.status))
        throw Error("Só é possível cancelar antes do envio.");
      p.status = "cancelled";
      db.plans = db.plans.filter((plan) => plan.publicationId !== p.id);
      await save();
      res.json(p);
    }),
  );
  app.post(
    "/api/publications/:id/reconcile",
    wrap(async (req, res) => {
      const p = db.publications.find(
        (p) =>
          p.id === req.params.id &&
          ["uncertain", "processing"].includes(p.status),
      );
      if (!p) throw Error("Envio não está pendente de confirmação.");
      const a = accountFor(p.accountId),
        token = vault.get(a.id)?.accessToken;
      try {
        Object.assign(p, await client.reconcile(a, token, req.body.remoteId), {
          error: null,
          publishedAt: new Date().toISOString(),
        });
        updatePlan(p);
      } catch (e) {
        throw Error(safeError(e, token));
      }
      await save();
      res.json(p);
    }),
  );
  app.post(
    "/api/publications/:id/reset",
    wrap(async (req, res) => {
      const p = db.publications.find(
        (p) => p.id === req.params.id && p.status === "uncertain",
      );
      if (!p || checking.has(p.id) || req.body.confirmedNotPublished !== true)
        throw Error(
          "Confirme que consultou a rede e que o conteúdo não foi publicado.",
        );
      p.status = "draft";
      p.error = null;
      p.scheduledAt = null;
      delete p.uploadStarted;
      delete p.remoteContainer;
      delete p.remotePublishId;
      db.plans = db.plans.filter((plan) => plan.publicationId !== p.id);
      await save();
      res.json(p);
    }),
  );
  app.post(
    "/api/social-metrics/sync",
    wrap(async (req, res) => {
      const results = [];
      for (const p of db.publications.filter((p) => p.status === "published")) {
        const a = db.accounts.find((a) => a.id === p.accountId),
          token = a && vault.get(a.id)?.accessToken;
        if (!token) continue;
        try {
          p.metrics = await client.metrics(a, token, p);
          p.metricsAt = new Date().toISOString();
          if (p.metrics.url) p.url = p.metrics.url;
          p.metricsError = null;
          results.push({ id: p.id, ok: true });
        } catch (e) {
          p.metricsError = safeError(e, token);
          results.push({ id: p.id, ok: false, error: p.metricsError });
        }
      }
      await save();
      res.json({ results });
    }),
  );
  const timer = setInterval(
    () => tick().catch((e) => console.error("Agendador:", safeError(e))),
    15000,
  );
  timer.unref();
  await save();
  return { tick, close: () => clearInterval(timer) };
}
