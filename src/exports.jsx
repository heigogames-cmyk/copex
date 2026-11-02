import React, { useState } from "react";
import {
  Download,
  Clapperboard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Play,
  FileCheck2,
  ArrowUpRight,
  XCircle,
  SlidersHorizontal,
} from "lucide-react";
import { Button, PageHeading, Empty } from "./studio-ui.jsx";
const labels = {
  done: "Concluída",
  partial: "Concluída com falhas",
  failed: "Erro",
  cancelled: "Cancelada",
  queued: "Na fila",
  running: "Processando",
};
const itemLabels = {
  done: "Pronto",
  failed: "Não exportado",
  cancelled: "Interrompido",
  queued: "Aguardando",
  running: "Exportando",
};
const bytes = (n) =>
  n >= 1e6
    ? (n / 1e6).toFixed(1) + " MB"
    : Math.max(1, Math.round(n / 1e3)) + " KB";
const date = (d) =>
  new Date(d).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
export function ExportCenter({
  state,
  mutate,
  notify,
  setPreview,
  editFailed,
}) {
  const [filter, setFilter] = useState("Todas"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState([]);
  const jobs = state.jobs.filter(
    (j) =>
      j.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (filter === "Todas" ||
        (filter === "Em andamento" &&
          ["queued", "running"].includes(j.status)) ||
        (filter === "Concluídas" && j.status === "done") ||
        (filter === "Com falhas" &&
          ["failed", "partial", "cancelled"].includes(j.status))),
  );
  const done = state.jobs.flatMap((j) => j.outputs || []).length,
    pending = state.jobs.filter((j) =>
      ["queued", "running"].includes(j.status),
    ).length;
  const act = async (id, action) => {
    setBusy((ids) => [...ids, id]);
    try {
      await action();
    } finally {
      setBusy((ids) => ids.filter((x) => x !== id));
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="SALA DE SAÍDA / DO FRAME AO ARQUIVO"
        title="Central de exportações"
        description="Acompanhe cada arquivo do lote. O que ficou pronto continua seu, mesmo se outro item falhar."
      />
      <div className="export-overview">
        <div>
          <Clapperboard size={22} />
          <strong>{pending}</strong>
          <span>lotes em andamento</span>
        </div>
        <div>
          <FileCheck2 size={22} />
          <strong>{done}</strong>
          <span>arquivos gerados</span>
        </div>
        <p>
          Os originais ficam intactos.
          <br />A criação continua enquanto a fila trabalha.
        </p>
      </div>
      <div className="toolbar">
        <div className="filter-tabs">
          {["Todas", "Em andamento", "Concluídas", "Com falhas"].map((f) => (
            <button
              key={f}
              aria-pressed={f === filter}
              className={f === filter ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={16} />
          <input
            aria-label="Buscar exportações"
            placeholder="Buscar um lote…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {!jobs.length ? (
        <Empty
          icon={Download}
          title={
            state.jobs.length
              ? "Nenhum lote com esse filtro."
              : "Sua próxima ideia está a um lote de distância."
          }
          description={
            state.jobs.length
              ? "Altere a busca ou o status para encontrar sua exportação."
              : "Selecione mídias no editor, escolha os ajustes e envie seu primeiro lote."
          }
        >
          {state.jobs.length > 0 && (
            <Button
              onClick={() => {
                setFilter("Todas");
                setQuery("");
              }}
            >
              Mostrar todos
            </Button>
          )}
        </Empty>
      ) : (
        <div className="job-list">
          {jobs.map((j) => {
            const complete =
                j.items?.filter((i) => i.status === "done").length ??
                j.outputs.length,
              total = j.items?.length || j.assetIds.length,
              available =
                ["done", "partial", "cancelled"].includes(j.status) &&
                j.outputs?.length > 0;
            return (
              <article className={"job-card export-" + j.status} key={j.id}>
                <div className="job-header">
                  <div className={"job-icon " + j.status}>
                    {j.status === "done" ? (
                      <CheckCircle2 />
                    ) : j.status === "running" ? (
                      <Loader2 className="spin" />
                    ) : ["partial", "failed"].includes(j.status) ? (
                      <AlertCircle />
                    ) : j.status === "cancelled" ? (
                      <XCircle />
                    ) : (
                      <Clapperboard />
                    )}
                  </div>
                  <div className="job-title">
                    <h3>{j.name}</h3>
                    <small>
                      {j.settings.width} × {j.settings.height} ·{" "}
                      {date(j.createdAt)} · {complete}/{total} itens prontos
                    </small>
                  </div>
                  <span className={"status " + j.status}>
                    {labels[j.status]}
                  </span>
                  {available && (
                    <a
                      className="btn primary"
                      href={"/api/jobs/" + j.id + "/download"}
                    >
                      <Download size={16} />
                      Baixar ZIP
                    </a>
                  )}
                  {["running", "queued"].includes(j.status) && (
                    <Button
                      disabled={busy.includes(j.id)}
                      onClick={() =>
                        act(j.id, () =>
                          mutate("/jobs/" + j.id + "/cancel", "POST"),
                        )
                      }
                    >
                      Cancelar lote
                    </Button>
                  )}
                  {["partial", "failed", "cancelled"].includes(j.status) &&
                    editFailed && (
                      <Button
                        icon={SlidersHorizontal}
                        onClick={() => editFailed(j)}
                      >
                        Revisar ajustes
                      </Button>
                    )}
                  {["partial", "failed", "cancelled"].includes(j.status) && (
                    <Button
                      icon={RefreshCw}
                      disabled={busy.includes(j.id)}
                      onClick={() =>
                        act(j.id, async () => {
                          const r = await mutate(
                            "/jobs/" + j.id + "/retry-failed",
                            "POST",
                          );
                          if (r)
                            notify(
                              "Somente os itens não concluídos voltaram para a fila.",
                            );
                        })
                      }
                    >
                      {j.status === "partial"
                        ? "Repetir itens com erro"
                        : "Tentar novamente"}
                    </Button>
                  )}
                </div>
                {["running", "queued"].includes(j.status) && (
                  <div className="job-progress">
                    <div>
                      <span>{j.current || "Aguardando sua vez na fila…"}</span>
                      <b>{j.progress}%</b>
                    </div>
                    <progress value={j.progress} max={100} />
                  </div>
                )}
                {j.status === "partial" && (
                  <div className="partial-notice">
                    <AlertCircle size={16} />
                    <span>
                      Parte do lote ficou pronta. Baixe os arquivos concluídos
                      ou repita só os itens com erro.
                    </span>
                  </div>
                )}
                {j.status === "cancelled" && (
                  <p className="help-text job-note">
                    Processamento interrompido. Os arquivos concluídos antes do
                    cancelamento continuam disponíveis.
                  </p>
                )}
                {j.items?.length > 0 && (
                  <details
                    className="job-details"
                    open={j.status === "partial" || j.status === "failed"}
                  >
                    <summary>
                      Ver {total} itens do lote{" "}
                      <span>{complete} concluídos</span>
                    </summary>
                    <div className="job-item-list">
                      {j.items.map((item, i) => (
                        <div className={"job-item " + item.status} key={i}>
                          <span className="item-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <b>{item.name}</b>
                            {item.start !== undefined && (
                              <small>
                                Trecho: {item.start.toFixed(1)}–
                                {item.end.toFixed(1)} s
                              </small>
                            )}
                            {item.error && (
                              <details className="item-error">
                                <summary>Detalhes do erro</summary>
                                <pre>{item.error}</pre>
                              </details>
                            )}
                          </div>
                          <span className={"status " + item.status}>
                            {itemLabels[item.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {j.error && !j.items?.some((i) => i.error) && (
                  <div className="partial-notice">
                    <AlertCircle size={16} />
                    <p>{j.error}</p>
                  </div>
                )}
                {available && (
                  <div className="job-outputs">
                    {j.outputs.map((o) => (
                      <div key={o.url}>
                        <button
                          className="text-btn"
                          onClick={() =>
                            setPreview({
                              name: o.name,
                              url: o.url,
                              type: o.name.endsWith(".mp4") ? "video" : "image",
                            })
                          }
                        >
                          <Play size={13} />
                          {o.name}
                        </button>
                        <span>{bytes(o.size)}</span>
                        <a
                          className="icon-btn"
                          href={o.url}
                          download={o.name}
                          title={"Baixar " + o.name}
                        >
                          <Download size={15} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
