import React, { useState, useEffect, useRef } from "react";
import {
  Radar as RadarIcon,
  Upload,
  Download,
  Search,
  Trash2,
  ExternalLink,
  Play,
  Scissors,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Plus,
  Save,
  Subtitles,
  UserRound,
  Send,
  CalendarDays,
  Clock,
  BarChart3,
  ArrowRight,
  FolderOpen,
  Check,
  Film,
} from "lucide-react";
import {
  Button,
  Field,
  NumberField,
  Toggle,
  Empty,
  Modal,
  PageHeading,
  Thumb,
} from "./studio-ui.jsx";
import { filterEntries } from "../shared/radar.js";
import { zonedLocalToISO } from "../shared/scheduling.js";
const fmt = (n) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        notation: Number(n) >= 10000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(n);
const date = (d) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const duration = (n) =>
  n === null || n === undefined
    ? "—"
    : `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
const labels = {
  queued: "Na fila",
  running: "Processando",
  done: "Concluído",
  partial: "Parcial",
  failed: "Erro",
  draft: "Rascunho",
  scheduled: "Agendada",
  publishing: "Enviando",
  processing: "Processando na rede",
  published: "Publicado",
  cancelled: "Cancelado",
  uncertain: "Verificar na rede",
  ready: "Conectada",
  unverified: "Verificação pendente",
};
function Status({ value }) {
  return (
    <span
      className={
        "status " +
        (["done", "published", "ready"].includes(value)
          ? "done"
          : ["failed", "uncertain"].includes(value)
            ? "failed"
            : ["running", "publishing", "processing"].includes(value)
              ? "running"
              : "queued")
      }
    >
      {labels[value] || value}
    </span>
  );
}
const get = async (path) => {
  const res = await fetch("/api" + path);
  if (!res.ok) throw Error("Não foi possível carregar os dados.");
  return res.json();
};
function csvDownload(name, rows) {
  const cell = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const blob = new Blob(
      ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Radar({ state, mutate, notify, confirm, navigate }) {
  const reports = state.radarReports || [];
  const [url, setUrl] = useState(""),
    [limit, setLimit] = useState(30),
    [selectedReport, setSelectedReport] = useState(""),
    [selected, setSelected] = useState([]),
    [filters, setFilters] = useState({}),
    [order, setOrder] = useState("score"),
    [modal, setModal] = useState(false),
    [content, setContent] = useState(""),
    [format, setFormat] = useState("csv"),
    [name, setName] = useState("Minha análise"),
    [busy, setBusy] = useState(false);
  const ref = useRef();
  const report = reports.find((r) => r.id === selectedReport) || reports[0];
  const entries = filterEntries(report?.entries || [], filters).sort(
    (a, b) => (b[order] ?? -1) - (a[order] ?? -1),
  );
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  useEffect(() => setSelected([]), [report?.id]);
  const analyze = async () => {
    setBusy(true);
    const r = await mutate("/radar/analyze", "POST", {
      url,
      maxResults: limit,
    });
    setBusy(false);
    if (r) {
      setSelectedReport(r.id);
      notify("Análise adicionada à fila.");
    }
  };
  const download = async () => {
    const r = await mutate("/radar/" + report.id + "/download", "POST", {
      entryIds: selected,
      skipDuplicates: true,
    });
    if (r) notify("Downloads adicionados à fila. Acompanhe abaixo.");
  };
  return (
    <>
      <PageHeading
        eyebrow="CONTEÚDO COM CONTEXTO"
        title="Radar de conteúdo"
        description="Compare alcance, engajamento e recência com base nos dados disponíveis."
      >
        <Button icon={Upload} onClick={() => setModal(true)}>
          Importar métricas
        </Button>
        <Button
          icon={Download}
          disabled={!entries.length}
          onClick={() =>
            csvDownload("copex-radar.csv", [
              [
                "id",
                "titulo",
                "url",
                "visualizacoes",
                "curtidas",
                "comentarios",
                "compartilhamentos",
                "duracao",
                "indice",
              ],
              ...entries.map((e) => [
                e.id,
                e.title,
                e.url,
                e.views,
                e.likes,
                e.comments,
                e.shares,
                e.duration,
                e.score,
              ]),
            ])
          }
        >
          Exportar CSV
        </Button>
      </PageHeading>
      <section className="panel settings-card">
        <h2>Analisar vídeo ou perfil público</h2>
        <div className="advanced-form">
          <Field label="URL do vídeo ou perfil">
            <input
              placeholder="https://www.tiktok.com/@perfil"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <NumberField
            label="Vídeos por análise"
            value={limit}
            min={1}
            max={1000}
            onChange={setLimit}
          />
          <Button
            variant="primary"
            icon={RadarIcon}
            disabled={!url.trim() || busy}
            onClick={analyze}
          >
            Analisar
          </Button>
        </div>
        <p className="help-text">
          A rede e a plataforma precisam permitir a consulta. Também é possível
          analisar métricas exportadas em CSV ou JSON, sem conectar contas.
        </p>
      </section>
      <div className="radar-layout">
        <aside className="panel radar-reports">
          <div className="panel-title">
            <h3>Suas análises</h3>
            <span className="counter">{reports.length}</span>
          </div>
          {reports.map((r) => (
            <button
              className={"report-item " + (report?.id === r.id ? "active" : "")}
              key={r.id}
              onClick={() => setSelectedReport(r.id)}
            >
              <b>{r.name}</b>
              <small>
                {date(r.createdAt)} · {r.entries.length} vídeos
              </small>
              <Status value={r.status} />
            </button>
          ))}
          {!reports.length && (
            <Empty
              icon={RadarIcon}
              title="Encontre seu ponto de partida"
              description="Consulte um perfil ou importe métricas para comparar seus vídeos."
            />
          )}
        </aside>
        <section className="radar-results">
          <div className="panel radar-filters">
            <div className="radar-filter-grid">
              <NumberField
                label="Visualizações mínimas"
                value={filters.minViews || ""}
                min={0}
                onChange={(v) => setFilter("minViews", v)}
              />
              <NumberField
                label="Visualizações máximas"
                value={filters.maxViews || ""}
                min={0}
                onChange={(v) => setFilter("maxViews", v)}
              />
              <NumberField
                label="Curtidas mínimas"
                value={filters.minLikes || ""}
                min={0}
                onChange={(v) => setFilter("minLikes", v)}
              />
              <NumberField
                label="Duração máxima (s)"
                value={filters.maxDuration || ""}
                min={0}
                onChange={(v) => setFilter("maxDuration", v)}
              />
              <NumberField
                label="Índice mínimo"
                value={filters.minScore || ""}
                min={0}
                max={100}
                onChange={(v) => setFilter("minScore", v)}
              />
              <Field label="Ordenar por">
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                >
                  <option value="score">Índice relativo</option>
                  <option value="views">Visualizações</option>
                  <option value="engagement">Engajamento</option>
                  <option value="velocity">Visualizações/hora</option>
                </select>
              </Field>
            </div>
          </div>
          {report && (
            <div className="toolbar">
              <h3>{entries.length} vídeos encontrados</h3>
              <div className="row">
                <Button
                  disabled={!selected.length}
                  icon={Download}
                  variant="primary"
                  onClick={download}
                >
                  Baixar {selected.length || ""} selecionados
                </Button>
                <button
                  className="icon-btn"
                  aria-label="Excluir análise"
                  onClick={() =>
                    confirm({
                      action: () => mutate("/radar/" + report.id, "DELETE"),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
          {report?.error && <div className="error-detail">{report.error}</div>}
          {report && ["queued", "running"].includes(report.status) && (
            <div className="info-banner">
              <Loader2 className="spin" size={18} />
              <p>
                Consultando os dados públicos. Você pode continuar usando o
                estúdio.
              </p>
            </div>
          )}
          {entries.length > 0 && (
            <div className="panel table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="Selecionar vídeos visíveis"
                        type="checkbox"
                        checked={
                          entries.length > 0 &&
                          entries.every((e) => selected.includes(e.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? entries.map((e) => e.id) : [],
                          )
                        }
                      />
                    </th>
                    <th>Conteúdo</th>
                    <th>Views</th>
                    <th>Engaj.</th>
                    <th>Índice</th>
                    <th>Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <input
                          aria-label={"Selecionar " + e.title}
                          type="checkbox"
                          checked={selected.includes(e.id)}
                          onChange={() =>
                            setSelected((s) =>
                              s.includes(e.id)
                                ? s.filter((id) => id !== e.id)
                                : [...s, e.id],
                            )
                          }
                        />
                      </td>
                      <td>
                        <b>{e.title}</b>
                        <small>
                          {e.author}{" "}
                          {e.publishedAt && "· " + date(e.publishedAt)}
                        </small>
                        {e.url && (
                          <a
                            className="text-btn"
                            target="_blank"
                            rel="noreferrer"
                            href={e.url}
                          >
                            Ver original <ExternalLink size={11} />
                          </a>
                        )}
                      </td>
                      <td>{fmt(e.views)}</td>
                      <td>
                        {e.engagement === null
                          ? "—"
                          : (e.engagement * 100).toFixed(1) + "%"}
                      </td>
                      <td>
                        <span className="score">{fmt(e.score)}</span>
                      </td>
                      <td>{duration(e.duration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="help-text">
            Índice de 0 a 100 relativo à análise: 50% alcance em escala
            logarítmica, 30% engajamento e 20% recência. Componentes ausentes
            são excluídos e os pesos restantes são normalizados. Não é uma
            previsão de viralidade. “—” indica dado indisponível.
          </p>
        </section>
      </div>
      {(state.operations || [])
        .filter((t) => t.kind === "radar-download")
        .map((t) => (
          <div className="panel operation-card" key={t.id}>
            <div className="row">
              <h3>
                {t.name} · {t.completed}/{t.total}
              </h3>
              <Status value={t.status} />
            </div>
            {t.failures?.map((f) => (
              <p className="error-text" key={f.id}>
                {f.title}: {f.error}
              </p>
            ))}
            {t.status === "done" && (
              <Button onClick={() => navigate("library")}>
                Abrir biblioteca
              </Button>
            )}
          </div>
        ))}
      {modal && (
        <Modal
          title="Importar métricas de conteúdo"
          onClose={() => setModal(false)}
          wide
        >
          <div className="modal-body">
            <Field label="Nome da análise">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="row">
              <Field label="Formato dos dados">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON / JSONL do yt-dlp</option>
                </select>
              </Field>
              <input
                ref={ref}
                type="file"
                accept=".csv,.json,.jsonl"
                hidden
                onChange={async (e) => {
                  const f = e.target.files[0];
                  if (f) {
                    setContent(await f.text());
                    setFormat(f.name.endsWith(".csv") ? "csv" : "json");
                    setName(f.name);
                  }
                }}
              />
              <Button icon={Upload} onClick={() => ref.current.click()}>
                Escolher arquivo
              </Button>
            </div>
            <Field label="Dados">
              <textarea
                rows={9}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  "titulo,url,visualizacoes,curtidas,comentarios,compartilhamentos,duracao\nMeu vídeo,https://youtu.be/ID,12000,900,40,60,32"
                }
              />
            </Field>
            <p className="help-text">
              Dados ausentes ficam em branco. Aceita cabeçalhos em português,
              inglês e campos do yt-dlp.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setModal(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!content.trim() || busy}
              onClick={async () => {
                setBusy(true);
                const r = await mutate("/radar/import", "POST", {
                  name,
                  content,
                  format,
                });
                setBusy(false);
                if (r) {
                  setSelectedReport(r.id);
                  setModal(false);
                  notify("Análise criada com os dados importados.");
                }
              }}
            >
              Analisar dados
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function SmartCuts({ state, mutate, notify, navigate, presets = [] }) {
  const videos = state.assets.filter((a) => a.type === "video"),
    analyses = state.cutAnalyses || [];
  const [assetId, setAssetId] = useState(""),
    [min, setMin] = useState(15),
    [max, setMax] = useState(60),
    [target, setTarget] = useState(30),
    [activeId, setActiveId] = useState(""),
    [selected, setSelected] = useState([]),
    [current, setCurrent] = useState(""),
    [edits, setEdits] = useState({}),
    [preset, setPreset] = useState("");
  const video = useRef();
  const a = analyses.find((a) => a.id === activeId) || analyses[0],
    asset = state.assets.find((v) => v.id === a?.assetId),
    cut = a?.cuts.find((c) => c.id === current) || a?.cuts[0],
    value = cut ? { ...cut, ...edits[cut.id] } : null;
  useEffect(() => {
    setSelected(a?.cuts.map((c) => c.id) || []);
    setEdits({});
    setCurrent(a?.cuts[0]?.id || "");
  }, [a?.id, a?.status]);
  const preview = (c) => {
    setCurrent(c.id);
    if (video.current) {
      video.current.currentTime = (edits[c.id] || c).start;
      video.current.play().catch(() => {});
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="DO VÍDEO LONGO AOS PRÓXIMOS CORTES"
        title="Cortes inteligentes"
        description="Encontre trechos por mudanças de cena, pausas e duração. Revise antes de exportar."
      />
      <section className="panel settings-card">
        <div className="advanced-form cuts-form">
          <Field label="Vídeo de origem">
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">Selecione na biblioteca…</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {duration(v.duration)}
                </option>
              ))}
            </select>
          </Field>
          <NumberField
            label="Mínimo (s)"
            value={min}
            min={1}
            onChange={setMin}
          />
          <NumberField
            label="Alvo (s)"
            value={target}
            min={1}
            onChange={setTarget}
          />
          <NumberField
            label="Máximo (s)"
            value={max}
            min={1}
            onChange={setMax}
          />
          <Button
            variant="primary"
            icon={Scissors}
            disabled={!assetId}
            onClick={async () => {
              const r = await mutate("/cuts/analyze", "POST", {
                assetId,
                minDuration: min,
                maxDuration: max,
                targetDuration: target,
              });
              if (r) {
                setActiveId(r.id);
                notify("Análise de cenas e pausas iniciada.");
              }
            }}
          >
            Encontrar cortes
          </Button>
        </div>
      </section>
      <div className="toolbar" style={{ marginTop: 22 }}>
        <Field label="Análise">
          <select
            value={a?.id || ""}
            onChange={(e) => setActiveId(e.target.value)}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {labels[a.status]}
              </option>
            ))}
          </select>
        </Field>
        {a && <Status value={a.status} />}
      </div>
      {!a ? (
        <Empty
          icon={Scissors}
          title="Mais histórias em cada vídeo"
          description="Importe um vídeo na biblioteca para sugerir os primeiros cortes."
        />
      ) : a.status === "failed" ? (
        <div className="error-detail">{a.error}</div>
      ) : a.status !== "done" ? (
        <Empty
          icon={Loader2}
          title="Analisando cenas e pausas"
          description="O processamento acontece localmente. Você pode mudar de tela."
        />
      ) : (
        <div className="smart-cuts-layout">
          <section className="panel cuts-preview">
            {asset && (
              <video
                ref={video}
                src={asset.url}
                controls
                onTimeUpdate={(e) => {
                  if (value && e.target.currentTime >= value.end)
                    e.target.pause();
                }}
              />
            )}
            <div className="settings-card">
              <h3>Revise o trecho</h3>
              {value && (
                <>
                  <div className="form-grid">
                    <NumberField
                      label="Início do trecho"
                      value={value.start}
                      min={0}
                      max={asset?.duration}
                      step={0.1}
                      onChange={(v) =>
                        setEdits((x) => ({
                          ...x,
                          [cut.id]: { ...value, start: v },
                        }))
                      }
                    />
                    <NumberField
                      label="Fim do trecho"
                      value={value.end}
                      min={0}
                      max={asset?.duration}
                      step={0.1}
                      onChange={(v) =>
                        setEdits((x) => ({
                          ...x,
                          [cut.id]: { ...value, end: v },
                        }))
                      }
                    />
                  </div>
                  <Button icon={Play} onClick={() => preview(value)}>
                    Reproduzir trecho
                  </Button>
                </>
              )}
              <Field label="Template dos cortes">
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                >
                  <option value="">Vertical · padrão</option>
                  {presets
                    .filter((p) => p.kind !== "design")
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Button
                variant="primary"
                icon={Download}
                disabled={!selected.length}
                onClick={async () => {
                  const p = presets.find((p) => p.id === preset);
                  const r = await mutate("/cuts/" + a.id + "/export", "POST", {
                    cutIds: selected,
                    edits,
                    settings: p?.settings || { width: 1080, height: 1920 },
                  });
                  if (r) {
                    notify("Trechos enviados para uma exportação em lote.");
                    navigate("exports");
                  }
                }}
              >
                Exportar {selected.length} cortes
              </Button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h3>{a.cuts.length} trechos sugeridos</h3>
              <label className="row">
                <input
                  type="checkbox"
                  checked={selected.length === a.cuts.length}
                  onChange={(e) =>
                    setSelected(e.target.checked ? a.cuts.map((c) => c.id) : [])
                  }
                />
                Todos
              </label>
            </div>
            {a.cuts.map((c, i) => {
              const v = { ...c, ...edits[c.id] };
              return (
                <div
                  className={"cut-item " + (cut?.id === c.id ? "active" : "")}
                  key={c.id}
                >
                  <input
                    aria-label={"Selecionar corte " + (i + 1)}
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(c.id)
                          ? s.filter((id) => id !== c.id)
                          : [...s, c.id],
                      )
                    }
                  />
                  <button onClick={() => preview(c)}>
                    <b>
                      Trecho {i + 1}{" "}
                      <span>
                        {duration(v.start)} — {duration(v.end)}
                      </span>
                    </b>
                    <p>{c.reason}</p>
                    <small>Continuidade audiovisual: {c.score}/100</small>
                  </button>
                  <span className="counter">
                    {(v.end - v.start).toFixed(1)} s
                  </span>
                </div>
              );
            })}
            <p className="help-text" style={{ padding: 18 }}>
              As sugestões usam sinais do vídeo e do áudio; não avaliam
              significado, relevância editorial ou potencial de viralidade.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
export function Captions({ state, mutate, notify, navigate, onUse }) {
  const [cap, setCap] = useState(null),
    [assetId, setAssetId] = useState(""),
    [language, setLanguage] = useState("pt"),
    [selectedId, setSelectedId] = useState(""),
    [detail, setDetail] = useState(null),
    [segments, setSegments] = useState([]),
    [busy, setBusy] = useState(false);
  const records = state.transcripts || [],
    record = records.find((r) => r.id === selectedId) || records[0];
  const sources = state.assets.filter(
    (a) => a.type === "audio" || (a.type === "video" && a.hasAudio),
  );
  useEffect(() => {
    let active = true;
    const refresh = () =>
      get("/capabilities")
        .then((value) => {
          if (active) setCap(value);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [state.operations?.map((t) => t.status).join()]);
  useEffect(() => {
    if (record?.status === "done")
      get("/transcripts/" + record.id)
        .then((r) => {
          setDetail(r);
          setSegments(r.segments || []);
        })
        .catch(() => {});
    else {
      setDetail(null);
      setSegments([]);
    }
  }, [record?.id, record?.status]);
  return (
    <>
      <PageHeading
        eyebrow="CADA PALAVRA, NO TEMPO CERTO"
        title="Legendas automáticas"
        description="Transcreva áudio localmente, revise o texto e reutilize o SRT no editor."
      />
      <div className="info-banner">
        {cap?.transcription.modelReady ? (
          <CheckCircle2 size={23} />
        ) : (
          <AlertCircle size={23} />
        )}
        <div>
          <b>
            {cap?.transcription.modelReady
              ? "Modelo de voz disponível neste ambiente"
              : "Modelo de voz ainda não instalado"}
          </b>
          <p>
            {cap?.transcription.modelReady
              ? "Reconhecimento local com Whisper, sem enviar seus vídeos a um serviço de transcrição."
              : "O reconhecimento exige os arquivos do modelo Whisper. A instalação precisa de acesso à Hugging Face."}
          </p>
        </div>
        {!cap?.transcription.modelReady && (
          <Button
            icon={Download}
            disabled={
              !cap?.transcription.engineInstalled ||
              cap?.transcription.installation?.state === "downloading" ||
              (state.operations || []).some(
                (t) =>
                  t.kind === "model-install" &&
                  ["queued", "running"].includes(t.status),
              )
            }
            onClick={async () => {
              const r = await mutate(
                "/transcription/model/install",
                "POST",
                {},
              );
              if (r)
                notify("Instalação iniciada. Acompanhe o resultado abaixo.");
            }}
          >
            Instalar modelo
          </Button>
        )}
      </div>
      {cap?.transcription.installation?.state === "downloading" && (
        <div className="info-banner">
          <Loader2 className="spin" />
          <p>
            Preparando o modelo oficial de voz. Você pode continuar usando as
            outras ferramentas.
          </p>
        </div>
      )}
      {cap?.transcription.installation?.state === "failed" &&
        !cap?.transcription.modelReady && (
          <p className="error-text">{cap.transcription.installation.error}</p>
        )}
      {(state.operations || [])
        .filter((t) => t.kind === "model-install")
        .slice(0, 1)
        .map((t) => (
          <div className="panel operation-card" key={t.id}>
            <div className="row">
              <h3>{t.name}</h3>
              <Status value={t.status} />
            </div>
            {t.error && <p className="error-text">{t.error}</p>}
          </div>
        ))}
      <section className="panel settings-card">
        <div className="advanced-form">
          <Field label="Áudio ou vídeo com fala">
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {sources.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Idioma da fala">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="pt">Português</option>
              <option value="en">Inglês</option>
              <option value="es">Espanhol</option>
              <option value="auto">Detectar</option>
            </select>
          </Field>
          <Button
            icon={Subtitles}
            variant="primary"
            disabled={!assetId || !cap?.transcription.modelReady || busy}
            onClick={async () => {
              setBusy(true);
              const r = await mutate("/transcripts", "POST", {
                assetId,
                language,
              });
              setBusy(false);
              if (r) {
                setSelectedId(r.id);
                notify("Transcrição adicionada à fila.");
              }
            }}
          >
            Gerar legendas
          </Button>
        </div>
        <p className="help-text">
          Para usar uma legenda pronta, importe um SRT pela{" "}
          <button className="text-btn" onClick={() => navigate("library")}>
            biblioteca
          </button>
          .
        </p>
      </section>
      <div className="radar-layout">
        <aside className="panel radar-reports">
          <div className="panel-title">
            <h3>Transcrições</h3>
          </div>
          {records.map((r) => (
            <button
              key={r.id}
              className={"report-item " + (r.id === record?.id ? "active" : "")}
              onClick={() => setSelectedId(r.id)}
            >
              <b>{r.name}</b>
              <small>
                {r.language} · {date(r.createdAt)}
              </small>
              <Status value={r.status} />
              {r.status === "running" && (
                <progress value={r.progress} max={100} />
              )}
            </button>
          ))}
        </aside>
        <section>
          {record?.error && <div className="error-detail">{record.error}</div>}
          {detail ? (
            <div className="panel">
              <div className="panel-title">
                <h3>{segments.length} legendas · revise antes de exportar</h3>
                <div className="row">
                  <a
                    className="btn"
                    href={
                      state.assets.find((a) => a.id === detail.subtitleId)?.url
                    }
                    download
                  >
                    <Download size={14} /> SRT
                  </a>
                  <Button
                    icon={Save}
                    onClick={async () => {
                      const r = await mutate(
                        "/transcripts/" + detail.id,
                        "PUT",
                        { segments },
                      );
                      if (r) notify("Texto e arquivo SRT atualizados.");
                    }}
                  >
                    Salvar revisão
                  </Button>
                </div>
              </div>
              <div className="caption-list">
                {segments.map((s, i) => (
                  <div className="caption-item" key={i}>
                    <b>{i + 1}</b>
                    <div>
                      <div className="form-grid">
                        <NumberField
                          label={"Início " + (i + 1)}
                          value={s.start}
                          min={0}
                          step={0.01}
                          onChange={(v) =>
                            setSegments((all) =>
                              all.map((x, j) =>
                                j === i ? { ...x, start: v } : x,
                              ),
                            )
                          }
                        />
                        <NumberField
                          label={"Fim " + (i + 1)}
                          value={s.end}
                          min={0}
                          step={0.01}
                          onChange={(v) =>
                            setSegments((all) =>
                              all.map((x, j) =>
                                j === i ? { ...x, end: v } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <textarea
                        aria-label={"Legenda " + (i + 1)}
                        value={s.text}
                        onChange={(e) =>
                          setSegments((all) =>
                            all.map((x, j) =>
                              j === i ? { ...x, text: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <Button variant="primary" onClick={() => onUse(detail)}>
                  Usar no editor em lote <ArrowRight size={15} />
                </Button>
              </div>
            </div>
          ) : (
            <Empty
              icon={Subtitles}
              title={
                record?.status === "running"
                  ? "Reconhecendo a fala…"
                  : "Sua fala ganha mais alcance"
              }
              description="As legendas geradas aparecem aqui para revisão, download e aplicação no editor."
            />
          )}
        </section>
      </div>
    </>
  );
}
const platformNames = {
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};
export function Accounts({ state, mutate, notify, confirm }) {
  const [modal, setModal] = useState(false),
    [edit, setEdit] = useState(null),
    [form, setForm] = useState({
      platform: "youtube",
      name: "",
      accessToken: "",
      expiresAt: "",
    }),
    [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const r = edit
      ? await mutate("/accounts/" + edit.id + "/verify", "POST", {
          accessToken: form.accessToken,
          expiresAt: form.expiresAt || undefined,
        })
      : await mutate("/accounts", "POST", form);
    setBusy(false);
    if (r) {
      setForm({
        platform: "youtube",
        name: "",
        accessToken: "",
        expiresAt: "",
      });
      setModal(false);
      setEdit(null);
      notify(
        r.status === "ready"
          ? "Conta verificada e conectada."
          : "Credencial salva no cofre. A verificação não foi concluída.",
        r.status === "ready" ? "success" : "error",
      );
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="SEUS CANAIS, NO MESMO FLUXO"
        title="Contas conectadas"
        description="Autorize suas próprias contas para publicar e consultar resultados pelas APIs oficiais."
      >
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => {
            setEdit(null);
            setForm({
              platform: "youtube",
              name: "",
              accessToken: "",
              expiresAt: "",
            });
            setModal(true);
          }}
        >
          Conectar conta
        </Button>
      </PageHeading>
      <div className="info-banner">
        <UserRound size={23} />
        <div>
          <b>
            Sem cadastro no Copex. As redes mantêm suas próprias permissões.
          </b>
          <p>
            Os tokens ficam criptografados neste ambiente e não aparecem no
            backup JSON. Cada plataforma pode exigir um aplicativo aprovado e
            escopos específicos.
          </p>
        </div>
      </div>
      <div className="accounts-grid">
        {(state.accounts || []).map((a) => (
          <article className="panel settings-card account-card" key={a.id}>
            <div className="row">
              <span className={"platform-icon " + a.platform}>
                {a.platform === "youtube"
                  ? "▶"
                  : a.platform === "tiktok"
                    ? "♪"
                    : "◎"}
              </span>
              <Status value={a.status} />
            </div>
            <h2>{a.name}</h2>
            <p>
              {platformNames[a.platform]} ·{" "}
              {a.remoteId || "Identidade ainda não verificada"}
            </p>
            {a.expiresAt && (
              <p className="help-text">
                Validade informada: {date(a.expiresAt)}
              </p>
            )}
            {a.error && <div className="error-detail">{a.error}</div>}
            <div className="row">
              <Button
                icon={RefreshCw}
                onClick={() => {
                  setEdit(a);
                  setForm({
                    platform: a.platform,
                    name: a.name,
                    accessToken: "",
                    expiresAt: a.expiresAt?.slice(0, 10) || "",
                  });
                  setModal(true);
                }}
              >
                Verificar / atualizar
              </Button>
              <button
                className="icon-btn"
                aria-label={"Remover conta " + a.name}
                onClick={() =>
                  confirm({
                    title: "Remover conexão?",
                    message:
                      "A credencial será removida do cofre. Publicações já realizadas na rede serão preservadas.",
                    action: () => mutate("/accounts/" + a.id, "DELETE"),
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!state.accounts?.length && (
        <Empty
          icon={UserRound}
          title="Conecte seu primeiro canal"
          description="Edição e exportação continuam funcionando sem conexão social."
        />
      )}
      <section className="panel settings-card permissions-guide">
        <h2>O que cada rede exige</h2>
        <div className="permissions-grid">
          <div>
            <h3>YouTube</h3>
            <p>
              Token OAuth do seu canal com escopos <code>youtube.upload</code> e{" "}
              <code>youtube.readonly</code>. Envios usam a API resumível; a
              privacidade inicial é privada.
            </p>
            <a
              href="https://developers.google.com/youtube/v3/guides/authentication"
              target="_blank"
              rel="noreferrer"
              className="text-btn"
            >
              Documentação oficial <ExternalLink size={12} />
            </a>
          </div>
          <div>
            <h3>Instagram</h3>
            <p>
              Conta profissional e token da Instagram API com Instagram Login,
              com permissão de publicação e insights. Reels precisam de uma URL
              HTTPS que a Meta consiga acessar.
            </p>
            <a
              href="https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/"
              target="_blank"
              rel="noreferrer"
              className="text-btn"
            >
              Documentação oficial <ExternalLink size={12} />
            </a>
          </div>
          <div>
            <h3>TikTok</h3>
            <p>
              Token com <code>user.info.basic</code>, <code>video.publish</code>{" "}
              e, para métricas, <code>video.list</code>. A publicação direta
              depende da aprovação do aplicativo na plataforma.
            </p>
            <a
              href="https://developers.tiktok.com/doc/content-posting-api-get-started/"
              target="_blank"
              rel="noreferrer"
              className="text-btn"
            >
              Documentação oficial <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </section>
      {modal && (
        <Modal
          title={edit ? "Atualizar conexão" : "Conectar conta por token"}
          onClose={() => {
            setModal(false);
            setForm((f) => ({ ...f, accessToken: "" }));
          }}
        >
          <div className="modal-body">
            {!edit && (
              <>
                <Field label="Plataforma">
                  <select
                    value={form.platform}
                    onChange={(e) =>
                      setForm({ ...form, platform: e.target.value })
                    }
                  >
                    {Object.entries(platformNames).map(([k, n]) => (
                      <option value={k} key={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nome da conexão">
                  <input
                    placeholder="Ex.: Meu canal principal"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
              </>
            )}
            <Field
              label="Token de acesso da API"
              hint={
                edit
                  ? "Deixe em branco para testar a credencial já armazenada."
                  : "Cole o token autorizado da sua conta. Não use sua senha da rede."
              }
            >
              <input
                type="password"
                autoComplete="off"
                value={form.accessToken}
                onChange={(e) =>
                  setForm({ ...form, accessToken: e.target.value })
                }
              />
            </Field>
            <Field label="Validade do token (opcional)">
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm({ ...form, expiresAt: e.target.value })
                }
              />
            </Field>
            <p className="help-text">
              A conexão será testada com uma consulta de leitura. Nenhum
              conteúdo será publicado nesta etapa.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setModal(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={busy || (!edit && !form.accessToken.trim())}
              onClick={submit}
            >
              {busy ? "Verificando…" : "Salvar e verificar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Publishing({ state, mutate, notify, navigate }) {
  const [modal, setModal] = useState(false),
    [selected, setSelected] = useState([]),
    [confirmation, setConfirmation] = useState(false),
    [recovery, setRecovery] = useState(null),
    [remoteId, setRemoteId] = useState(""),
    [checkedRemote, setCheckedRemote] = useState(false),
    [busy, setBusy] = useState(false),
    [accountId, setAccountId] = useState(""),
    [mediaKeys, setMediaKeys] = useState([]),
    [title, setTitle] = useState(""),
    [caption, setCaption] = useState(""),
    [privacy, setPrivacy] = useState("private"),
    [when, setWhen] = useState("draft"),
    [scheduledAt, setScheduledAt] = useState(""),
    [interval, setIntervalMinutes] = useState(60),
    [zone, setZone] = useState("America/Sao_Paulo"),
    [publicUrl, setPublicUrl] = useState(""),
    [baseUrl, setBaseUrl] = useState(state.socialSettings?.publicBaseUrl || "");
  const accounts = state.accounts || [],
    ready = accounts.filter((a) => a.status === "ready"),
    account = ready.find((a) => a.id === accountId),
    publications = state.publications || [];
  const media = [
    ...state.jobs
      .filter((j) => ["done", "partial"].includes(j.status))
      .flatMap((j) =>
        j.outputs.map((o, i) => ({
          key: `${j.id}:${i}`,
          name: j.name + " / " + o.name,
          ref: { jobId: j.id, outputIndex: i },
          url: o.url,
        })),
      )
      .filter((m) => m.url.endsWith(".mp4")),
    ...state.assets
      .filter((a) => a.type === "video" && a.file.endsWith(".mp4"))
      .map((a) => ({
        key: a.id,
        name: a.name,
        ref: { assetId: a.id },
        url: a.url,
      })),
  ];
  const eligible = publications.filter((p) =>
    ["draft", "failed"].includes(p.status),
  );
  const picked = eligible.filter((p) => selected.includes(p.id));
  const chooseAccount = (id) => {
    setAccountId(id);
    const a = ready.find((a) => a.id === id);
    setPrivacy(
      a?.platform === "youtube"
        ? "private"
        : a?.platform === "tiktok"
          ? "SELF_ONLY"
          : "public",
    );
  };
  const create = async () => {
    let utc;
    try {
      if (when === "scheduled") utc = zonedLocalToISO(scheduledAt, zone);
    } catch (e) {
      return notify(e.message, "error");
    }
    setBusy(true);
    let count = 0;
    for (let i = 0; i < mediaKeys.length; i++) {
      const m = media.find((m) => m.key === mediaKeys[i]);
      if (!m) continue;
      const r = await mutate("/publications", "POST", {
        accountId,
        media: m.ref,
        title: mediaKeys.length > 1 ? title + " · " + (i + 1) : title,
        caption,
        privacy,
        scheduledAt: utc
          ? new Date(
              Date.parse(utc) + i * Number(interval) * 60000,
            ).toISOString()
          : null,
        publicMediaUrl: publicUrl || undefined,
      });
      if (r) count++;
    }
    setBusy(false);
    if (count) {
      setModal(false);
      setMediaKeys([]);
      notify(
        `${count} publicação(ões) ${when === "scheduled" ? "agendada(s)" : "salva(s) como rascunho"}. Nenhum rascunho foi enviado.`,
      );
    }
  };
  const publishSelected = async () => {
    setConfirmation(false);
    setBusy(true);
    let published = 0,
      pending = 0,
      failed = 0;
    for (const p of picked) {
      const r = await mutate("/publications/" + p.id + "/publish", "POST", {});
      if (r?.status === "published") published++;
      else if (r?.status === "processing") pending++;
      else failed++;
    }
    setBusy(false);
    setSelected([]);
    notify(
      `${published} confirmado(s), ${pending} processando na rede, ${failed} não concluído(s).`,
      failed ? "error" : "success",
    );
  };
  return (
    <>
      <PageHeading
        eyebrow="DO ESTÚDIO PARA SEUS CANAIS"
        title="Publicação e agendamento"
        description="Prepare rascunhos, organize envios em lote e acompanhe a confirmação das redes."
      >
        <Button
          icon={Plus}
          variant="primary"
          disabled={!ready.length || !media.length}
          onClick={() => setModal(true)}
        >
          Nova publicação
        </Button>
      </PageHeading>
      {!ready.length && (
        <div className="info-banner">
          <UserRound size={22} />
          <div>
            <b>Conecte e verifique uma conta para publicar.</b>
            <p>
              O Copex não precisa de login, mas as redes exigem autorização da
              sua própria conta.
            </p>
          </div>
          <Button onClick={() => navigate("accounts")}>Conectar conta</Button>
        </div>
      )}
      <section className="panel settings-card">
        <div className="row">
          <div>
            <h2>Agendador do estúdio</h2>
            <p>
              Os envios vencidos são verificados a cada 15 segundos enquanto o
              servidor está ativo.
            </p>
          </div>
          <Toggle
            label="Ativar agendador"
            checked={state.socialSettings?.schedulerEnabled}
            onChange={(v) =>
              mutate("/social-settings", "PUT", { schedulerEnabled: v })
            }
          />
        </div>
        <div className="advanced-form public-base">
          <Field
            label="URL HTTPS pública do estúdio (para Reels)"
            hint="A Meta precisa conseguir baixar o vídeo nesse endereço. Deixe vazio se usar URLs hospedadas por publicação."
          >
            <input
              type="url"
              value={baseUrl}
              placeholder="https://meu-estudio.exemplo.com"
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </Field>
          <Button
            icon={Save}
            onClick={async () => {
              const r = await mutate("/social-settings", "PUT", {
                publicBaseUrl: baseUrl,
              });
              if (r) notify("URL pública salva.");
            }}
          >
            Salvar URL
          </Button>
        </div>
      </section>
      <div className="toolbar" style={{ marginTop: 22 }}>
        <h3>{publications.length} publicações</h3>
        <Button
          icon={Send}
          variant="primary"
          disabled={!picked.length || busy}
          onClick={() => setConfirmation(true)}
        >
          Publicar {picked.length || ""} selecionadas
        </Button>
      </div>
      {!publications.length ? (
        <Empty
          icon={Send}
          title="Seu próximo conteúdo está a caminho"
          description="Escolha um vídeo exportado, uma conta e prepare seu primeiro rascunho."
        />
      ) : (
        <div className="job-list">
          {publications.map((p) => {
            const a = accounts.find((a) => a.id === p.accountId);
            return (
              <article className="panel publication-card" key={p.id}>
                <div className="job-header">
                  {["draft", "failed"].includes(p.status) && (
                    <input
                      aria-label={"Selecionar publicação " + p.title}
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() =>
                        setSelected((s) =>
                          s.includes(p.id)
                            ? s.filter((id) => id !== p.id)
                            : [...s, p.id],
                        )
                      }
                    />
                  )}
                  <span className={"platform-icon " + p.platform}>
                    {p.platform === "youtube"
                      ? "▶"
                      : p.platform === "tiktok"
                        ? "♪"
                        : "◎"}
                  </span>
                  <div className="job-title">
                    <h3>{p.title}</h3>
                    <small>
                      {a?.name || "Conta removida"} ·{" "}
                      {platformNames[p.platform]} ·{" "}
                      {p.scheduledAt ? date(p.scheduledAt) : "Sem agendamento"}{" "}
                      · {p.privacy}
                    </small>
                  </div>
                  <Status value={p.status} />
                </div>
                {p.caption && (
                  <p className="publication-caption">{p.caption}</p>
                )}
                {p.error && <div className="error-detail">{p.error}</div>}
                {p.status === "uncertain" && (
                  <p className="help-text" style={{ padding: "0 20px" }}>
                    O envio pode ter sido recebido. Confira a rede antes de
                    criar outra publicação.
                  </p>
                )}
                <div className="publication-actions">
                  {p.status === "uncertain" && (
                    <Button
                      onClick={() => {
                        setRecovery(p);
                        setRemoteId("");
                        setCheckedRemote(false);
                      }}
                    >
                      Conferir envio interrompido
                    </Button>
                  )}
                  {["draft", "scheduled", "failed"].includes(p.status) && (
                    <Button
                      onClick={() =>
                        mutate("/publications/" + p.id + "/cancel", "POST", {})
                      }
                    >
                      Cancelar
                    </Button>
                  )}
                  {["processing", "uncertain"].includes(p.status) && (
                    <Button
                      icon={RefreshCw}
                      onClick={() =>
                        mutate("/publications/" + p.id + "/status", "POST", {})
                      }
                    >
                      Consultar confirmação
                    </Button>
                  )}
                  {p.url && (
                    <a
                      className="btn"
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver na rede <ExternalLink size={13} />
                    </a>
                  )}
                  {p.remoteId && <small>ID confirmado: {p.remoteId}</small>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {modal && (
        <Modal
          title="Preparar publicação em lote"
          wide
          onClose={() => setModal(false)}
        >
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Conta de destino">
                <select
                  value={accountId}
                  onChange={(e) => chooseAccount(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {ready.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {platformNames[a.platform]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Privacidade">
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value)}
                >
                  {(account?.platform === "youtube"
                    ? [
                        ["private", "Privado"],
                        ["unlisted", "Não listado"],
                        ["public", "Público"],
                      ]
                    : account?.platform === "tiktok"
                      ? [
                          ["SELF_ONLY", "Só eu"],
                          ["PUBLIC_TO_EVERYONE", "Público"],
                          ["MUTUAL_FOLLOW_FRIENDS", "Amigos"],
                          ["FOLLOWER_OF_CREATOR", "Seguidores"],
                        ]
                      : [["public", "Público"]]
                  ).map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Título">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dê um título ao conteúdo"
                maxLength={100}
              />
            </Field>
            <Field label="Legenda / descrição">
              <textarea
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </Field>
            <div className="publication-media-list">
              {media.map((m) => (
                <label key={m.key}>
                  <input
                    type="checkbox"
                    checked={mediaKeys.includes(m.key)}
                    onChange={() =>
                      setMediaKeys((s) =>
                        s.includes(m.key)
                          ? s.filter((k) => k !== m.key)
                          : [...s, m.key],
                      )
                    }
                  />
                  <Film size={16} />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Quando enviar">
                <select value={when} onChange={(e) => setWhen(e.target.value)}>
                  <option value="draft">Salvar como rascunho</option>
                  <option value="scheduled">Agendar</option>
                </select>
              </Field>
              {when === "scheduled" && (
                <Field label="Data e horário">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </Field>
              )}
            </div>
            {when === "scheduled" && (
              <>
                <div className="form-grid">
                  <Field label="Fuso horário">
                    <select
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                    >
                      <option value="America/Sao_Paulo">Brasília</option>
                      <option value="UTC">UTC</option>
                      <option value="America/Manaus">Manaus</option>
                      <option value="Europe/Lisbon">Lisboa</option>
                    </select>
                  </Field>
                  <NumberField
                    label="Intervalo entre vídeos (min)"
                    min={1}
                    value={interval}
                    onChange={setIntervalMinutes}
                  />
                </div>
                {!state.socialSettings?.schedulerEnabled && (
                  <p className="error-text">
                    O agendador está desativado. Ative-o nesta página para
                    executar os horários.
                  </p>
                )}
              </>
            )}
            {account?.platform === "instagram" && (
              <Field
                label="URL pública do vídeo (opcional com base configurada)"
                hint="Para lotes, prefira configurar a URL pública do estúdio; cada mídia terá seu próprio endereço."
              >
                <input
                  type="url"
                  value={publicUrl}
                  onChange={(e) => setPublicUrl(e.target.value)}
                />
              </Field>
            )}
            <p className="help-text">
              Rascunhos só são enviados depois de você selecionar “Publicar”.
              Horários agendados são executados automaticamente com o agendador
              ativo e a conta autorizada.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setModal(false)}>Cancelar</Button>
            <Button
              variant="primary"
              icon={Save}
              disabled={
                busy ||
                !accountId ||
                !title.trim() ||
                !mediaKeys.length ||
                (when === "scheduled" && !scheduledAt)
              }
              onClick={create}
            >
              {busy
                ? "Preparando…"
                : when === "scheduled"
                  ? "Agendar lote"
                  : "Salvar rascunhos"}
            </Button>
          </div>
        </Modal>
      )}
      {recovery && (
        <Modal
          title="Conferir envio interrompido"
          onClose={() => setRecovery(null)}
        >
          <div className="modal-body">
            <p>
              Confira se “{recovery.title}” já aparece na sua conta. Esta etapa
              não envia outro vídeo.
            </p>
            <Field label="ID do vídeo já publicado">
              <input
                value={remoteId}
                onChange={(e) => setRemoteId(e.target.value)}
                placeholder="ID informado pela própria rede"
              />
            </Field>
            <Button
              disabled={!remoteId.trim() || busy}
              icon={CheckCircle2}
              onClick={async () => {
                setBusy(true);
                const r = await mutate(
                  "/publications/" + recovery.id + "/reconcile",
                  "POST",
                  { remoteId },
                );
                setBusy(false);
                if (r) {
                  setRecovery(null);
                  notify("Publicação confirmada na conta conectada.");
                }
              }}
            >
              Verificar ID na rede
            </Button>
            <div className="info-box">
              <p>
                Se o conteúdo não foi publicado, você pode voltar ao rascunho
                após conferir a conta. Isso permitirá um novo envio.
              </p>
            </div>
            <Toggle
              label="Conferi a rede e o vídeo não foi publicado"
              checked={checkedRemote}
              onChange={setCheckedRemote}
            />
          </div>
          <div className="modal-actions">
            <Button onClick={() => setRecovery(null)}>Fechar</Button>
            <Button
              disabled={!checkedRemote}
              onClick={async () => {
                const r = await mutate(
                  "/publications/" + recovery.id + "/reset",
                  "POST",
                  { confirmedNotPublished: true },
                );
                if (r) {
                  setRecovery(null);
                  notify("Envio reaberto como rascunho.");
                }
              }}
            >
              Voltar ao rascunho
            </Button>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title="Publicar nas contas selecionadas?"
          onClose={() => setConfirmation(false)}
        >
          <div className="modal-body">
            <p>Serão enviados {picked.length} vídeo(s):</p>
            <ul className="feature-list">
              {picked.map((p) => (
                <li key={p.id}>
                  <Send size={15} />
                  {p.title} · {accounts.find((a) => a.id === p.accountId)?.name}{" "}
                  · {p.privacy}
                </li>
              ))}
            </ul>
            <p className="help-text">
              Depois do envio, a remoção deve ser feita na própria rede.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setConfirmation(false)}>Voltar</Button>
            <Button variant="primary" icon={Send} onClick={publishSelected}>
              Confirmar publicação
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function SocialMetrics({ state, mutate, notify }) {
  const [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all");
  const posts = (state.publications || []).filter(
    (p) =>
      p.status === "published" && (filter === "all" || p.platform === filter),
  );
  const sum = (key) => {
    const values = posts
      .map((p) => p.metrics?.[key])
      .filter((n) => Number.isFinite(n));
    return values.length ? values.reduce((s, n) => s + n, 0) : null;
  };
  return (
    <section className="section">
      <PageHeading
        eyebrow="DADOS DAS SUAS CONTAS"
        title="Resultados nas redes"
        description="Métricas retornadas pelas APIs das contas conectadas. Campos indisponíveis não são estimados."
      >
        <Button
          icon={RefreshCw}
          disabled={busy || !posts.length}
          onClick={async () => {
            setBusy(true);
            const r = await mutate("/social-metrics/sync", "POST", {});
            setBusy(false);
            if (r)
              notify(
                `${r.results.filter((x) => x.ok).length} consulta(s) concluída(s); ${r.results.filter((x) => !x.ok).length} com erro.`,
                r.results.some((x) => !x.ok) ? "error" : "success",
              );
          }}
        >
          {busy ? "Atualizando…" : "Atualizar métricas"}
        </Button>
        <Button
          icon={Download}
          disabled={!posts.length}
          onClick={() =>
            csvDownload("copex-resultados.csv", [
              [
                "titulo",
                "plataforma",
                "id",
                "visualizacoes",
                "curtidas",
                "comentarios",
                "compartilhamentos",
                "atualizado",
              ],
              ...posts.map((p) => [
                p.title,
                p.platform,
                p.remoteId,
                p.metrics?.views,
                p.metrics?.likes,
                p.metrics?.comments,
                p.metrics?.shares,
                p.metricsAt,
              ]),
            ])
          }
        >
          CSV
        </Button>
      </PageHeading>
      <div className="filter-tabs">
        {[["all", "Todas"], ...Object.entries(platformNames)].map(([v, n]) => (
          <button
            key={v}
            className={filter === v ? "active" : ""}
            onClick={() => setFilter(v)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="stats-grid">
        {[
          ["views", "Visualizações"],
          ["likes", "Curtidas"],
          ["comments", "Comentários"],
          ["shares", "Compartilhamentos"],
        ].map(([k, label]) => (
          <div className="stat-card" key={k}>
            <span className="stat-number">{fmt(sum(k))}</span>
            <b>{label}</b>
            <small>Somente dados disponíveis</small>
          </div>
        ))}
      </div>
      {!posts.length ? (
        <Empty
          icon={BarChart3}
          title="Resultados aparecem depois de publicar"
          description="Conecte uma conta, publique pelo estúdio e sincronize os dados disponíveis."
        />
      ) : (
        <div className="panel table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Conteúdo</th>
                <th>Views</th>
                <th>Curtidas</th>
                <th>Comentários</th>
                <th>Compart.</th>
                <th>Atualização</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.title}</b>
                    <small>{platformNames[p.platform]}</small>
                    {p.metricsError && (
                      <p className="error-text">{p.metricsError}</p>
                    )}
                    {p.metrics?.warning && <small>{p.metrics.warning}</small>}
                  </td>
                  <td>{fmt(p.metrics?.views)}</td>
                  <td>{fmt(p.metrics?.likes)}</td>
                  <td>{fmt(p.metrics?.comments)}</td>
                  <td>{fmt(p.metrics?.shares)}</td>
                  <td>{date(p.metricsAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
