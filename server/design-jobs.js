import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  validateDesignBody,
  freezeDesignImages,
  renderDesignRow,
} from "./design-render.js";
export function registerDesignJobs({
  app,
  db,
  DATA,
  save,
  wrap,
  assetPath,
  activeAssets,
  controllers,
  wake,
  ingest,
}) {
  const payloadDir = path.join(DATA, "design-jobs");
  const read = async (job) =>
    JSON.parse(
      await fs.readFile(path.join(payloadDir, job.id + ".json"), "utf8"),
    );
  async function create(payload, assetIds, name) {
    const id = randomUUID();
    await fs.mkdir(payloadDir, { recursive: true });
    await fs.writeFile(
      path.join(payloadDir, id + ".json"),
      JSON.stringify(payload),
      { flag: "wx", mode: 0o600 },
    );
    const job = {
      id,
      kind: "design",
      name: String(name || payload.doc.name + " · designs").slice(0, 100),
      assetIds,
      settings: { width: payload.doc.width, height: payload.doc.height },
      format: payload.format,
      prefix: "design",
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
      outputs: [],
      rowCount: payload.rows.length,
      items: payload.rows.map((_r, index) => ({
        index,
        rowIndex: index,
        name: "Variação " + (index + 1),
        status: "queued",
      })),
    };
    db.jobs.unshift(job);
    try {
      await save();
    } catch (error) {
      db.jobs = db.jobs.filter((j) => j.id !== id);
      await fs.unlink(path.join(payloadDir, id + ".json")).catch(() => {});
      throw error;
    }
    wake();
    return job;
  }
  async function enqueue(body) {
    const { doc, rows, format, assetIds } = validateDesignBody(body, db);
    for (const id of assetIds)
      activeAssets.set(id, (activeAssets.get(id) || 0) + 1);
    try {
      await freezeDesignImages(doc, db, assetPath);
      return await create({ doc, rows, format }, assetIds, body.name);
    } finally {
      for (const id of assetIds) {
        const count = activeAssets.get(id) - 1;
        if (count > 0) activeAssets.set(id, count);
        else activeAssets.delete(id);
      }
    }
  }
  async function retry(job) {
    const payload = await read(job),
      pending = job.items.filter((i) => i.status !== "done");
    if (!pending.length) throw Error("Todos os itens já foram concluídos.");
    return create(
      { ...payload, rows: pending.map((i) => payload.rows[i.rowIndex]) },
      job.assetIds,
      job.name + " · nova tentativa",
    );
  }
  async function process(job) {
    const payload = await read(job),
      dir = path.join(DATA, "exports", job.id);
    await fs.mkdir(dir, { recursive: true });
    const controller = new AbortController();
    controllers.set(job.id, controller);
    job.outputs = [];
    try {
      for (const item of job.items) {
        if (job.status === "cancelled" || controller.signal.aborted) break;
        item.status = "running";
        job.current = item.name;
        await save();
        const name = `design-${String(item.index + 1).padStart(3, "0")}.${job.format === "jpeg" ? "jpg" : job.format}`,
          file = path.join(dir, name);
        try {
          await renderDesignRow(
            payload.doc,
            payload.rows[item.rowIndex],
            job.format,
            file,
          );
          if (controller.signal.aborted)
            throw Error("Processamento cancelado.");
          job.outputs.push({
            itemIndex: item.index,
            name,
            url: `/media/exports/${job.id}/${name}`,
            size: (await fs.stat(file)).size,
          });
          item.status = "done";
        } catch (error) {
          item.status = controller.signal.aborted ? "cancelled" : "failed";
          item.error = error.message;
          await fs.unlink(file).catch(() => {});
        }
        job.progress = Math.round(((item.index + 1) / job.items.length) * 100);
        await save();
      }
    } finally {
      controllers.delete(job.id);
      job.stopping = false;
      for (const item of job.items)
        if (["queued", "running"].includes(item.status))
          item.status = job.status === "cancelled" ? "cancelled" : "failed";
      const failed = job.items.filter((i) => i.status === "failed");
      if (failed.length)
        job.error =
          failed.length +
          " variação(ões) não foram concluídas. Os resultados prontos foram preservados.";
      await save();
    }
  }
  app.post(
    "/api/design/jobs",
    wrap(async (req, res) => res.status(202).json(await enqueue(req.body))),
  );
  app.post(
    "/api/design/jobs/:id/edit",
    wrap(async (req, res) => {
      const job = db.jobs.find(
        (j) => j.id === req.params.id && j.kind === "design",
      );
      if (!job) return res.sendStatus(404);
      const payload = await read(job),
        pending = job.items.filter((i) => i.status !== "done"),
        recovered = new Map();
      for (const e of payload.doc.elements.filter(
        (e) => e.type === "image" && e.dataUrl,
      )) {
        let a = db.assets.find(
          (a) => a.id === e._sourceAssetId && a.type === "image",
        );
        if (!a) {
          a = recovered.get(e.dataUrl);
          if (!a) {
            const buffer = Buffer.from(e.dataUrl.split(",")[1], "base64"),
              file = path.join(DATA, "tmp", randomUUID() + ".png");
            await fs.writeFile(file, buffer);
            a = await ingest({
              path: file,
              originalname: job.name + " · imagem recuperada.png",
              size: buffer.length,
            });
            recovered.set(e.dataUrl, a);
          }
        }
        e.assetId = a.id;
        delete e.dataUrl;
        delete e._sourceAssetId;
      }
      res.json({
        ...payload,
        rows: pending.length
          ? pending.map((i) => payload.rows[i.rowIndex])
          : payload.rows,
        restoredImages: recovered.size,
      });
    }),
  );
  return { process, retry };
}
