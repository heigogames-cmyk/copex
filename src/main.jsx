import { MediaLibrary } from "./library.jsx";
import { TemplateLibrary } from "./catalog.jsx";
import { ExportCenter } from "./exports.jsx";
import { CopexMark, StudioComposition, PresetPoster } from "./identity.jsx";
import { readDraft, writeDraft, useDraft, downloadJSON } from "./drafts.js";
import {
  Radar,
  SmartCuts,
  Captions,
  Accounts,
  Publishing,
  SocialMetrics,
} from "./advanced.jsx";
import {
  Button,
  Field,
  NumberField,
  Toggle,
  Range,
  Empty,
  Modal,
  Thumb,
  useDialog,
  PageHeading,
} from "./studio-ui.jsx";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Clapperboard,
  Layers,
  FolderOpen,
  CalendarDays,
  Settings,
  Upload,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  Download,
  Check,
  CheckCircle2,
  X,
  MoreHorizontal,
  Film,
  Image as ImageIcon,
  Music2,
  SlidersHorizontal,
  Type,
  Volume2,
  Sparkles,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Copy,
  Play,
  Pause,
  Loader2,
  Star,
  Clock,
  RotateCcw,
  Save,
  ChevronDown,
  Zap,
  BarChart3,
  ExternalLink,
  Scissors,
  PanelLeft,
  Menu,
  RefreshCw,
  AlertCircle,
  GripVertical,
  Undo2,
  Redo2,
  Square,
  MousePointer2,
  Eye,
  EyeOff,
  MoveUp,
  MoveDown,
  Link as LinkIcon,
  Radar as RadarIcon,
  Subtitles,
  Users,
  Send,
  Lock,
  Unlock,
} from "lucide-react";
import {
  templates,
  sizes,
  uid,
  parseCSV,
  interpolate,
  templateSVG,
} from "../shared/core.js";
import { defaults } from "../server/media-defaults.js";
import "./style.css";
import "./refinement.css";
const api = async (url, options = {}) => {
  const res = await fetch("/api" + url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let data;
    try {
      data = await res.json();
    } catch {}
    throw Error(
      data?.error ||
        data?.errors?.map((e) => e.name + ": " + e.error).join(" • ") ||
        `Erro ${res.status}`,
    );
  }
  return res.json();
};
const bytes = (n) =>
  n > 1e9
    ? (n / 1e9).toFixed(1) + " GB"
    : n > 1e6
      ? (n / 1e6).toFixed(1) + " MB"
      : Math.round(n / 1e3) + " KB";
const time = (n) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;
const dateFormat = (d) =>
  new Date(d).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
const clone = (x) => JSON.parse(JSON.stringify(x));
const videoPresets = [
  {
    id: "reels",
    name: "Reels clean",
    category: "Social",
    description: "Vertical, texto legível e cores equilibradas.",
    color: "#d9f473",
    settings: {
      ...defaults,
      width: 1080,
      height: 1920,
      text: "Sua próxima grande ideia.",
      textPosition: "bottom",
      fontSize: 58,
    },
  },
  {
    id: "podcast",
    name: "Corte de podcast",
    category: "Vídeo",
    description: "Recorte vertical com título central e fade suave.",
    color: "#c1afff",
    settings: {
      ...defaults,
      width: 1080,
      height: 1920,
      text: "UM NOVO PONTO DE VISTA",
      textPosition: "top",
      fontSize: 48,
      fadeIn: 0.4,
      fadeOut: 0.4,
      contrast: 1.08,
    },
  },
  {
    id: "cinema",
    name: "Cinema mood",
    category: "Vídeo",
    description: "Paisagem, contraste e uma atmosfera quente.",
    color: "#e7b69e",
    settings: {
      ...defaults,
      width: 1920,
      height: 1080,
      filter: "warm",
      contrast: 1.12,
      saturation: 0.85,
      fadeIn: 0.6,
      fadeOut: 0.8,
    },
  },
  {
    id: "mono",
    name: "Monocromático",
    category: "Social",
    description: "Preto e branco com identidade editorial.",
    color: "#dce0dc",
    settings: {
      ...defaults,
      width: 1080,
      height: 1350,
      filter: "mono",
      text: "Um instante. Uma história.",
      fontSize: 50,
      textBox: false,
    },
  },
  {
    id: "product",
    name: "Produto em foco",
    category: "Promoção",
    description: "Quadrado, cores vibrantes e chamada de ação.",
    color: "#f0b6ce",
    settings: {
      ...defaults,
      width: 1080,
      height: 1080,
      saturation: 1.18,
      contrast: 1.05,
      text: "CONHEÇA A NOVIDADE",
      fontSize: 42,
      textPosition: "bottom",
    },
  },
  {
    id: "shorts",
    name: "Shorts dinâmico",
    category: "Vídeo",
    description: "Vertical com ritmo acelerado e cortes de 30 segundos.",
    color: "#a8d4e3",
    settings: {
      ...defaults,
      width: 1080,
      height: 1920,
      speed: 1.1,
      splitSeconds: 30,
      contrast: 1.07,
      text: "VOCÊ PRECISA VER ISSO",
      fontSize: 48,
      textPosition: "top",
    },
  },
];
function App() {
  const [editorSeed] = useState(() => readDraft("copex:editor:v3", {}));
  const [projectId, setProjectId] = useState(editorSeed.projectId || null),
    [commands, setCommands] = useState(false),
    [commandQuery, setCommandQuery] = useState("");
  const [state, setState] = useState({
      assets: [],
      jobs: [],
      presets: [],
      plans: [],
      projects: [],
      automations: [],
      brand: { name: "Minha marca", color: "#d9f473" },
    }),
    [loaded, setLoaded] = useState(false),
    [connectionError, setConnectionError] = useState(null),
    [page, setPage] = useState(() =>
      [
        "dashboard",
        "editor",
        "importer",
        "radar",
        "cuts",
        "captions",
        "templates",
        "library",
        "exports",
        "calendar",
        "accounts",
        "publishing",
        "automations",
        "analytics",
        "settings",
      ].includes(location.hash.slice(1))
        ? location.hash.slice(1)
        : "dashboard",
    ),
    [toast, setToast] = useState(null),
    [uploading, setUploading] = useState(false),
    [selected, setSelected] = useState(
      Array.isArray(editorSeed.selected) ? editorSeed.selected : [],
    ),
    [settings, setSettings] = useState({ ...defaults, ...editorSeed.settings }),
    [overrides, setOverrides] = useState(editorSeed.overrides || {}),
    [projectName, setProjectName] = useState(
      String(editorSeed.projectName || "Projeto sem título"),
    ),
    [mobile, setMobile] = useState(false),
    [preview, setPreview] = useState(null),
    [confirm, setConfirm] = useState(null),
    [design, setDesign] = useState(() => {
      const r = readDraft("copex:design:v3");
      return r?.doc &&
        Array.isArray(r.doc.elements) &&
        typeof r.doc.name === "string" &&
        r.open !== false
        ? {
            ...r.doc,
            _draftCsv: r.csv,
            _draftFormat: r.format,
            recovered: true,
          }
        : null;
    });
  const draftStatus = useDraft(
    "copex:editor:v3",
    { selected, settings, overrides, projectName, projectId },
    loaded,
  );
  useEffect(() => {
    if (!loaded) return;
    setSelected((ids) => {
      const next = ids.filter((id) => state.assets.some((a) => a.id === id));
      return next.length === ids.length ? ids : next;
    });
    if (projectId && !state.projects.some((p) => p.id === projectId))
      setProjectId(null);
  }, [
    loaded,
    state.assets.map((a) => a.id).join("|"),
    state.projects.map((p) => p.id).join("|"),
  ]);
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (document.querySelector(".design-overlay")) return;
        e.preventDefault();
        setCommands((v) => !v);
      }
    };
    const back = () => {
      setCommands(false);
      setPage(location.hash.slice(1) || "dashboard");
      setMobile(false);
    };
    document.addEventListener("keydown", handler);
    window.addEventListener("popstate", back);
    return () => {
      document.removeEventListener("keydown", handler);
      window.removeEventListener("popstate", back);
    };
  }, []);
  const [designRecovery, setDesignRecovery] = useState(() =>
    readDraft("copex:design:v3"),
  );
  const uploadRef = useRef(),
    toastTimer = useRef(),
    refreshSequence = useRef(0);
  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const next = await api("/state");
      if (sequence !== refreshSequence.current) return;
      setState(next);
      setLoaded(true);
      setConnectionError(null);
    } catch (e) {
      if (sequence !== refreshSequence.current) return;
      setConnectionError(e.message);
    }
  }, [notify]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [refresh]);
  const navigate = (p) => {
    setCommands(false);
    setPage(p);
    if (location.hash !== "#" + p) history.pushState(null, "", "#" + p);
    setMobile(false);
  };
  const uploadFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      const result = await api("/upload", { method: "POST", body: form });
      await refresh();
      notify(
        `${result.assets.length} arquivo(s) importado(s).${result.errors.length ? " " + result.errors.map((x) => x.name + ": " + x.error).join(" • ") : ""}`,
        result.errors.length ? "error" : "success",
      );
      if (page === "editor")
        setSelected((s) => [
          ...new Set([
            ...s,
            ...result.assets
              .filter((a) => ["video", "image"].includes(a.type))
              .map((a) => a.id),
          ]),
        ]);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };
  const mutate = async (url, method, body) => {
    try {
      const result = await api(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      await refresh();
      return result;
    } catch (e) {
      notify(e.message, "error");
      return null;
    }
  };
  const exportBatch = async () => {
    const invalid = selected
      .map((id) => state.assets.find((a) => a.id === id))
      .filter(Boolean)
      .filter((a) => {
        if (a.type !== "video") return false;
        const e = { ...settings, ...overrides[a.id] },
          end = e.end > 0 ? Math.min(e.end, a.duration) : a.duration;
        return Number(e.start) >= end;
      });
    if (invalid.length) {
      notify(
        "Revise início e fim do corte em: " +
          invalid.map((a) => a.name).join(", "),
        "error",
      );
      return;
    }

    const result = await mutate("/jobs", "POST", {
      name: projectName,
      assetIds: selected.filter((id) => state.assets.some((a) => a.id === id)),
      settings,
      overrides,
      format: settings.imageFormat || "png",
      prefix: settings.prefix || "copex",
    });
    if (result) {
      notify("Exportação adicionada à fila. Você pode continuar trabalhando.");
      navigate("exports");
    }
  };
  const applyPreset = (p) => {
    const next = { ...defaults, ...p.settings };
    let missing = false;
    for (const key of ["watermarkId", "audioId", "subtitleId"])
      if (next[key] && !state.assets.some((a) => a.id === next[key])) {
        next[key] = "";
        missing = true;
      }
    setSettings(next);
    setOverrides({});
    navigate("editor");
    notify(
      `Template “${p.name}” aplicado ao lote.${missing ? " Selecione novamente os arquivos de marca, áudio ou legenda ausentes." : ""}`,
    );
  };
  const openProject = (p) => {
    setSettings({ ...defaults, ...p.settings });
    setSelected(
      p.assetIds.filter((id) => state.assets.some((a) => a.id === id)),
    );
    setOverrides(p.overrides || {});
    setProjectName(p.name);
    setProjectId(p.id);
    navigate("editor");
    notify("Projeto carregado.");
  };
  const newProject = () => {
    setProjectId(null);
    setSettings({ ...defaults });
    setSelected([]);
    setOverrides({});
    setProjectName("Projeto sem título");
    navigate("editor");
  };
  const nav = [
    ["dashboard", LayoutDashboard, "Visão geral"],
    ["editor", Clapperboard, "Editor em lote"],
    ["importer", LinkIcon, "Importar por link"],
    ["radar", RadarIcon, "Radar de conteúdo"],
    ["cuts", Scissors, "Cortes inteligentes"],
    ["captions", Subtitles, "Legendas automáticas"],
    ["templates", Layers, "Templates"],
    ["library", FolderOpen, "Biblioteca"],
    ["exports", Download, "Exportações"],
    ["calendar", CalendarDays, "Calendário"],
    ["accounts", Users, "Contas conectadas"],
    ["publishing", Send, "Publicação"],
    ["automations", Zap, "Automações"],
    ["analytics", BarChart3, "Resultados"],
  ];
  const activeJobs = state.jobs.filter((j) =>
    ["running", "queued"].includes(j.status),
  );
  return (
    <div className="app">
      <input
        ref={uploadRef}
        type="file"
        accept="video/*,image/*,audio/*,.srt"
        multiple
        hidden
        onChange={(e) => uploadFiles(e.target.files)}
      />
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <div className="brand-symbol">
            <CopexMark />
          </div>
          <div>
            copex<span>CAMPO DE CRIAÇÃO</span>
          </div>
        </a>
        <button
          className="workspace"
          aria-label="Personalizar meu estúdio"
          onClick={() => navigate("settings")}
        >
          <div className="avatar">{state.brand.name.charAt(0)}</div>
          <div>
            <b>{state.brand.name}</b>
            <small>Espaço pessoal</small>
          </div>
          <SlidersHorizontal size={14} />
        </button>
        <p className="nav-label">SEU FLUXO DE CRIAÇÃO</p>
        <nav>
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {label}
              {id === "editor" && <span className="nav-new">LOTE</span>}
              {id === "exports" && activeJobs.length > 0 && (
                <span className="count">{activeJobs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="unlimited">
            <span className="live-dot" />
            <b>Seu espaço, sem limites</b>
            <p>
              Todos os recursos disponíveis.
              <br />
              Sem planos. Sem assinatura.
            </p>
          </div>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings size={18} />
            Configurações
          </button>
          <div className="profile">
            <div className="avatar lime">EU</div>
            <div>
              <b>Meu estúdio</b>
              <small>Uso individual</small>
            </div>
            <span className="live-dot" />
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <main>
        <header className="topbar">
          <div>
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={13} />{" "}
              <strong>
                {nav.find((x) => x[0] === page)?.[2] || "Configurações"}
              </strong>
            </span>
          </div>
          <div className="top-actions">
            <button
              className="command-trigger"
              onClick={() => {
                setCommandQuery("");
                setCommands(true);
              }}
            >
              <Search size={15} />
              <span>Encontre no estúdio</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="local-badge">
              <span className="live-dot" /> Estúdio local
            </span>
            <span className="top-divider" />
            <div className="avatar small lime">EU</div>
          </div>
        </header>
        <div
          className={
            "page page-" + page + " " + (page === "editor" ? "editor-page" : "")
          }
        >
          {page === "dashboard" && (
            <Dashboard
              state={state}
              navigate={navigate}
              upload={() => uploadRef.current.click()}
              applyPreset={applyPreset}
              openProject={openProject}
              onNewProject={newProject}
              recovery={designRecovery?.open === false ? designRecovery : null}
              setDesign={setDesign}
              mutate={mutate}
              confirm={setConfirm}
            />
          )}
          {page === "editor" && (
            <BatchEditor
              {...{
                state,
                settings,
                setSettings,
                selected,
                setSelected,
                overrides,
                setOverrides,
                projectName,
                setProjectName,
                projectId,
                setProjectId,
                draftStatus,
                onNewProject: newProject,
                exportBatch,
                uploading,
                mutate,
                notify,
              }}
              upload={() => uploadRef.current.click()}
            />
          )}
          {page === "templates" && (
            <Templates
              state={state}
              applyPreset={applyPreset}
              setDesign={setDesign}
              mutate={mutate}
              notify={notify}
              confirm={setConfirm}
            />
          )}
          {page === "importer" && (
            <Importer
              state={state}
              mutate={mutate}
              notify={notify}
              navigate={navigate}
            />
          )}
          {page === "radar" && (
            <Radar
              state={state}
              mutate={mutate}
              notify={notify}
              confirm={setConfirm}
              navigate={navigate}
            />
          )}
          {page === "cuts" && (
            <SmartCuts
              state={state}
              mutate={mutate}
              notify={notify}
              navigate={navigate}
              presets={[...videoPresets, ...state.presets]}
            />
          )}
          {page === "captions" && (
            <Captions
              state={state}
              mutate={mutate}
              notify={notify}
              navigate={navigate}
              onUse={(t) => {
                setSettings((s) => ({ ...s, subtitleId: t.subtitleId }));
                if (
                  state.assets.some(
                    (a) => a.id === t.assetId && a.type === "video",
                  )
                )
                  setSelected([t.assetId]);
                navigate("editor");
                notify("Legenda aplicada ao vídeo no editor.");
              }}
            />
          )}
          {page === "accounts" && (
            <Accounts
              state={state}
              mutate={mutate}
              notify={notify}
              confirm={setConfirm}
            />
          )}
          {page === "publishing" && (
            <Publishing
              state={state}
              mutate={mutate}
              notify={notify}
              navigate={navigate}
            />
          )}
          {page === "library" && (
            <Library
              {...{
                state,
                mutate,
                selected,
                setSelected,
                uploading,
                notify,
                navigate,
              }}
              upload={() => uploadRef.current.click()}
              uploadFiles={uploadFiles}
              preview={setPreview}
              edit={(ids) => {
                setSelected(ids);
                navigate("editor");
              }}
              confirm={setConfirm}
            />
          )}
          {page === "exports" && (
            <Exports
              state={state}
              mutate={mutate}
              notify={notify}
              setPreview={setPreview}
              editFailed={(job) => {
                if (job.segments) {
                  navigate("cuts");
                  notify(
                    "Selecione a análise deste lote para revisar os intervalos dos trechos.",
                  );
                  return;
                }
                setSettings({ ...defaults, ...job.settings });
                setOverrides(job.overrides || {});
                setSelected([
                  ...new Set(
                    (
                      job.items?.filter((i) => i.status !== "done") ||
                      job.assetIds.map((assetId) => ({ assetId }))
                    ).map((i) => i.assetId),
                  ),
                ]);
                setProjectId(null);
                setProjectName(job.name + " · ajuste");
                navigate("editor");
              }}
            />
          )}
          {page === "calendar" && (
            <Calendar
              state={state}
              mutate={mutate}
              confirm={setConfirm}
              notify={notify}
              navigate={navigate}
            />
          )}
          {page === "automations" && (
            <Automations
              state={state}
              mutate={mutate}
              notify={notify}
              confirm={setConfirm}
            />
          )}
          {page === "analytics" && (
            <>
              <Analytics state={state} />
              <SocialMetrics state={state} mutate={mutate} notify={notify} />
            </>
          )}
          {page === "settings" && (
            <SettingsPage state={state} mutate={mutate} notify={notify} />
          )}
          {connectionError && (
            <div className="connection error" role="alert">
              <AlertCircle size={17} />
              <div>
                <b>Conexão interrompida</b>
                <p>
                  Seus rascunhos estão neste navegador. Tentaremos reconectar
                  automaticamente.
                </p>
              </div>
              <Button onClick={refresh} icon={RefreshCw}>
                Tentar agora
              </Button>
            </div>
          )}
          {!loaded && !connectionError && (
            <div className="connection">
              <Loader2 className="spin" size={15} /> Conectando ao estúdio…
            </div>
          )}
        </div>
        <footer className="app-footer">
          <span>
            COPEX STUDIO <i>•</i> Feito para criar.
          </span>
          <span>
            <span className="live-dot" /> Arquivos salvos neste ambiente
          </span>
        </footer>
      </main>
      {uploading && (
        <div className="upload-status">
          <Loader2 className="spin" size={18} /> Importando e preparando
          arquivos…
        </div>
      )}
      {toast && (
        <div role="status" className={"toast " + toast.type}>
          {toast.type === "error" ? (
            <AlertCircle size={19} />
          ) : (
            <CheckCircle2 size={19} />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)} wide>
          <div className="media-modal">
            {preview.type === "image" ? (
              <img src={preview.url} alt={preview.name} />
            ) : preview.type === "subtitle" ? (
              <a className="btn" href={preview.url} download>
                Baixar legendas SRT
              </a>
            ) : preview.type === "audio" ? (
              <audio controls src={preview.url} />
            ) : (
              <video controls autoPlay src={preview.url} />
            )}
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={confirm.title || "Excluir item?"}
          onClose={() => setConfirm(null)}
        >
          <p className="modal-text">
            {confirm.message ||
              "Esta ação remove o item deste estúdio. Ela não pode ser desfeita."}
          </p>
          <div className="modal-actions">
            <Button onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await confirm.action();
                setConfirm(null);
              }}
            >
              Excluir
            </Button>
          </div>
        </Modal>
      )}
      {commands && (
        <Modal title="Encontre no estúdio" onClose={() => setCommands(false)}>
          <div className="modal-body command-palette">
            <div className="search">
              <Search size={17} />
              <input
                autoFocus
                aria-label="Buscar telas e projetos"
                placeholder="O que você quer criar?"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    const target = nav.find(([, , label]) =>
                      label.toLowerCase().includes(commandQuery.toLowerCase()),
                    );
                    if (target) {
                      navigate(target[0]);
                      setCommands(false);
                    }
                  }
                }}
              />
            </div>
            <p className="eyebrow">FERRAMENTAS</p>
            {nav
              .filter(([, , label]) =>
                label.toLowerCase().includes(commandQuery.toLowerCase()),
              )
              .map(([id, Icon, label]) => (
                <button
                  className="command-result"
                  key={id}
                  onClick={() => {
                    navigate(id);
                    setCommands(false);
                  }}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            {state.projects.filter((p) =>
              p.name.toLowerCase().includes(commandQuery.toLowerCase()),
            ).length > 0 && <p className="eyebrow">SEUS PROJETOS</p>}
            {state.projects
              .filter((p) =>
                p.name.toLowerCase().includes(commandQuery.toLowerCase()),
              )
              .map((p) => (
                <button
                  className="command-result"
                  key={p.id}
                  onClick={() => {
                    openProject(p);
                    setCommands(false);
                  }}
                >
                  <FolderOpen size={18} />
                  <span>{p.name}</span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {design && (
        <DesignEditor
          initial={design}
          state={state}
          onClose={(keepDraft = false) => {
            if (!keepDraft) writeDraft("copex:design:v3", null);
            setDesignRecovery(keepDraft ? readDraft("copex:design:v3") : null);
            setDesign(null);
          }}
          mutate={mutate}
          notify={notify}
        />
      )}
    </div>
  );
}
function Dashboard({
  state,
  navigate,
  upload,
  applyPreset,
  openProject,
  onNewProject,
  recovery,
  setDesign,
  mutate,
  confirm,
}) {
  const outputs = state.jobs.reduce((n, j) => n + (j.outputs?.length || 0), 0);
  return (
    <>
      <PageHeading
        eyebrow="SEU ESPAÇO CRIATIVO"
        title="O estúdio é seu."
        description="Seu acervo, seus formatos, seu jeito de contar histórias."
      >
        <Button icon={Upload} onClick={upload}>
          Importar mídia
        </Button>
        <Button icon={Plus} variant="primary" onClick={onNewProject}>
          Novo projeto
        </Button>
      </PageHeading>
      {recovery && (
        <div className="recovery-banner">
          <FolderOpen size={20} />
          <div>
            <b>Uma ideia ficou na mesa: {recovery.doc.name}</b>
            <p>Seu design e os dados CSV estão guardados neste navegador.</p>
          </div>
          <Button
            icon={ArrowUpRight}
            onClick={() =>
              setDesign({
                ...recovery.doc,
                _draftCsv: recovery.csv,
                _draftFormat: recovery.format,
                recovered: true,
              })
            }
          >
            Retomar design
          </Button>
        </div>
      )}
      <div className="hero editorial-hero">
        <div className="hero-copy">
          <span className="pill">
            <span className="live-dot" /> ESTÚDIO INDEPENDENTE / EDIÇÃO 03
          </span>
          <h2>
            Boas histórias
            <br />
            merecem <em>render.</em>
          </h2>
          <p>
            Do primeiro frame ao último detalhe.
            <br />
            Um processo seu. Conteúdo em todas as versões.
          </p>
          <Button
            variant="primary"
            icon={ArrowUpRight}
            onClick={() => navigate("editor")}
          >
            Abrir editor em lote
          </Button>
          <span className="hero-note">
            CRIE COM INTENÇÃO. EXPORTE NO SEU RITMO.
          </span>
        </div>
        <StudioComposition />
        <span className="hero-edition">COPEX — CAMPO DE CRIAÇÃO</span>
      </div>
      <div className="stats-grid">
        {[
          [
            FolderOpen,
            state.assets.length,
            "Arquivos na biblioteca",
            "Seu conteúdo em um só lugar",
          ],
          [
            Clapperboard,
            state.projects.length,
            "Projetos salvos",
            "Continue de onde parou",
          ],
          [
            Download,
            outputs,
            "Arquivos exportados",
            "Ideias que saíram do papel",
          ],
          [
            CalendarDays,
            state.plans.filter((p) => p.status === "planned").length,
            "Conteúdos planejados",
            "Seu próximo passo, organizado",
          ],
        ].map(([Icon, n, label, desc]) => (
          <div className="stat-card" key={label}>
            <div>
              <span className="stat-icon">
                <Icon size={18} />
              </span>
              <span className="stat-number">{n}</span>
            </div>
            <b>{label}</b>
            <small>{desc}</small>
          </div>
        ))}
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>O que vamos criar hoje?</h2>
            <p>Um bom começo faz toda a diferença.</p>
          </div>
        </div>
        <div className="quick-grid">
          {[
            [
              Clapperboard,
              "Edição em lote",
              "Um ajuste. Todos os seus vídeos.",
              "editor",
            ],
            [
              Layers,
              "Explore os templates",
              "O ponto de partida da sua próxima ideia.",
              "templates",
            ],
            [
              CalendarDays,
              "Organize seu conteúdo",
              "Transforme inspiração em planejamento.",
              "calendar",
            ],
          ].map(([Icon, title, desc, p]) => (
            <button className="quick-card" key={p} onClick={() => navigate(p)}>
              <span className="quick-icon">
                <Icon size={22} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
              <ArrowUpRight size={20} />
            </button>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>
              Templates para sair do óbvio{" "}
              <span className="tag">CURADORIA COPEX</span>
            </h2>
            <p>Feitos para você adaptar, combinar e criar.</p>
          </div>
          <button className="text-btn" onClick={() => navigate("templates")}>
            Explorar todos <ArrowRight size={15} />
          </button>
        </div>
        <div className="template-grid home-templates">
          {videoPresets.slice(0, 4).map((p, i) => (
            <PresetCard
              key={p.id}
              preset={p}
              index={i}
              onClick={() => applyPreset(p)}
            />
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Seus projetos</h2>
            <p>O próximo passo de uma boa ideia.</p>
          </div>
        </div>
        {!state.projects.length ? (
          <div className="project-empty">
            <div className="empty-icon">
              <FolderOpen size={23} />
            </div>
            <div>
              <h3>Uma página em branco. Muitas possibilidades.</h3>
              <p>Salve seu primeiro projeto no editor para encontrá-lo aqui.</p>
            </div>
            <Button icon={Plus} onClick={() => navigate("editor")}>
              Criar projeto
            </Button>
          </div>
        ) : (
          <div className="project-grid">
            {state.projects.map((p) => (
              <div className="project-card" key={p.id}>
                <div className="project-cover" onClick={() => openProject(p)}>
                  <Clapperboard size={32} />
                  <span>
                    {p.settings.width} × {p.settings.height}
                  </span>
                </div>
                <div>
                  <h3>{p.name}</h3>
                  <small>
                    {p.assetIds.length} mídias · {dateFormat(p.createdAt)}
                  </small>
                </div>
                <div className="row">
                  <Button onClick={() => openProject(p)}>
                    Continuar edição
                  </Button>
                  <button
                    className="icon-btn"
                    aria-label="Excluir projeto"
                    onClick={() =>
                      confirm({
                        action: () => mutate("/projects/" + p.id, "DELETE"),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
function PresetCard({ preset: p, index = 0, onClick, remove, actions }) {
  return (
    <article className="template-card">
      <button
        className={"template-art art-" + (index % 6)}
        style={{ "--art-color": p.color || "#b9b0df" }}
        onClick={onClick}
      >
        <PresetPoster preset={p} index={index} />
        <div className="template-use">
          <Plus size={16} /> Usar template
        </div>
      </button>
      <div className="template-info">
        <div>
          <h3>{p.name}</h3>
          <p>
            {p.category || "Meu template"} <span>•</span> Vídeo
          </p>
        </div>
        {actions ||
          (remove ? (
            <button
              className="icon-btn"
              onClick={remove}
              aria-label="Excluir template"
            >
              <Trash2 size={16} />
            </button>
          ) : (
            <ArrowUpRight size={17} />
          ))}
      </div>
    </article>
  );
}
function Templates(props) {
  return (
    <TemplateLibrary
      {...props}
      builtinVideo={videoPresets}
      builtinDesign={templates}
      Card={PresetCard}
    />
  );
}
function BatchEditor({
  state,
  settings: s,
  setSettings,
  selected,
  setSelected,
  overrides,
  setOverrides,
  projectName,
  setProjectName,
  projectId,
  setProjectId,
  draftStatus,
  onNewProject,
  exportBatch,
  upload,
  uploading,
  mutate,
  notify,
}) {
  const [tab, setTab] = useState("Projeto"),
    [query, setQuery] = useState(""),
    [current, setCurrent] = useState(null),
    [scope, setScope] = useState("batch"),
    [presetName, setPresetName] = useState(""),
    [saveModal, setSaveModal] = useState(false),
    [saving, setSaving] = useState(false),
    [playing, setPlaying] = useState(false);
  const videoRef = useRef();
  const assets = state.assets.filter((a) =>
      ["video", "image"].includes(a.type),
    ),
    visible = assets.filter((a) =>
      a.name.toLowerCase().includes(query.toLowerCase()),
    );
  const asset =
    assets.find((a) => a.id === current) ||
    assets.find((a) => selected.includes(a.id));
  const effective = {
    ...s,
    ...(scope === "individual" && asset ? overrides[asset.id] || {} : {}),
  };
  const set = (key, value) => {
    if (scope === "individual" && asset)
      setOverrides((o) => ({
        ...o,
        [asset.id]: { ...o[asset.id], [key]: value },
      }));
    else setSettings((o) => ({ ...o, [key]: value }));
  };
  const e = effective;
  const active = state.jobs.filter((j) =>
    ["running", "queued"].includes(j.status),
  );
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = e.speed;
      videoRef.current.volume = Math.min(1, e.volume);
      videoRef.current.muted = e.mute;
    }
  }, [e.speed, e.volume, e.mute, asset?.id]);
  useEffect(() => {
    const media = videoRef.current;
    if (media && asset?.type === "video" && media.readyState > 0) {
      media.pause();
      media.currentTime = Math.min(
        Math.max(0, Number(e.start) || 0),
        Math.max(0, asset.duration - 0.01),
      );
    }
  }, [e.start, asset?.id]);
  const toggle = (id) =>
    setSelected((x) =>
      x.includes(id) ? x.filter((i) => i !== id) : [...x, id],
    );
  const saveProject = async (copy = false) => {
    setSaving(true);
    const duplicate = copy === true;
    const r = await mutate(
      projectId && !duplicate ? "/projects/" + projectId : "/projects",
      projectId && !duplicate ? "PUT" : "POST",
      {
        name: duplicate ? projectName + " · cópia" : projectName,
        settings: s,
        assetIds: selected,
        overrides,
      },
    );
    setSaving(false);
    if (r) {
      setProjectId(r.id);
      if (duplicate) setProjectName(r.name);
      notify(
        duplicate
          ? "Cópia salva como um novo projeto."
          : "Projeto salvo. Acesse-o na visão geral.",
      );
    }
  };
  useEffect(() => {
    const handler = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "s" &&
        !saveModal &&
        !saving &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        saveProject(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });
  const previewStyle = {
    filter: `brightness(${Math.max(0.05, 1 + e.brightness)}) contrast(${e.contrast}) saturate(${e.filter === "mono" ? 0 : e.saturation}) ${e.filter === "warm" ? "sepia(.2)" : e.filter === "vintage" ? "sepia(.5)" : ""}`,
    transform: `scaleX(${e.mirror ? -1 : 1}) rotate(${e.rotation}deg)`,
    objectFit: e.fit === "cover" ? "cover" : "contain",
  };
  const position =
    e.textPosition === "top"
      ? { top: "9%" }
      : e.textPosition === "center"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: "12%" };
  return (
    <>
      <PageHeading
        eyebrow="CREATOR STUDIO"
        title="Editor em lote"
        description="Um fluxo simples. Todos os seus vídeos, prontos para o próximo passo."
      >
        <Button
          icon={RotateCcw}
          onClick={() => {
            setSettings({ ...defaults });
            setOverrides({});
            notify("Ajustes restaurados.");
          }}
        >
          Restaurar ajustes
        </Button>
        <Button
          icon={Save}
          onClick={() => saveProject(false)}
          disabled={saving || !projectName.trim()}
        >
          {saving ? "Salvando…" : "Salvar projeto"}
        </Button>
        {projectId && (
          <Button
            icon={Copy}
            onClick={() => saveProject(true)}
            disabled={saving}
          >
            Salvar cópia
          </Button>
        )}
      </PageHeading>
      <div className="draft-ribbon">
        <span>
          <span className="live-dot" />
          {draftStatus === "saving"
            ? "Protegendo rascunho…"
            : draftStatus === "error"
              ? "Não foi possível salvar o rascunho neste navegador"
              : "Rascunho protegido neste navegador"}
        </span>
        <small>
          {projectId
            ? "Projeto aberto · salve para atualizar a versão no estúdio"
            : "Novo projeto · Ctrl S para salvar no estúdio"}
        </small>
        <button className="text-btn" onClick={onNewProject}>
          <Plus size={13} />
          Novo projeto
        </button>
      </div>
      <div className="editor-subbar">
        <input
          aria-label="Nome do projeto"
          className="project-name"
          value={projectName}
          onChange={(ev) => setProjectName(ev.target.value)}
        />
        <span>
          <span className="live-dot" />
          {selected.length} mídia(s) selecionada(s)
        </span>
        <span>
          <Monitor size={14} />
          {e.width} × {e.height}
        </span>
        <button className="text-btn" onClick={() => setSaveModal(true)}>
          <Layers size={14} /> Salvar como template
        </button>
      </div>
      <div className="editor-layout">
        <section className="panel media-panel">
          <div className="panel-title">
            <h3>
              <FolderOpen size={16} /> Mídias do projeto
            </h3>
            <span className="counter">{assets.length}</span>
          </div>
          <button
            className="upload-zone compact"
            onClick={upload}
            disabled={uploading}
          >
            <Upload size={24} />
            <b>{uploading ? "Importando…" : "Adicionar mídias"}</b>
            <small>Vídeos, imagens e áudios</small>
          </button>
          <div className="search small-search">
            <Search size={14} />
            <input
              placeholder="Buscar na biblioteca…"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
            />
          </div>
          <label className="select-all">
            <input
              type="checkbox"
              checked={
                visible.length > 0 &&
                visible.every((a) => selected.includes(a.id))
              }
              onChange={(ev) =>
                setSelected(
                  ev.target.checked
                    ? [...new Set([...selected, ...visible.map((a) => a.id)])]
                    : selected.filter(
                        (id) => !visible.some((a) => a.id === id),
                      ),
                )
              }
            />
            Selecionar visíveis <span>{selected.length}</span>
          </label>
          <div className="editor-media-list">
            {visible.map((a) => (
              <div
                className={
                  "editor-media " + (asset?.id === a.id ? "current" : "")
                }
                key={a.id}
              >
                <input
                  aria-label={"Selecionar " + a.name}
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <button onClick={() => setCurrent(a.id)}>
                  <Thumb asset={a} />
                  <div>
                    <b>{a.name}</b>
                    <small>
                      {a.width} × {a.height}
                      {overrides[a.id] && (
                        <span className="custom-badge">Individual</span>
                      )}
                    </small>
                  </div>
                </button>
              </div>
            ))}
            {!assets.length && (
              <Empty
                icon={Film}
                title="Sua história começa aqui"
                description="Importe mídias para montar seu primeiro lote."
              />
            )}
          </div>
          <div className="panel-foot">
            <span>
              {assets.filter((a) => a.type === "video").length} vídeos ·{" "}
              {assets.filter((a) => a.type === "image").length} imagens
            </span>
          </div>
        </section>
        <section className="panel preview-panel">
          <div className="panel-title">
            <h3>
              <Play size={16} /> Prévia do conteúdo
            </h3>
            <span className="subtle">
              {asset ? assets.indexOf(asset) + 1 : 0} / {assets.length}
            </span>
          </div>
          <div className="preview-stage">
            <div
              className={
                "video-canvas " +
                (e.width < e.height ? "portrait" : "landscape")
              }
              style={{
                aspectRatio: `${e.width}/${e.height}`,
                maxHeight: 450,
                width: e.width / e.height >= 1 ? "100%" : "auto",
                height: e.width / e.height < 1 ? 450 : "auto",
                background: "#080b0a",
              }}
            >
              {asset ? (
                <>
                  {asset.type === "video" ? (
                    <video
                      ref={videoRef}
                      key={asset.id}
                      src={asset.url}
                      style={previewStyle}
                      controls
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onLoadedMetadata={(ev) => {
                        ev.target.currentTime = Math.min(
                          e.start,
                          asset.duration,
                        );
                      }}
                      onTimeUpdate={(ev) => {
                        if (e.end > 0 && ev.target.currentTime > e.end) {
                          ev.target.pause();
                          ev.target.currentTime = e.start;
                        }
                      }}
                    />
                  ) : (
                    <img
                      src={asset.url}
                      style={previewStyle}
                      alt={asset.name}
                    />
                  )}{" "}
                  {e.text && (
                    <div
                      className={"preview-text " + (e.textBox ? "boxed" : "")}
                      style={{
                        ...position,
                        color: e.textColor,
                        fontSize: Math.max(
                          10,
                          Math.min(36, e.fontSize * (450 / e.height)),
                        ),
                        opacity: e.textOpacity,
                      }}
                    >
                      {e.text}
                    </div>
                  )}
                  {e.watermarkId &&
                    state.assets.find((a) => a.id === e.watermarkId) && (
                      <img
                        className={"watermark-preview " + e.watermarkPosition}
                        src={
                          state.assets.find((a) => a.id === e.watermarkId).url
                        }
                        alt="Marca d’água"
                        style={{
                          width: e.watermarkSize + "%",
                          opacity: e.watermarkOpacity,
                        }}
                      />
                    )}
                </>
              ) : (
                <div className="preview-placeholder">
                  <div className="preview-spark">✳</div>
                  <b>Seu conteúdo, em cena.</b>
                  <p>
                    Importe ou selecione uma mídia
                    <br />
                    para começar a criar.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="preview-caption">
            <span>{asset?.name || "Nenhuma mídia selecionada"}</span>
            <small>
              Prévia visual aproximada. Fades e mixagem são aplicados na
              exportação.
            </small>
          </div>
          <div className="trim-panel">
            <h4>
              <Scissors size={15} /> Corte e ritmo <span>Em segundos</span>
            </h4>
            <div className="form-grid">
              <NumberField
                label="Início"
                value={e.start}
                min={0}
                step={0.1}
                onChange={(v) => set("start", v)}
              />
              <NumberField
                label="Fim (0 = completo)"
                value={e.end}
                min={0}
                step={0.1}
                onChange={(v) => set("end", v)}
              />
            </div>
            <Range
              label="Velocidade"
              value={e.speed}
              min={0.25}
              max={4}
              step={0.05}
              suffix="×"
              onChange={(v) => set("speed", v)}
            />
            {asset?.type === "video" && (
              <small>
                Duração original: {time(asset.duration)} · Saída estimada:{" "}
                {time(
                  Math.max(0, ((e.end || asset.duration) - e.start) / e.speed),
                )}
              </small>
            )}
          </div>
        </section>
        <section className="panel settings-panel">
          <div className="panel-title">
            <h3>
              <SlidersHorizontal size={16} /> Ajustes do lote
            </h3>
            <span className="tag green">CRIATIVIDADE LIVRE</span>
          </div>
          <div className="editor-tabs">
            {[
              ["Projeto", Monitor],
              ["Imagem", ImageIcon],
              ["Texto", Type],
              ["Áudio", Volume2],
              ["Efeitos", Sparkles],
              ["Saída", Download],
            ].map(([t, Icon]) => (
              <button
                title={t}
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                <Icon size={16} />
                <span>{t}</span>
              </button>
            ))}
          </div>
          <div className="settings-scroll">
            <Field label="Aplicar template">
              <select
                value=""
                onChange={(ev) => {
                  const p = [...videoPresets, ...state.presets].find(
                    (x) => x.id === ev.target.value,
                  );
                  if (p) {
                    setSettings({ ...defaults, ...p.settings });
                    setOverrides({});
                    notify(`Template ${p.name} aplicado.`);
                  }
                }}
              >
                <option value="">Selecione um template…</option>
                {[
                  ...videoPresets,
                  ...state.presets.filter((p) => p.kind !== "design"),
                ].map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="scope-control">
              <button
                className={scope === "batch" ? "active" : ""}
                onClick={() => setScope("batch")}
              >
                Lote inteiro
              </button>
              <button
                className={scope === "individual" ? "active" : ""}
                disabled={!asset}
                onClick={() => setScope("individual")}
              >
                Só esta mídia
              </button>
            </div>
            {scope === "individual" && (
              <div className="inline-info">
                Ajustes individuais substituem os do lote.
                {overrides[asset?.id] && (
                  <button
                    onClick={() =>
                      setOverrides((o) => {
                        const n = { ...o };
                        delete n[asset.id];
                        return n;
                      })
                    }
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
            {tab === "Projeto" && (
              <>
                <h4 className="settings-section">Formato do projeto</h4>
                <div className="format-options">
                  {[
                    [1080, 1920, "9:16", "Vertical"],
                    [1080, 1080, "1:1", "Quadrado"],
                    [1920, 1080, "16:9", "Paisagem"],
                    [1080, 1350, "4:5", "Retrato"],
                  ].map(([w, h, ratio, label]) => (
                    <button
                      key={label}
                      className={
                        e.width === w && e.height === h ? "active" : ""
                      }
                      onClick={() => {
                        set("width", w);
                        set("height", h);
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: `${w}/${h}`,
                          width: w / h >= 1 ? 26 : 18,
                        }}
                      />
                      <b>{ratio}</b>
                      <small>{label}</small>
                    </button>
                  ))}
                </div>
                <div className="form-grid">
                  <NumberField
                    label="Largura (px)"
                    value={e.width}
                    min={128}
                    max={3840}
                    step={2}
                    onChange={(v) => set("width", v)}
                  />
                  <NumberField
                    label="Altura (px)"
                    value={e.height}
                    min={128}
                    max={3840}
                    step={2}
                    onChange={(v) => set("height", v)}
                  />
                </div>
                <Field label="Enquadramento">
                  <select
                    value={e.fit}
                    onChange={(ev) => set("fit", ev.target.value)}
                  >
                    <option value="cover">Preencher e recortar</option>
                    <option value="contain">Ajustar com bordas pretas</option>
                  </select>
                </Field>
                <Toggle
                  label="Espelhar horizontalmente"
                  checked={e.mirror}
                  onChange={(v) => set("mirror", v)}
                />
                <Field label="Rotação">
                  <select
                    value={e.rotation}
                    onChange={(ev) => set("rotation", Number(ev.target.value))}
                  >
                    {[0, 90, 180, 270].map((n) => (
                      <option key={n} value={n}>
                        {n}°
                      </option>
                    ))}
                  </select>
                </Field>
                <NumberField
                  label="Dividir vídeo a cada (segundos)"
                  value={e.splitSeconds}
                  min={0}
                  onChange={(v) => set("splitSeconds", v)}
                />
                <p className="help-text">
                  Use 0 para manter um único arquivo. Cada segmento é exportado
                  separadamente.
                </p>
              </>
            )}
            {tab === "Imagem" && (
              <>
                <h4 className="settings-section">Ajustes de imagem</h4>
                <Range
                  label="Brilho"
                  value={e.brightness}
                  min={-0.8}
                  max={0.8}
                  onChange={(v) => set("brightness", v)}
                />
                <Range
                  label="Contraste"
                  value={e.contrast}
                  min={0.2}
                  max={2}
                  onChange={(v) => set("contrast", v)}
                />
                <Range
                  label="Saturação"
                  value={e.saturation}
                  min={0}
                  max={2}
                  onChange={(v) => set("saturation", v)}
                />
                <h4 className="settings-section">Marca d’água</h4>
                <Field label="Imagem da marca">
                  <select
                    value={e.watermarkId}
                    onChange={(ev) => set("watermarkId", ev.target.value)}
                  >
                    <option value="">Sem marca d’água</option>
                    {state.assets
                      .filter((a) => a.type === "image")
                      .map((a) => (
                        <option value={a.id} key={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Button icon={Upload} onClick={upload}>
                  Importar logo
                </Button>
                {e.watermarkId && (
                  <>
                    <Range
                      label="Tamanho"
                      value={e.watermarkSize}
                      min={5}
                      max={60}
                      step={1}
                      suffix="%"
                      onChange={(v) => set("watermarkSize", v)}
                    />
                    <Range
                      label="Opacidade"
                      value={e.watermarkOpacity}
                      onChange={(v) => set("watermarkOpacity", v)}
                    />
                    <Field label="Posição">
                      <select
                        value={e.watermarkPosition}
                        onChange={(ev) =>
                          set("watermarkPosition", ev.target.value)
                        }
                      >
                        {[
                          ["top-left", "Superior esquerda"],
                          ["top-right", "Superior direita"],
                          ["bottom-left", "Inferior esquerda"],
                          ["bottom-right", "Inferior direita"],
                        ].map(([v, n]) => (
                          <option value={v} key={v}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
              </>
            )}
            {tab === "Texto" && (
              <>
                <h4 className="settings-section">Legendas do vídeo</h4>
                <Field label="Arquivo de legendas SRT">
                  <select
                    value={e.subtitleId || ""}
                    onChange={(ev) => set("subtitleId", ev.target.value)}
                  >
                    <option value="">Sem legendas</option>
                    {state.assets
                      .filter((a) => a.type === "subtitle")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Button icon={Upload} onClick={upload}>
                  Importar SRT
                </Button>
                <p className="help-text">
                  Legendas são gravadas no vídeo. O tempo acompanha o corte e a
                  velocidade. Para reconhecer fala, use a seção Legendas
                  automáticas.
                </p>
                <h4 className="settings-section">Uma mensagem. Todo o lote.</h4>
                <Field
                  label="Texto sobre a mídia"
                  hint="Quebras de linha são preservadas na exportação."
                >
                  <textarea
                    rows={5}
                    placeholder="Digite um título, CTA ou mensagem…"
                    value={e.text}
                    onChange={(ev) => set("text", ev.target.value)}
                  />
                </Field>
                <Range
                  label="Tamanho da fonte"
                  value={e.fontSize}
                  min={12}
                  max={180}
                  step={1}
                  suffix=" px"
                  onChange={(v) => set("fontSize", v)}
                />
                <div className="form-grid">
                  <Field label="Cor do texto">
                    <div className="color-control">
                      <input
                        type="color"
                        value={e.textColor}
                        onChange={(ev) => set("textColor", ev.target.value)}
                      />
                      <span>{e.textColor}</span>
                    </div>
                  </Field>
                  <Field label="Posição">
                    <select
                      value={e.textPosition}
                      onChange={(ev) => set("textPosition", ev.target.value)}
                    >
                      <option value="top">Superior</option>
                      <option value="center">Centro</option>
                      <option value="bottom">Inferior</option>
                    </select>
                  </Field>
                </div>
                <Range
                  label="Opacidade"
                  value={e.textOpacity}
                  onChange={(v) => set("textOpacity", v)}
                />
                <Toggle
                  label="Fundo de contraste"
                  hint="Melhora a legibilidade em vídeos."
                  checked={e.textBox}
                  onChange={(v) => set("textBox", v)}
                />
                <div className="info-box">
                  <Type size={19} />
                  <p>
                    Fonte DejaVu Sans Bold. Textos longos devem ser divididos em
                    linhas para caber no formato.
                  </p>
                </div>
              </>
            )}
            {tab === "Áudio" && (
              <>
                <h4 className="settings-section">
                  Som que acompanha sua ideia
                </h4>
                <Toggle
                  label="Silenciar áudio original"
                  checked={e.mute}
                  onChange={(v) => set("mute", v)}
                />
                <Toggle
                  label="Normalizar volume"
                  hint="Ajusta o áudio original para -16 LUFS."
                  checked={e.normalizeAudio}
                  onChange={(v) => set("normalizeAudio", v)}
                />
                <Range
                  label="Volume original"
                  value={e.volume}
                  min={0}
                  max={3}
                  step={0.05}
                  suffix="×"
                  onChange={(v) => set("volume", v)}
                />
                <Field label="Trilha de fundo">
                  <select
                    value={e.audioId}
                    onChange={(ev) => set("audioId", ev.target.value)}
                  >
                    <option value="">Sem trilha adicional</option>
                    {state.assets
                      .filter((a) => a.type === "audio")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Button icon={Upload} onClick={upload}>
                  Importar áudio
                </Button>
                <Range
                  label="Volume da trilha"
                  value={e.audioVolume}
                  min={0}
                  max={2}
                  step={0.05}
                  suffix="×"
                  onChange={(v) => set("audioVolume", v)}
                />
                <p className="help-text">
                  A trilha é repetida até completar a duração do vídeo. A
                  mixagem acontece na exportação.
                </p>
              </>
            )}
            {tab === "Efeitos" && (
              <>
                <h4 className="settings-section">A atmosfera certa</h4>
                <Toggle
                  label="Reduzir ruído visual"
                  hint="Aplica redução de ruído no vídeo."
                  checked={e.denoise}
                  onChange={(v) => set("denoise", v)}
                />
                <Toggle
                  label="Realçar nitidez"
                  checked={e.sharpen}
                  onChange={(v) => set("sharpen", v)}
                />
                <div className="filter-grid">
                  {[
                    ["none", "Original"],
                    ["mono", "P&B"],
                    ["warm", "Quente"],
                    ["cool", "Frio"],
                    ["vintage", "Vintage"],
                  ].map(([v, n]) => (
                    <button
                      className={e.filter === v ? "active" : ""}
                      key={v}
                      onClick={() => set("filter", v)}
                    >
                      <div className={"filter-swatch " + v} />
                      {n}
                    </button>
                  ))}
                </div>
                <Range
                  label="Fade de entrada"
                  value={e.fadeIn}
                  min={0}
                  max={5}
                  step={0.1}
                  suffix=" s"
                  onChange={(v) => set("fadeIn", v)}
                />
                <Range
                  label="Fade de saída"
                  value={e.fadeOut}
                  min={0}
                  max={5}
                  step={0.1}
                  suffix=" s"
                  onChange={(v) => set("fadeOut", v)}
                />
                <p className="help-text">
                  Fades e filtros de vídeo são renderizados pelo FFmpeg na
                  exportação final.
                </p>
              </>
            )}
            {tab === "Saída" && (
              <>
                <h4 className="settings-section">
                  Pronto para sair do estúdio
                </h4>
                <Field label="Qualidade do vídeo (CRF)">
                  <select
                    value={e.crf}
                    onChange={(ev) => set("crf", Number(ev.target.value))}
                  >
                    <option value={18}>Alta · arquivo maior (18)</option>
                    <option value={23}>Equilibrada · recomendada (23)</option>
                    <option value={28}>Compacta · arquivo menor (28)</option>
                  </select>
                </Field>
                <Field label="Quadros por segundo">
                  <select
                    value={e.fps}
                    onChange={(ev) => set("fps", Number(ev.target.value))}
                  >
                    {[24, 25, 30, 60].map((n) => (
                      <option value={n} key={n}>
                        {n} fps
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Formato de imagem">
                  <select
                    value={s.imageFormat || "png"}
                    onChange={(ev) =>
                      setSettings((x) => ({
                        ...x,
                        imageFormat: ev.target.value,
                      }))
                    }
                  >
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                    <option value="webp">WebP</option>
                  </select>
                </Field>
                <Field label="Prefixo dos arquivos">
                  <input
                    value={s.prefix || "copex"}
                    onChange={(ev) =>
                      setSettings((x) => ({ ...x, prefix: ev.target.value }))
                    }
                  />
                </Field>
                <div className="info-box">
                  <Download size={20} />
                  <p>
                    Vídeos em MP4 (H.264 + AAC). Os resultados são reunidos em
                    um ZIP, sem marca da plataforma.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
      <div className="export-bar">
        <div>
          <span className="export-icon">
            <CheckCircle2 size={22} />
          </span>
          <div>
            <b>
              {selected.length
                ? `${selected.length} mídia(s) no seu lote`
                : "Tudo pronto para começar"}
            </b>
            <small>
              {active.length
                ? `${active.length} exportação(ões) na fila`
                : "Os originais sempre são preservados."}
            </small>
          </div>
        </div>
        <div>
          <Button icon={Upload} onClick={upload}>
            Adicionar mídias
          </Button>
          <Button
            icon={Download}
            variant="primary"
            disabled={!selected.length || uploading}
            onClick={exportBatch}
          >
            Exportar lote <ArrowUpRight size={16} />
          </Button>
        </div>
      </div>
      {saveModal && (
        <Modal
          title="Salvar template de vídeo"
          onClose={() => setSaveModal(false)}
        >
          <div className="modal-body">
            <Field label="Nome do template">
              <input
                autoFocus
                placeholder="Ex.: Reels da minha marca"
                value={presetName}
                onChange={(ev) => setPresetName(ev.target.value)}
              />
            </Field>
            <p className="help-text">
              Os ajustes globais deste lote serão salvos. Mídias, cortes
              individuais e arquivos importados não fazem parte do template.
            </p>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setSaveModal(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!presetName.trim()}
              onClick={async () => {
                const r = await mutate("/presets", "POST", {
                  name: presetName,
                  kind: "video",
                  category: "Meus templates",
                  color: "#d9f473",
                  settings: s,
                });
                if (r) {
                  setSaveModal(false);
                  setPresetName("");
                  notify("Template salvo na sua coleção.");
                }
              }}
            >
              Salvar template
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Library(props) {
  return <MediaLibrary {...props} />;
}
function Exports(props) {
  return <ExportCenter {...props} />;
}
function Calendar({ state, mutate, confirm, notify, navigate }) {
  const [month, setMonth] = useState(new Date()),
    [modal, setModal] = useState(false),
    [form, setForm] = useState({
      title: "",
      date: "",
      time: "09:00",
      platform: "Instagram",
      caption: "",
      assetId: "",
    }),
    [picked, setPicked] = useState("");
  const year = month.getFullYear(),
    m = month.getMonth(),
    first = new Date(year, m, 1),
    days = new Date(year, m + 1, 0).getDate(),
    offset = (first.getDay() + 6) % 7;
  const key = (d) =>
    `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const today = new Date().toLocaleDateString("en-CA");
  const plans = state.plans
    .filter((p) => !picked || p.date === picked)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const create = (date) => {
    setForm({
      title: "",
      date: date || key(1),
      time: "09:00",
      platform: "Instagram",
      caption: "",
      assetId: "",
    });
    setModal(true);
  };
  const exportIcs = () => {
    const esc = (s) =>
      String(s || "")
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Copex//Studio//PT-BR",
    ];
    state.plans.forEach((p) =>
      lines.push(
        "BEGIN:VEVENT",
        `UID:${p.id}@copex`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
        `DTSTART:${p.date.replace(/-/g, "")}T${p.time.replace(":", "")}00`,
        `SUMMARY:${esc(p.title)}`,
        `DESCRIPTION:${esc(p.platform + "\n" + p.caption)}`,
        "END:VEVENT",
      ),
    );
    lines.push("END:VCALENDAR");
    downloadBlob(
      new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }),
      "copex-calendario.ics",
    );
  };
  return (
    <>
      <PageHeading
        eyebrow="CONSISTÊNCIA COMEÇA COM UM PLANO"
        title="Seu calendário criativo"
        description="Organize o conteúdo, prepare legendas e acompanhe o que já publicou."
      >
        <Button icon={Download} onClick={exportIcs}>
          Exportar agenda
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => create()}>
          Planejar conteúdo
        </Button>
      </PageHeading>
      <div className="info-banner">
        <CalendarDays size={22} />
        <div>
          <b>Planejamento local, no seu controle.</b>
          <p>
            Planejamentos locais e agendamentos conectados aparecem juntos.
            Gerencie os envios automáticos na seção Publicação.
          </p>
        </div>
      </div>
      <div className="calendar-layout">
        <section className="panel">
          <div className="calendar-heading">
            <div>
              <button
                className="icon-btn"
                aria-label="Mês anterior"
                onClick={() => setMonth(new Date(year, m - 1, 1))}
              >
                <ChevronLeft size={18} />
              </button>
              <h2>
                {month.toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <button
                className="icon-btn"
                aria-label="Próximo mês"
                onClick={() => setMonth(new Date(year, m + 1, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <Button
              onClick={() => {
                setMonth(new Date());
                setPicked("");
              }}
            >
              Hoje
            </Button>
          </div>
          <div className="calendar-grid">
            {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
              <div className="weekday" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div className="calendar-day disabled" key={"blank" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const d = i + 1,
                k = key(d),
                items = state.plans.filter((p) => p.date === k);
              return (
                <button
                  className={
                    "calendar-day " +
                    (today === k ? "today " : "") +
                    (picked === k ? "picked" : "")
                  }
                  key={k}
                  onClick={() => setPicked(picked === k ? "" : k)}
                  onDoubleClick={() => create(k)}
                >
                  <span>{d}</span>
                  {items.slice(0, 3).map((p) => (
                    <div
                      title={p.title}
                      key={p.id}
                      className={"calendar-event " + p.status}
                    >
                      {p.time} {p.title}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <small>+{items.length - 3} conteúdos</small>
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="panel plan-list">
          <div className="panel-title">
            <h3>
              {picked
                ? new Date(picked + "T12:00:00").toLocaleDateString("pt-BR")
                : "Conteúdos planejados"}
            </h3>
            <button
              className="icon-btn"
              aria-label="Adicionar conteúdo"
              onClick={() => create(picked)}
            >
              <Plus size={17} />
            </button>
          </div>
          {!plans.length ? (
            <Empty
              icon={CalendarDays}
              title="Um espaço para suas ideias"
              description="Planeje seu próximo conteúdo."
            />
          ) : (
            plans.map((p) => (
              <div className="plan-item" key={p.id}>
                <span
                  className={
                    "status " + (p.status === "published" ? "done" : "queued")
                  }
                >
                  {p.status === "published" ? "Publicado" : "Planejado"}
                </span>
                <h3>{p.title}</h3>
                <small>
                  {p.date.split("-").reverse().join("/")} · {p.time} ·{" "}
                  {p.platform}
                </small>
                <p>{p.caption}</p>
                <div className="row">
                  {p.publicationId ? (
                    <Button icon={Send} onClick={() => navigate("publishing")}>
                      Ver publicação
                    </Button>
                  ) : (
                    <>
                      {" "}
                      <button
                        className="text-btn"
                        onClick={() =>
                          mutate("/plans/" + p.id, "PUT", {
                            status:
                              p.status === "published"
                                ? "planned"
                                : "published",
                          })
                        }
                      >
                        <Check size={14} />
                        {p.status === "published"
                          ? "Voltar ao plano"
                          : "Marcar publicado"}
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Excluir conteúdo"
                        onClick={() =>
                          confirm({
                            action: () => mutate("/plans/" + p.id, "DELETE"),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </aside>
      </div>
      {modal && (
        <Modal title="Planejar novo conteúdo" onClose={() => setModal(false)}>
          <div className="modal-body">
            <Field label="Título">
              <input
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="A próxima grande ideia…"
              />
            </Field>
            <div className="form-grid">
              <Field label="Data">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </Field>
              <Field label="Horário local">
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Plataforma">
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              >
                {[
                  "Instagram",
                  "TikTok",
                  "YouTube",
                  "Facebook",
                  "LinkedIn",
                  "Outra",
                ].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Mídia de referência">
              <select
                value={form.assetId}
                onChange={(e) => setForm({ ...form, assetId: e.target.value })}
              >
                <option value="">Selecionar depois</option>
                {state.assets
                  .filter((a) => ["video", "image"].includes(a.type))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Legenda e hashtags">
              <textarea
                rows={4}
                value={form.caption}
                onChange={(e) => setForm({ ...form, caption: e.target.value })}
                placeholder="Conte sua história…"
              />
            </Field>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setModal(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!form.title.trim() || !form.date || !form.time}
              onClick={async () => {
                const r = await mutate("/plans", "POST", form);
                if (r) {
                  setModal(false);
                  notify("Conteúdo adicionado ao calendário.");
                }
              }}
            >
              Salvar planejamento
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Automations({ state, mutate, notify, confirm }) {
  const [name, setName] = useState(""),
    [presetId, setPresetId] = useState(""),
    [type, setType] = useState("video");
  const presets = [
    ...videoPresets,
    ...state.presets.filter((p) => p.kind !== "design"),
  ];
  const add = async () => {
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    const r = await mutate("/automations", "POST", {
      name,
      settings: p.settings,
      presetName: p.name,
      type,
      processed: [],
    });
    if (r) {
      setName("");
      notify("Receita criada. Execute quando quiser preparar novas mídias.");
    }
  };
  const execute = async (rule) => {
    const result = await mutate("/automations/" + rule.id + "/run", "POST", {});
    if (result?.job)
      notify(`${result.job.assetIds.length} arquivo(s) adicionado(s) à fila.`);
    else if (result) notify("Nenhuma mídia nova para esta receita.");
  };

  return (
    <>
      <PageHeading
        eyebrow="MENOS REPETIÇÃO. MAIS CRIAÇÃO."
        title="Suas receitas de produção"
        description="Aplique templates às novas mídias manualmente ou ao ativar a receita."
      />
      <div className="info-banner">
        <Zap size={22} />
        <div>
          <b>Receitas locais, manuais ou automáticas.</b>
          <p>
            As receitas processam arquivos importados. Não conectam contas
            sociais nem enviam mensagens.
          </p>
        </div>
      </div>
      <section className="panel automation-create">
        <h3>Nova receita</h3>
        <div className="automation-fields">
          <Field label="Nome">
            <input
              placeholder="Ex.: Reels da semana"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Template">
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de mídia">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="video">Vídeos</option>
              <option value="image">Imagens</option>
            </select>
          </Field>
          <Button
            variant="primary"
            icon={Plus}
            disabled={!name.trim() || !presetId}
            onClick={add}
          >
            Criar receita
          </Button>
        </div>
      </section>
      <div className="recipe-grid">
        {state.automations.map((r) => {
          const pending = state.assets.filter(
            (a) => a.type === r.type && !r.processed.includes(a.id),
          ).length;
          const job = state.jobs.find((j) => j.id === r.lastJobId);
          return (
            <article className="panel recipe-card" key={r.id}>
              <div className="row">
                <span className="quick-icon">
                  <Zap size={22} />
                </span>
                <button
                  className="icon-btn"
                  aria-label="Excluir receita"
                  onClick={() =>
                    confirm({
                      action: () => mutate("/automations/" + r.id, "DELETE"),
                    })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <h3>{r.name}</h3>
              <Toggle
                label="Executar automaticamente"
                checked={r.enabled}
                onChange={(v) =>
                  mutate("/automations/" + r.id, "PUT", { enabled: v })
                }
                hint="Verifica novas mídias a cada 10 segundos."
              />
              <p>
                {r.presetName} · {r.type === "video" ? "Vídeos" : "Imagens"}
              </p>
              <div className="recipe-flow">
                <FolderOpen size={17} />
                <ArrowRight size={14} />
                <Layers size={17} />
                <ArrowRight size={14} />
                <Download size={17} />
              </div>
              <small>
                {pending} nova(s) mídia(s) · {r.processed.length} enviada(s)
                para processamento
              </small>
              {job && (
                <p className="help-text">
                  Última execução:{" "}
                  {job.status === "done"
                    ? "concluída"
                    : job.status === "failed"
                      ? "falhou — reenvie os arquivos"
                      : "em processamento"}
                </p>
              )}
              <div className="row">
                <Button
                  icon={Play}
                  variant="primary"
                  disabled={!pending}
                  onClick={() => execute(r)}
                >
                  Executar receita
                </Button>
                {r.processed.length > 0 && (
                  <button
                    className="text-btn"
                    onClick={() =>
                      mutate("/automations/" + r.id, "PUT", { processed: [] })
                    }
                  >
                    Reiniciar seleção
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
function Analytics({ state }) {
  const done = state.jobs.filter((j) => j.status === "done"),
    failed = state.jobs.filter((j) => j.status === "failed"),
    output = state.jobs.flatMap((j) => j.outputs || []),
    totalBytes = output.reduce((n, o) => n + o.size, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d;
  });
  const counts = days.map((d) =>
    done
      .filter((j) => new Date(j.createdAt).toDateString() === d.toDateString())
      .reduce((n, j) => n + j.outputs.length, 0),
  );
  return (
    <>
      <PageHeading
        eyebrow="O RITMO DO SEU ESTÚDIO"
        title="Cada criação conta."
        description="Dados reais de produção e exportação deste ambiente."
      />
      <div className="stats-grid">
        {[
          [Download, output.length, "Arquivos exportados"],
          [CheckCircle2, done.length, "Lotes concluídos"],
          [AlertCircle, failed.length, "Lotes com erro"],
          [FolderOpen, bytes(totalBytes), "Mídia produzida"],
        ].map(([Icon, n, label]) => (
          <div className="stat-card" key={label}>
            <span className="stat-icon">
              <Icon size={19} />
            </span>
            <span className="stat-number">{n}</span>
            <b>{label}</b>
          </div>
        ))}
      </div>
      <div className="analytics-grid">
        <section className="panel chart-panel">
          <div className="section-heading">
            <h2>Seu ritmo de criação</h2>
            <span className="subtle">Últimos 7 dias</span>
          </div>
          <div className="bar-chart">
            {days.map((d, i) => (
              <div key={i}>
                <b>{counts[i]}</b>
                <div className="bar-track">
                  <div
                    style={{
                      height:
                        Math.max(
                          2,
                          (counts[i] / Math.max(1, ...counts)) * 100,
                        ) + "%",
                    }}
                  />
                </div>
                <small>
                  {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel chart-panel">
          <h2>Seu acervo</h2>
          {[
            ["video", "Vídeos", Film],
            ["image", "Imagens", ImageIcon],
            ["audio", "Áudios", Music2],
          ].map(([type, label, Icon]) => (
            <div className="acervo-row" key={type}>
              <Icon size={20} />
              <span>{label}</span>
              <b>{state.assets.filter((a) => a.type === type).length}</b>
            </div>
          ))}
          <p className="help-text">
            Métricas de alcance e engajamento das contas conectadas aparecem
            abaixo, separadas da produção local.
          </p>
        </section>
      </div>
    </>
  );
}
function Importer({ state, mutate, notify, navigate }) {
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="DO LINK PARA O SEU ESTÚDIO"
        title="Importar vídeos públicos"
        description="Traga conteúdos que você tem direito de usar para sua biblioteca."
      />
      <div className="panel settings-card">
        <h2>Link do vídeo</h2>
        <p>
          TikTok, Instagram ou YouTube. Cole o endereço de um vídeo específico,
          sem login.
        </p>
        <Field label="URL pública">
          <input
            type="url"
            placeholder="https://www.tiktok.com/@perfil/video/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          icon={Download}
          disabled={!url.trim() || busy}
          onClick={async () => {
            setBusy(true);
            const r = await mutate("/import-url", "POST", { url });
            setBusy(false);
            if (r) {
              setUrl("");
              notify("Importação iniciada. Acompanhe o resultado abaixo.");
            }
          }}
        >
          Importar vídeo
        </Button>
        <p className="help-text">
          Sites podem restringir downloads ou exigir autenticação. O importador
          não remove restrições de acesso. Para analisar perfis públicos e
          comparar métricas, use a seção Radar de conteúdo.
        </p>
      </div>
      <div className="info-banner">
        <AlertCircle size={22} />
        <div>
          <b>Acesso externo depende da rede do ambiente.</b>
          <p>
            Se houver bloqueio, baixe o arquivo pelo seu navegador e importe
            pela biblioteca. Não são necessárias senhas.
          </p>
        </div>
      </div>
      <div className="job-list">
        {(state.imports || []).map((t) => (
          <div className="panel settings-card" key={t.id}>
            <div className="row">
              <h3>
                {t.status === "running"
                  ? "Importando…"
                  : t.status === "done"
                    ? "Vídeo na biblioteca"
                    : "Importação não concluída"}
              </h3>
              <span
                className={
                  "status " +
                  (t.status === "done"
                    ? "done"
                    : t.status === "failed"
                      ? "failed"
                      : "running")
                }
              >
                {t.status === "running"
                  ? "Processando"
                  : t.status === "done"
                    ? "Concluída"
                    : "Erro"}
              </span>
            </div>
            <p style={{ wordBreak: "break-all", marginTop: 12 }}>{t.url}</p>
            {t.error && <pre className="error-detail">{t.error}</pre>}
            {t.status === "done" && (
              <Button icon={FolderOpen} onClick={() => navigate("library")}>
                Abrir biblioteca
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
function SettingsPage({ state, mutate, notify }) {
  const [brand, setBrand] = useState(state.brand),
    restoreRef = useRef();
  const restore = async (e) => {
    try {
      const b = JSON.parse(await e.target.files[0].text());
      const r = await mutate("/restore", "POST", b);
      if (r)
        notify(
          "Configurações restauradas. Arquivos de mídia não fazem parte do backup.",
        );
    } catch (err) {
      notify(err.message, "error");
    }
    e.target.value = "";
  };
  return (
    <>
      <PageHeading
        eyebrow="O ESTÚDIO TEM A SUA CARA"
        title="Configurações"
        description="Sua marca, seus arquivos e seu jeito de trabalhar."
      />
      <div className="settings-grid">
        <section className="panel settings-card">
          <h2>Identidade do espaço</h2>
          <p>Personalize o nome e a cor da sua marca.</p>
          <Field label="Nome da marca">
            <input
              value={brand.name}
              onChange={(e) => setBrand({ ...brand, name: e.target.value })}
            />
          </Field>
          <Field label="Cor principal">
            <div className="color-control">
              <input
                type="color"
                value={brand.color}
                onChange={(e) => setBrand({ ...brand, color: e.target.value })}
              />
              <span>{brand.color}</span>
            </div>
          </Field>
          <Button
            variant="primary"
            icon={Save}
            disabled={!brand.name.trim()}
            onClick={async () => {
              const r = await mutate("/brand", "PUT", brand);
              if (r) notify("Identidade salva.");
            }}
          >
            Salvar identidade
          </Button>
        </section>
        <section className="panel settings-card">
          <h2>Backup do espaço</h2>
          <p>
            Preserve templates, projetos, calendário e receitas em um arquivo
            JSON. Mídias e exportações devem ser copiadas separadamente da pasta
            .data.
          </p>
          <a className="btn" href="/api/backup">
            <Download size={16} /> Exportar configurações
          </a>
          <input
            ref={restoreRef}
            type="file"
            accept=".json"
            hidden
            onChange={restore}
          />
          <Button icon={Upload} onClick={() => restoreRef.current.click()}>
            Restaurar backup
          </Button>
          <div className="info-box">
            <FolderOpen size={22} />
            <p>
              Seus dados ficam na pasta <code>.data</code> deste ambiente. Faça
              uma cópia antes de excluir ou substituir a máquina.
            </p>
          </div>
        </section>
        <section className="panel settings-card">
          <h2>Sobre o Copex Studio</h2>
          <div className="version">
            3.0.1 <span>INDEPENDENT STUDIO EDITION</span>
          </div>
          <p>
            Uso individual, sem login, planos ou cotas comerciais. O
            processamento depende dos recursos disponíveis na sua máquina.
          </p>
          <ul className="feature-list">
            <li>
              <Check size={16} /> FFmpeg para processamento de vídeo
            </li>
            <li>
              <Check size={16} /> Sharp para criação e conversão de imagens
            </li>
            <li>
              <Check size={16} /> Arquivos originais preservados
            </li>
            <li>
              <Check size={16} /> Publicação somente em contas autorizadas
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function DesignEditor({ initial, state, onClose, mutate, notify }) {
  const [doc, setDoc] = useState(() => {
      const next = clone(initial);
      delete next._draftCsv;
      delete next._draftFormat;
      delete next.recovered;
      return next;
    }),
    [selected, setSelected] = useState(initial.elements[0]?.id),
    [history, setHistory] = useState([]),
    [future, setFuture] = useState([]),
    [csv, setCsv] = useState(
      initial._draftCsv ??
        "titulo,subtitulo,cta\nNovo drop.,O extraordinário chegou.,DESCUBRA AGORA →\nSua nova fase.,Design para todos os dias.,CONHEÇA A COLEÇÃO →",
    ),
    [dataOpen, setDataOpen] = useState(false),
    [rowIndex, setRowIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [format, setFormat] = useState(
      ["png", "jpeg", "webp"].includes(initial._draftFormat)
        ? initial._draftFormat
        : "png",
    ),
    [guides, setGuides] = useState(true);
  const [savedPresetId, setSavedPresetId] = useState(
      initial.saved ? initial.id : null,
    ),
    [saveBusy, setSaveBusy] = useState(false),
    [closeConfirm, setCloseConfirm] = useState(false);
  const savedSnapshot = useRef(initial.recovered ? "" : JSON.stringify(doc)),
    csvSnapshot = useRef(csv),
    exportController = useRef(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const designDraftStatus = useDraft("copex:design:v3", {
    doc: { ...doc, id: savedPresetId || doc.id, saved: !!savedPresetId },
    csv,
    format,
    open: true,
  });
  function requestClose() {
    if (
      JSON.stringify(doc) !== savedSnapshot.current ||
      csv !== csvSnapshot.current
    )
      setCloseConfirm(true);
    else onClose(false);
  }
  const dialogRef = useDialog(requestClose);
  const canvasRef = useRef(),
    areaRef = useRef(),
    drag = useRef(null),
    docRef = useRef(doc);
  const [canvasBounds, setCanvasBounds] = useState({ width: 500, height: 500 });
  docRef.current = doc;
  useEffect(() => {
    if (!areaRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setCanvasBounds({
        width: Math.max(100, r.width - 60),
        height: Math.max(100, r.height - 60),
      });
    });
    observer.observe(areaRef.current);
    return () => observer.disconnect();
  }, []);
  const canvasWidth = Math.min(
    canvasBounds.width,
    (canvasBounds.height * doc.width) / doc.height,
  );
  const update = (next) => {
    const previous = clone(docRef.current);
    setHistory((h) => [...h.slice(-49), previous]);
    setFuture([]);
    setDoc(typeof next === "function" ? next(docRef.current) : next);
  };
  const patch = (key, value) => update((d) => ({ ...d, [key]: value }));
  const element = doc.elements.find((x) => x.id === selected);
  const patchEl = (changes) =>
    update((d) => ({
      ...d,
      elements: d.elements.map((e) =>
        e.id === selected ? { ...e, ...changes } : e,
      ),
    }));
  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [clone(doc), ...f]);
    setDoc(history.at(-1));
    setHistory((h) => h.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, clone(doc)]);
    setDoc(future[0]);
    setFuture((f) => f.slice(1));
  };
  let rows = [],
    csvError = "";
  try {
    rows = parseCSV(csv);
  } catch (e) {
    csvError = e.message;
  }
  const row = rows[rowIndex] || {};
  const images = Object.fromEntries(
    state.assets.filter((a) => a.type === "image").map((a) => [a.id, a.url]),
  );
  const add = (type) => {
    const e = {
      id: uid(),
      type,
      x: 80,
      y: 80,
      width: doc.width * 0.65,
      height: type === "text" ? 180 : doc.height * 0.3,
      color: type === "text" ? "#25372e" : "#d9f473",
      fontSize: 72,
      text: "Sua próxima ideia.",
      bold: true,
      opacity: 1,
      radius: 0,
    };
    update((d) => ({ ...d, elements: [...d.elements, e] }));
    setSelected(e.id);
  };
  const addImage = (id) => {
    const a = state.assets.find((a) => a.id === id);
    if (!a) return;
    const w = doc.width * 0.6,
      e = {
        id: uid(),
        type: "image",
        assetId: id,
        x: 50,
        y: 50,
        width: w,
        height: (w * a.height) / a.width,
        opacity: 1,
      };
    update((d) => ({ ...d, elements: [...d.elements, e] }));
    setSelected(e.id);
  };
  const startDrag = (ev, e) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    setSelected(e.id);
    if (e.locked) return;
    const box = canvasRef.current.getBoundingClientRect();
    drag.current = {
      id: e.id,
      x: ev.clientX,
      y: ev.clientY,
      original: clone(doc),
      ex: e.x,
      ey: e.y,
      scale: doc.width / box.width,
    };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const move = (ev) => {
    const d = drag.current;
    if (!d) return;
    const dx = (ev.clientX - d.x) * d.scale,
      dy = (ev.clientY - d.y) * d.scale;
    if (d.resize) {
      const left = d.corner.includes("l"),
        top = d.corner.includes("t");
      const width = Math.max(20, d.ew + (left ? -dx : dx)),
        height = Math.max(20, d.eh + (top ? -dy : dy));
      setDoc((prev) => ({
        ...prev,
        elements: prev.elements.map((e) =>
          e.id === d.id
            ? {
                ...e,
                x: left ? d.ex + d.ew - width : d.ex,
                y: top ? d.ey + d.eh - height : d.ey,
                width,
                height,
              }
            : e,
        ),
      }));
    } else {
      const x = Math.round(d.ex + dx),
        y = Math.round(d.ey + dy);
      setDoc((prev) => ({
        ...prev,
        elements: prev.elements.map((e) =>
          e.id === d.id ? { ...e, x, y } : e,
        ),
      }));
    }
  };
  const startResize = (ev, e, corner) => {
    ev.stopPropagation();
    if (e.locked) return;
    const box = canvasRef.current.getBoundingClientRect();
    drag.current = {
      id: e.id,
      x: ev.clientX,
      y: ev.clientY,
      original: clone(doc),
      ex: e.x,
      ey: e.y,
      ew: e.width,
      eh: e.height,
      scale: doc.width / box.width,
      resize: true,
      corner,
    };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const stop = () => {
    if (drag.current) {
      const previous = drag.current.original;
      setHistory((h) => [...h.slice(-49), previous]);
      setFuture([]);
      drag.current = null;
    }
  };
  useEffect(() => {
    const handler = (ev) => {
      if (closeConfirm) return;
      if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        ev.shiftKey ? redo() : undo();
      }
      if (ev.key === "Delete" && selected) {
        update((d) => ({
          ...d,
          elements: d.elements.filter((x) => x.id !== selected),
        }));
        setSelected(null);
      }
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key) &&
        element &&
        !element.locked
      ) {
        ev.preventDefault();
        const step = ev.shiftKey ? 10 : 1;
        patchEl({
          x:
            element.x +
            (ev.key === "ArrowRight"
              ? step
              : ev.key === "ArrowLeft"
                ? -step
                : 0),
          y:
            element.y +
            (ev.key === "ArrowDown" ? step : ev.key === "ArrowUp" ? -step : 0),
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const exportDesign = async (batch) => {
    if (batch && (csvError || !rows.length))
      return notify(csvError || "Adicione linhas ao CSV.", "error");
    setBusy(true);
    exportController.current = new AbortController();
    try {
      const res = await fetch("/api/design/export", {
        signal: exportController.current.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, rows: batch ? rows : [row], format }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw Error(j.error);
      }
      downloadBlob(await res.blob(), "copex-designs.zip");
      notify(`${batch ? rows.length : 1} design(s) exportado(s).`);
    } catch (e) {
      if (e.name !== "AbortError") notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setSaveBusy(true);
    const r = await mutate(
      savedPresetId ? "/presets/" + savedPresetId : "/presets",
      savedPresetId ? "PUT" : "POST",
      { kind: "design", name: doc.name, doc },
    );
    setSaveBusy(false);
    if (r) {
      setSavedPresetId(r.id);
      savedSnapshot.current = JSON.stringify(doc);
      notify(
        savedPresetId
          ? "Design atualizado em Meus templates."
          : "Design salvo em Meus templates.",
      );
    }
  };
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saveBusy && !closeConfirm) save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="design-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Editor de design"
    >
      <header className="design-header">
        <div>
          <button
            className="icon-btn"
            onClick={requestClose}
            aria-label="Voltar"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <span className="eyebrow">
              COPEX / MESA DE DESIGN{" "}
              <span className="design-draft-status">
                {designDraftStatus === "saving"
                  ? "salvando rascunho…"
                  : designDraftStatus === "error"
                    ? "rascunho não salvo"
                    : "rascunho protegido"}
              </span>
            </span>
            <input
              className="project-name"
              value={doc.name}
              onChange={(e) => patch("name", e.target.value)}
            />
          </div>
        </div>
        <div>
          <button
            className="icon-btn"
            title="Desfazer"
            disabled={!history.length}
            onClick={undo}
          >
            <Undo2 size={19} />
          </button>
          <button
            className="icon-btn"
            title="Refazer"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={19} />
          </button>
          <Button
            icon={Save}
            onClick={save}
            disabled={saveBusy || !doc.name.trim()}
          >
            {saveBusy ? "Salvando…" : "Salvar template"}
          </Button>
          <Button
            variant="primary"
            icon={Download}
            disabled={busy}
            onClick={() => exportDesign(false)}
          >
            {busy ? "Exportando…" : "Exportar design"}
          </Button>
        </div>
      </header>
      <div className="design-layout">
        <aside className="design-left">
          <h3>Seu kit criativo</h3>
          <div className="design-add">
            <button onClick={() => add("text")}>
              <Type size={23} />
              Texto
            </button>
            <button onClick={() => add("rect")}>
              <Square size={23} />
              Forma
            </button>
          </div>
          <Field label="Adicionar imagem">
            <select value="" onChange={(e) => addImage(e.target.value)}>
              <option value="">Da biblioteca…</option>
              {state.assets
                .filter((a) => a.type === "image")
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <h4 className="settings-section">
            Camadas <span>{doc.elements.length}</span>
          </h4>
          <div className="layers">
            {[...doc.elements].reverse().map((e) => (
              <div
                className={"layer " + (e.id === selected ? "active" : "")}
                key={e.id}
              >
                <button onClick={() => setSelected(e.id)}>
                  {e.type === "text" ? (
                    <Type size={15} />
                  ) : e.type === "image" ? (
                    <ImageIcon size={15} />
                  ) : (
                    <Square size={15} />
                  )}
                  <span>
                    {e.type === "text"
                      ? e.text.slice(0, 22)
                      : e.type === "image"
                        ? "Imagem"
                        : "Forma"}
                  </span>
                </button>
                <button
                  className="icon-btn"
                  title="Alternar visibilidade"
                  onClick={() =>
                    update((d) => ({
                      ...d,
                      elements: d.elements.map((x) =>
                        x.id === e.id ? { ...x, hidden: !x.hidden } : x,
                      ),
                    }))
                  }
                >
                  {e.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            ))}
          </div>
          <div className="design-bottom">
            <Button icon={Layers} onClick={() => setDataOpen(!dataOpen)}>
              {dataOpen ? "Fechar dados" : "Criar em massa · CSV"}
            </Button>
            <p>Use {"{{titulo}}"} no texto e gere uma variação por linha.</p>
          </div>
        </aside>
        <section className="design-workspace">
          <div className="canvas-toolbar">
            <span>
              {doc.width} × {doc.height} px
            </span>
            <button className="text-btn" onClick={() => setGuides(!guides)}>
              <MousePointer2 size={14} />
              {guides ? "Ocultar seleção" : "Mostrar seleção"}
            </button>
          </div>
          <div className="canvas-area" ref={areaRef}>
            <div
              ref={canvasRef}
              className="design-canvas"
              style={{
                aspectRatio: `${doc.width}/${doc.height}`,
                width: canvasWidth,
                height: (canvasWidth * doc.height) / doc.width,
                background: doc.background,
              }}
              onPointerDown={(ev) => {
                if (ev.target === ev.currentTarget) setSelected(null);
              }}
            >
              {doc.elements
                .filter((e) => !e.hidden)
                .map((e) => {
                  const scale = 100 / doc.width;
                  const common = {
                    position: "absolute",
                    left: e.x * scale + "%",
                    top: (e.y / doc.height) * 100 + "%",
                    width: e.width * scale + "%",
                    height: (e.height / doc.height) * 100 + "%",
                    opacity: e.opacity ?? 1,
                    transform: `rotate(${e.rotation || 0}deg)`,
                    outline:
                      guides && selected === e.id
                        ? "2px solid #a485ff"
                        : undefined,
                    outlineOffset: "2px",
                    cursor: e.locked ? "not-allowed" : "move",
                    touchAction: "none",
                  };
                  return (
                    <div
                      key={e.id}
                      className="canvas-element"
                      style={common}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelected(e.id);
                      }}
                      onPointerDown={(ev) => startDrag(ev, e)}
                      onPointerMove={move}
                      onPointerUp={stop}
                      onPointerCancel={stop}
                    >
                      {e.type === "text" ? (
                        <svg
                          width="100%"
                          height="100%"
                          viewBox={`0 0 ${e.width} ${e.height}`}
                          preserveAspectRatio="xMinYMin meet"
                          style={{ overflow: "visible" }}
                        >
                          <text
                            fill={e.color}
                            fontFamily={e.fontFamily || "DejaVu Sans"}
                            fontSize={e.fontSize}
                            fontWeight={e.bold ? 700 : 400}
                            textAnchor={
                              e.align === "center"
                                ? "middle"
                                : e.align === "right"
                                  ? "end"
                                  : "start"
                            }
                          >
                            {interpolate(e.text, row)
                              .split("\n")
                              .map((line, i) => (
                                <tspan
                                  key={i}
                                  x={
                                    e.align === "center"
                                      ? e.width / 2
                                      : e.align === "right"
                                        ? e.width
                                        : 0
                                  }
                                  y={e.fontSize + i * e.fontSize * 1.18}
                                >
                                  {line}
                                </tspan>
                              ))}
                          </text>
                        </svg>
                      ) : e.type === "rect" ? (
                        <div
                          style={{
                            background: e.color,
                            borderRadius:
                              ((e.radius || 0) / e.width) * 100 + "%",
                            width: "100%",
                            height: "100%",
                          }}
                        />
                      ) : (
                        <img
                          src={images[e.assetId] || e.dataUrl}
                          alt="Camada"
                          draggable={false}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                      {guides && selected === e.id && !e.locked && (
                        <>
                          {["tl", "tr", "bl", "br"].map((c) => (
                            <i
                              key={c}
                              className={"handle " + c}
                              onPointerDown={(ev) => startResize(ev, e, c)}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="canvas-footer">
            <span>
              Arraste para mover · Setas para ajustar · Delete para excluir
            </span>
            <span>
              {rowIndex + 1} / {Math.max(1, rows.length)} variações
            </span>
          </div>
          {dataOpen && (
            <div className="csv-panel">
              <div className="row">
                <h3>Criação em massa</h3>
                <div className="row">
                  <input
                    type="file"
                    accept=".csv"
                    id="csv-file"
                    hidden
                    onChange={async (e) => {
                      if (e.target.files[0]) {
                        setCsv(await e.target.files[0].text());
                        setRowIndex(0);
                      }
                    }}
                  />
                  <label className="btn" htmlFor="csv-file">
                    <Upload size={14} /> Importar CSV
                  </label>
                  <Button
                    variant="primary"
                    disabled={busy || !!csvError || !rows.length}
                    onClick={() => exportDesign(true)}
                  >
                    Exportar {rows.length} variações
                  </Button>
                </div>
              </div>
              <textarea
                aria-label="Dados CSV"
                rows={4}
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setRowIndex(0);
                }}
              />
              {csvError ? (
                <p className="error-text">{csvError}</p>
              ) : (
                <div className="row">
                  <small>
                    {rows.length} linhas · Campos:{" "}
                    {Object.keys(rows[0] || {}).join(", ")}
                  </small>
                  <div className="row">
                    <button
                      className="icon-btn"
                      aria-label="Variação anterior"
                      disabled={rowIndex === 0}
                      onClick={() => setRowIndex((i) => i - 1)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span>{rowIndex + 1}</span>
                    <button
                      className="icon-btn"
                      aria-label="Próxima variação"
                      disabled={rowIndex >= rows.length - 1}
                      onClick={() => setRowIndex((i) => i + 1)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        <aside className="design-right">
          <h3>{element ? "Propriedades da camada" : "Seu design"}</h3>
          {element ? (
            <>
              <div className="form-grid">
                <NumberField
                  label="X"
                  disabled={element.locked}
                  value={element.x}
                  onChange={(v) => patchEl({ x: v })}
                />
                <NumberField
                  label="Y"
                  disabled={element.locked}
                  value={element.y}
                  onChange={(v) => patchEl({ y: v })}
                />
                <NumberField
                  label="Largura"
                  disabled={element.locked}
                  value={element.width}
                  min={1}
                  onChange={(v) => patchEl({ width: Math.max(1, v) })}
                />
                <NumberField
                  label="Altura"
                  disabled={element.locked}
                  value={element.height}
                  min={1}
                  onChange={(v) => patchEl({ height: Math.max(1, v) })}
                />
              </div>
              {element.type === "text" && (
                <>
                  <Field label="Texto">
                    <textarea
                      rows={5}
                      value={element.text}
                      onChange={(e) => patchEl({ text: e.target.value })}
                    />
                  </Field>
                  <Field label="Família da fonte">
                    <select
                      value={element.fontFamily || "DejaVu Sans"}
                      onChange={(e) => patchEl({ fontFamily: e.target.value })}
                    >
                      <option value="DejaVu Sans">Sans · Essencial</option>
                      <option value="DejaVu Serif">Serif · Editorial</option>
                      <option value="DejaVu Sans Mono">Mono · Técnico</option>
                    </select>
                  </Field>
                  <NumberField
                    label="Tamanho da fonte"
                    value={element.fontSize}
                    min={8}
                    max={500}
                    onChange={(v) => patchEl({ fontSize: v })}
                  />
                  <Toggle
                    label="Negrito"
                    checked={element.bold}
                    onChange={(v) => patchEl({ bold: v })}
                  />
                  <Field label="Alinhamento">
                    <select
                      value={element.align || "left"}
                      onChange={(e) => patchEl({ align: e.target.value })}
                    >
                      <option value="left">Esquerda</option>
                      <option value="center">Centro</option>
                      <option value="right">Direita</option>
                    </select>
                  </Field>
                </>
              )}
              {element.type !== "image" && (
                <Field label="Cor">
                  <div className="color-control">
                    <input
                      type="color"
                      value={element.color}
                      onChange={(e) => patchEl({ color: e.target.value })}
                    />
                    <span>{element.color}</span>
                  </div>
                </Field>
              )}
              {element.type === "rect" && (
                <NumberField
                  label="Cantos arredondados"
                  value={element.radius || 0}
                  min={0}
                  onChange={(v) => patchEl({ radius: v })}
                />
              )}
              <Range
                label="Opacidade"
                value={element.opacity ?? 1}
                onChange={(v) => patchEl({ opacity: v })}
              />
              <Range
                label="Rotação"
                value={element.rotation || 0}
                min={-180}
                max={180}
                step={1}
                suffix="°"
                onChange={(v) => patchEl({ rotation: v })}
              />
              <Toggle
                label="Bloquear posição"
                hint="Impede mover, redimensionar e ajustar com as setas."
                checked={element.locked}
                onChange={(v) => patchEl({ locked: v })}
              />
              <div className="layer-actions">
                <Button
                  icon={Copy}
                  onClick={() => {
                    const e = {
                      ...clone(element),
                      id: uid(),
                      x: element.x + 20,
                      y: element.y + 20,
                    };
                    update((d) => ({ ...d, elements: [...d.elements, e] }));
                    setSelected(e.id);
                  }}
                >
                  Duplicar
                </Button>
                <Button
                  icon={Trash2}
                  onClick={() => {
                    update((d) => ({
                      ...d,
                      elements: d.elements.filter((x) => x.id !== selected),
                    }));
                    setSelected(null);
                  }}
                >
                  Excluir
                </Button>
                <Button
                  icon={MoveUp}
                  onClick={() =>
                    update((d) => {
                      const arr = [...d.elements],
                        i = arr.findIndex((x) => x.id === selected);
                      if (i < arr.length - 1)
                        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                      return { ...d, elements: arr };
                    })
                  }
                >
                  Avançar
                </Button>
                <Button
                  icon={MoveDown}
                  onClick={() =>
                    update((d) => {
                      const arr = [...d.elements],
                        i = arr.findIndex((x) => x.id === selected);
                      if (i > 0) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
                      return { ...d, elements: arr };
                    })
                  }
                >
                  Recuar
                </Button>
              </div>
              <Button onClick={() => setSelected(null)}>
                Editar fundo e formato
              </Button>
            </>
          ) : (
            <>
              <Field label="Formato">
                <select
                  value=""
                  onChange={(e) => {
                    const p = sizes[Number(e.target.value)];
                    if (p) update((d) => ({ ...d, width: p.w, height: p.h }));
                  }}
                >
                  <option value="">Personalizado</option>
                  {sizes.map((p, i) => (
                    <option value={i} key={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <NumberField
                  label="Largura"
                  min={128}
                  max={4096}
                  value={doc.width}
                  onChange={(v) =>
                    patch("width", Math.min(4096, Math.max(128, v)))
                  }
                />
                <NumberField
                  label="Altura"
                  min={128}
                  max={4096}
                  value={doc.height}
                  onChange={(v) =>
                    patch("height", Math.min(4096, Math.max(128, v)))
                  }
                />
              </div>
              <Field label="Cor de fundo">
                <div className="color-control">
                  <input
                    type="color"
                    value={doc.background}
                    onChange={(e) => patch("background", e.target.value)}
                  />
                  <span>{doc.background}</span>
                </div>
              </Field>
              <Button onClick={() => patch("background", state.brand.color)}>
                Usar cor da marca
              </Button>
              <Field label="Formato da exportação">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WebP</option>
                </select>
              </Field>
              <p className="help-text">
                O exportador gera imagens na resolução original do design.
                Selecione uma camada para editar seus detalhes.
              </p>
            </>
          )}
        </aside>
      </div>
      {closeConfirm && (
        <Modal
          title="Guardar este design?"
          onClose={() => setCloseConfirm(false)}
        >
          <div className="modal-body">
            <p>
              Há alterações no design ou nos dados CSV. Você pode guardar o
              rascunho neste navegador e retomar pela visão geral.
            </p>
            <small>
              O botão Salvar template guarda o layout no estúdio; os dados CSV
              ficam no rascunho.
            </small>
          </div>
          <div className="modal-actions">
            <Button variant="danger" onClick={() => onClose(false)}>
              Descartar e sair
            </Button>
            <Button onClick={() => setCloseConfirm(false)}>
              Continuar edição
            </Button>
            <Button
              variant="primary"
              icon={Save}
              onClick={() => {
                const stored = writeDraft("copex:design:v3", {
                  doc: {
                    ...doc,
                    id: savedPresetId || doc.id,
                    saved: !!savedPresetId,
                  },
                  csv,
                  format,
                  open: false,
                });
                if (!stored) {
                  notify(
                    "Espaço do navegador insuficiente. Salve o template e exporte o CSV antes de sair.",
                    "error",
                  );
                  return;
                }
                onClose(true);
              }}
            >
              Guardar e sair
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
