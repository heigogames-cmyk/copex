import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Upload,
  Download,
  Search,
  Star,
  Copy,
  Pencil,
  Trash2,
  ArrowUpRight,
  Layers,
  Film,
  Image as ImageIcon,
} from "lucide-react";
import { Button, Field, Modal, PageHeading, Empty } from "./studio-ui.jsx";
import { readDraft, writeDraft, downloadJSON } from "./drafts.js";
import { templateSVG } from "../shared/core.js";
export function TemplateLibrary({
  state,
  applyPreset,
  setDesign,
  mutate,
  notify,
  confirm,
  builtinVideo,
  builtinDesign,
  Card,
}) {
  const [query, setQuery] = useState(""),
    [tab, setTab] = useState("Todos"),
    [kind, setKind] = useState("Vídeo"),
    [rename, setRename] = useState(null),
    [busy, setBusy] = useState(false);
  const input = useRef(),
    migrating = useRef(false);
  const [pinBusy, setPinBusy] = useState([]);
  const pins =
    state.preferences?.pinnedTemplates ||
    readDraft("copex:pinned-templates", []);
  useEffect(() => {
    if (!state.preferences || migrating.current) return;
    const stored = readDraft("copex:pinned-templates", []);
    const legacy = stored.filter(
      (id) => typeof id === "string" && /^[-\w]{1,120}$/.test(id),
    );
    if (!legacy.length) {
      if (stored.length) writeDraft("copex:pinned-templates", null);
      return;
    }
    migrating.current = true;
    mutate("/preferences/pinned-templates", "POST", { ids: legacy })
      .then((r) => {
        if (r) writeDraft("copex:pinned-templates", null);
      })
      .finally(() => {
        migrating.current = false;
      });
  }, [state.preferences]);
  const videos = [
    ...builtinVideo,
    ...state.presets.filter((p) => p.kind !== "design"),
  ];
  const designs = [
    ...builtinDesign.map((p) => ({ ...p, kind: "design" })),
    ...state.presets
      .filter((p) => p.kind === "design")
      .map((p) => ({
        ...p.doc,
        id: p.id,
        name: p.name,
        kind: "design",
        saved: true,
        category: p.category,
        _draftCsv: p.datasetCsv,
        _draftFormat: p.exportFormat,
      })),
  ];
  const matches = (p) =>
    (tab === "Todos" ||
      (tab === "Favoritos" && pins.includes(p.id)) ||
      (tab === "Meus templates" && state.presets.some((t) => t.id === p.id)) ||
      p.category === tab) &&
    p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const visible = (kind === "Vídeo" ? videos : designs).filter(matches);
  const pinned = async (id) => {
    if (pinBusy.includes(id)) return;
    setPinBusy((ids) => [...ids, id]);
    try {
      await mutate(
        "/preferences/pinned-templates/" + encodeURIComponent(id),
        "PUT",
        { pinned: !pins.includes(id) },
      );
    } finally {
      setPinBusy((ids) => ids.filter((v) => v !== id));
    }
  };
  const source = (p) =>
    state.presets.find((t) => t.id === p.id) ||
    (p.kind === "design"
      ? { kind: "design", name: p.name, category: p.category, doc: p }
      : p);
  const fullSource = async (p) =>
    state.presets.some((t) => t.id === p.id)
      ? await mutate("/presets/" + p.id, "GET")
      : source(p);
  const openDesign = async (p) => {
    if (p.saved) {
      const saved = await fullSource(p);
      if (saved)
        setDesign({
          ...saved.doc,
          id: saved.id,
          saved: true,
          _draftCsv: saved.datasetCsv,
          _draftFormat: saved.exportFormat,
        });
    } else setDesign(JSON.parse(JSON.stringify(p)));
  };
  const duplicate = async (p) => {
    const original = await fullSource(p);
    if (!original) return;
    const r = await mutate("/presets", "POST", {
      ...original,
      id: undefined,
      name: original.name + " · cópia",
    });
    if (r) {
      setTab("Meus templates");
      notify("Template duplicado. Edite a cópia para criar sua versão.");
    }
  };
  const exportTemplate = async (p) => {
    try {
      let bundle = {
        format: "copex-template",
        version: 1,
        template: source(p),
      };
      if (state.presets.some((t) => t.id === p.id)) {
        const response = await fetch("/api/presets/" + p.id + "/export");
        bundle = await response.json();
        if (!response.ok)
          throw Error(bundle.error || "Não foi possível exportar o template.");
      }
      downloadJSON(bundle, p.name + ".copex.json");
      if (bundle.warnings?.length) notify(bundle.warnings.join(" "));
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const actions = (p) => (
    <div className="template-actions">
      <button
        className={"icon-btn " + (pins.includes(p.id) ? "pinned" : "")}
        aria-label={"Favoritar " + p.name}
        aria-pressed={pins.includes(p.id)}
        disabled={pinBusy.includes(p.id)}
        title="Favoritar"
        onClick={() => pinned(p.id)}
      >
        <Star size={14} fill={pins.includes(p.id) ? "currentColor" : "none"} />
      </button>
      <button
        className="icon-btn"
        aria-label={"Duplicar " + p.name}
        title="Duplicar"
        onClick={() => duplicate(p)}
      >
        <Copy size={14} />
      </button>
      <button
        className="icon-btn"
        aria-label={"Exportar " + p.name}
        title="Exportar template"
        onClick={() => exportTemplate(p)}
      >
        <Download size={14} />
      </button>
      {state.presets.some((t) => t.id === p.id) && (
        <>
          <button
            className="icon-btn"
            aria-label={"Renomear " + p.name}
            title="Renomear"
            onClick={() => setRename({ id: p.id, name: p.name })}
          >
            <Pencil size={14} />
          </button>
          <button
            className="icon-btn"
            aria-label={"Excluir " + p.name}
            title="Excluir"
            onClick={() =>
              confirm({ action: () => mutate("/presets/" + p.id, "DELETE") })
            }
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
  const importFile = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const image =
        /^image\/(png|jpeg|webp)$/i.test(file.type) ||
        /\.(png|jpe?g|webp)$/i.test(file.name);
      const video =
        /^video\//i.test(file.type) ||
        /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name);
      if (image || video) {
        if (image && file.size > 50 * 1024 * 1024)
          throw Error("A imagem deve ter até 50 MB.");
        const form = new FormData();
        form.append("files", file);
        const response = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });
        const uploaded = await response.json();
        if (!response.ok)
          throw Error(uploaded.error || "Não foi possível importar o arquivo.");
        const asset = uploaded.assets?.find(
          (a) => a.type === (video ? "video" : "image"),
        );
        if (!asset)
          throw Error(
            uploaded.errors?.[0]?.error ||
              (video
                ? "Use um vídeo válido, como MP4, MOV ou WebM."
                : "Use uma imagem PNG, JPG ou WebP válida."),
          );
        const name =
          file.name.replace(/\.[^.]+$/, "").slice(0, 120) ||
          "Template da galeria";
        if (video) {
          const saved = await mutate("/presets", "POST", {
            kind: "video",
            name,
            category: "Meus templates",
            sourceAssetId: asset.id,
            settings: {
              width: Math.max(128, Math.min(4096, asset.width)),
              height: Math.max(128, Math.min(4096, asset.height)),
            },
          });
          if (saved) {
            setKind("Vídeo");
            setTab("Meus templates");
            setQuery("");
            applyPreset(saved, asset);
          }
          return;
        }
        const factor = Math.min(1, 4096 / Math.max(asset.width, asset.height));
        const width = Math.max(128, Math.round(asset.width * factor));
        const height = Math.max(128, Math.round(asset.height * factor));
        const fit = Math.min(width / asset.width, height / asset.height);
        const imageWidth = asset.width * fit,
          imageHeight = asset.height * fit;
        const saved = await mutate("/presets", "POST", {
          kind: "design",
          name,
          category: "Meus templates",
          doc: {
            name,
            width,
            height,
            background: "#ffffff",
            elements: [
              {
                id: "base-image",
                type: "image",
                assetId: asset.id,
                x: (width - imageWidth) / 2,
                y: (height - imageHeight) / 2,
                width: imageWidth,
                height: imageHeight,
                locked: true,
              },
            ],
          },
        });
        if (saved) {
          setKind("Design");
          setTab("Meus templates");
          setQuery("");
          notify(
            "Imagem salva como template. A arte é uma camada única; adicione textos e outras camadas por cima.",
          );
          setDesign({ ...saved.doc, id: saved.id, saved: true });
        }
        return;
      }
      if (
        !/\.json$/i.test(file.name) &&
        !/^(application|text)\/(json|plain)$/i.test(file.type)
      )
        throw Error(
          "Escolha uma imagem, um vídeo da galeria ou um template .copex.json.",
        );
      if (file.size > 12 * 1024 * 1024)
        throw Error("O arquivo do template deve ter até 12 MB.");
      const content = JSON.parse(await file.text());
      const r = await mutate("/presets/import", "POST", content);
      if (r) {
        setKind(r.template.kind === "design" ? "Design" : "Vídeo");
        setTab("Meus templates");
        setQuery("");
        notify(
          "Template importado." +
            (r.warnings.length ? " " + r.warnings.join(" ") : ""),
        );
      }
    } catch (e) {
      notify(
        e instanceof SyntaxError
          ? "O arquivo JSON está inválido. Você também pode importar uma imagem PNG, JPG ou WebP."
          : e.message,
        "error",
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };
  return (
    <>
      <input
        type="file"
        accept=".json,.png,.jpg,.jpeg,.webp,.mp4,.mov,.m4v,.webm,.mkv,.avi,application/json,image/png,image/jpeg,image/webp,video/*"
        aria-label="Importar template ou imagem"
        hidden
        ref={input}
        onChange={importFile}
      />
      <PageHeading
        eyebrow="BIBLIOTECA DE ESTILOS / COPEX ORIGINALS"
        title="Uma assinatura para cada história."
        description="Um ponto de partida, nunca um ponto final. Escolha, transforme e faça seu."
      >
        <Button
          icon={Upload}
          disabled={busy}
          onClick={() => input.current.click()}
        >
          {busy ? "Importando…" : "Importar template"}
        </Button>
        <Button
          icon={Plus}
          variant="primary"
          onClick={() =>
            setDesign({
              name: "Design sem título",
              width: 1080,
              height: 1080,
              background: "#e9e6dd",
              elements: [],
            })
          }
        >
          Criar design
        </Button>
      </PageHeading>
      <div className="catalog-intro">
        <span className="catalog-index">C / 03</span>
        <div>
          <b>O seu estilo é o que fica.</b>
          <p>
            Vídeos com consistência. Designs com liberdade. Seus favoritos
            sempre por perto.
          </p>
        </div>
        <Layers size={35} strokeWidth={1} />
      </div>
      <div className="toolbar catalog-toolbar">
        <div className="segmented">
          {[
            ["Vídeo", Film],
            ["Design", ImageIcon],
          ].map(([name, Icon]) => (
            <button
              key={name}
              aria-label={name}
              aria-pressed={kind === name}
              className={kind === name ? "active" : ""}
              onClick={() => setKind(name)}
            >
              <Icon size={16} />
              {name}
              <span>{name === "Vídeo" ? videos.length : designs.length}</span>
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={16} />
          <input
            aria-label="Buscar templates"
            placeholder="Encontre um estilo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="filter-tabs">
        {[
          "Todos",
          "Social",
          "Vídeo",
          "Promoção",
          "Stories",
          "Favoritos",
          "Meus templates",
        ].map((t) => (
          <button
            aria-pressed={tab === t}
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t === "Favoritos" && <Star size={12} />} {t}
          </button>
        ))}
      </div>
      <div className="collection-caption">
        <span>
          {tab === "Todos" ? "A COLEÇÃO COMPLETA" : tab.toLocaleUpperCase()}
        </span>
        <span>
          {visible.length} {visible.length === 1 ? "template" : "templates"}
        </span>
      </div>
      {!visible.length ? (
        <Empty
          icon={Layers}
          title={
            tab === "Favoritos"
              ? "Guarde seus próximos favoritos."
              : "Nenhum estilo por aqui ainda."
          }
          description={
            tab === "Favoritos"
              ? "Toque na estrela de um template para encontrá-lo nesta coleção."
              : "Experimente outro filtro, importe um arquivo ou salve um template no editor."
          }
        >
          <Button
            onClick={() => {
              setTab("Todos");
              setQuery("");
            }}
          >
            Explorar coleção
          </Button>
        </Empty>
      ) : (
        <div
          className={
            "template-grid " + (kind === "Design" ? "design-grid" : "")
          }
        >
          {visible.map((p, i) =>
            kind === "Vídeo" ? (
              <Card
                key={p.id}
                preset={{
                  ...p,
                  thumbnail: state.assets.find((a) => a.id === p.sourceAssetId)
                    ?.thumbnail,
                }}
                index={videos.findIndex((v) => v.id === p.id)}
                onClick={() => applyPreset(p)}
                actions={actions(p)}
              />
            ) : (
              <article className="template-card" key={p.id}>
                <button
                  className="design-preview"
                  onClick={() => openDesign(p)}
                >
                  <img
                    src={
                      state.assets.find(
                        (a) =>
                          a.id ===
                          p.elements?.find(
                            (e) => e.type === "image" && !e.hidden,
                          )?.assetId,
                      )?.thumbnail ||
                      "data:image/svg+xml;charset=utf-8," +
                        encodeURIComponent(
                          templateSVG(p, {
                            titulo: "Novo drop.",
                            subtitulo: "O extraordinário chegou.",
                            cta: "DESCUBRA AGORA →",
                          }),
                        )
                    }
                    alt={p.name}
                  />
                  <span className="design-format">
                    {p.width} × {p.height}
                  </span>
                  <div className="template-use">
                    <Plus size={16} /> Editar design
                  </div>
                </button>
                <div className="template-info">
                  <div>
                    <h3>{p.name}</h3>
                    <p>
                      {p.category || "Meu estilo"} <span>·</span> Design
                    </p>
                  </div>
                </div>
                {actions(p)}
              </article>
            ),
          )}
        </div>
      )}
      <div className="info-banner catalog-tip">
        <Layers size={23} />
        <div>
          <b>Feito uma vez. Reimaginado quantas vezes quiser.</b>
          <p>
            Importe imagens e vídeos da galeria como base, ou um template
            editável .copex.json. Uma imagem pronta mantém seus textos e
            desenhos em uma única camada. Exporte seus templates em JSON para
            guardar ou compartilhar. Imagens dos designs acompanham o arquivo;
            trilhas e legendas dos presets de vídeo são selecionadas novamente
            ao importar.
          </p>
        </div>
      </div>
      {rename && (
        <Modal title="Renomear template" onClose={() => setRename(null)}>
          <div className="modal-body">
            <Field label="Nome do template">
              <input
                autoFocus
                value={rename.name}
                maxLength={120}
                onChange={(e) => setRename({ ...rename, name: e.target.value })}
              />
            </Field>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setRename(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!rename.name.trim()}
              onClick={async () => {
                const r = await mutate("/presets/" + rename.id, "PUT", {
                  name: rename.name,
                });
                if (r) {
                  setRename(null);
                  notify("Nome do template atualizado.");
                }
              }}
            >
              Salvar nome
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
