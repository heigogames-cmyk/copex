import React, { useState } from "react";
import {
  Upload,
  Search,
  Clapperboard,
  Star,
  Download,
  Trash2,
  Play,
  Eye,
  Tag,
  FolderOpen,
  Check,
  ArrowDownWideNarrow,
  Subtitles,
  Music2,
} from "lucide-react";
import {
  Button,
  Field,
  Toggle,
  Empty,
  Modal,
  PageHeading,
  Thumb,
} from "./studio-ui.jsx";
const bytes = (n) =>
  n === 0
    ? "0 KB"
    : n >= 1e9
      ? (n / 1e9).toFixed(1) + " GB"
      : n >= 1e6
        ? (n / 1e6).toFixed(1) + " MB"
        : Math.max(1, Math.round(n / 1e3)) + " KB";
const time = (n) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;
const parseTags = (value) => [
  ...new Set(
    String(value)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];
export function MediaLibrary({
  state,
  mutate,
  selected,
  setSelected,
  upload,
  uploadFiles,
  uploading,
  preview,
  edit,
  confirm,
  notify,
  navigate,
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("Todos"),
    [order, setOrder] = useState("recent"),
    [dragging, setDragging] = useState(false),
    [details, setDetails] = useState(null),
    [tags, setTags] = useState(""),
    [tagModal, setTagModal] = useState(false),
    [replaceTags, setReplaceTags] = useState(false),
    [busy, setBusy] = useState(false);
  const assets = state.assets
    .filter(
      (a) =>
        (a.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
          (a.tags || []).some((t) =>
            t.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )) &&
        (filter === "Todos" ||
          (filter === "Vídeos" && a.type === "video") ||
          (filter === "Imagens" && a.type === "image") ||
          (filter === "Áudios" && a.type === "audio") ||
          (filter === "Legendas" && a.type === "subtitle") ||
          (filter === "Favoritos" && a.favorite)),
    )
    .sort((a, b) =>
      order === "name"
        ? a.name.localeCompare(b.name, "pt-BR")
        : order === "size"
          ? b.size - a.size
          : new Date(b.createdAt) - new Date(a.createdAt),
    );
  const selectedAssets = state.assets.filter((a) => selected.includes(a.id)),
    editable = selectedAssets.filter((a) =>
      ["video", "image"].includes(a.type),
    );
  const references = (ids) =>
    state.projects.filter((p) => p.assetIds.some((id) => ids.includes(id)))
      .length +
    state.presets.filter((p) =>
      p.kind === "design"
        ? p.doc.elements.some((e) => ids.includes(e.assetId))
        : [
            p.sourceAssetId,
            p.settings?.frameId,
            p.settings?.watermarkId,
            p.settings?.audioId,
            p.settings?.subtitleId,
          ].some((id) => ids.includes(id)),
    ).length;
  const remove = (ids) => {
    const refs = references(ids);
    confirm({
      title:
        ids.length > 1
          ? "Excluir " + ids.length + " arquivos?"
          : "Excluir arquivo?",
      message:
        "Os originais selecionados serão removidos da biblioteca. Exportações concluídas serão preservadas." +
        (refs
          ? " Há " +
            refs +
            " projeto(s) ou template(s) que precisarão ter suas referências substituídas."
          : ""),
      action: async () => {
        const r = await mutate("/assets", "DELETE", { assetIds: ids });
        if (r) {
          setSelected((s) => s.filter((id) => !ids.includes(id)));
          notify(r.removed + " arquivo(s) removido(s).");
        }
      },
    });
  };
  const organize = async () => {
    setBusy(true);
    const r = await mutate("/assets", "PATCH", {
      assetIds: selectedAssets.map((a) => a.id),
      tags: parseTags(tags),
      replaceTags,
    });
    setBusy(false);
    if (r) {
      setTagModal(false);
      notify("Marcadores atualizados em " + r.updated + " arquivo(s).");
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="ACERVO / MATÉRIA-PRIMA DAS SUAS HISTÓRIAS"
        title="Um lugar para todas as suas ideias."
        description={`${state.assets.length} arquivos · ${bytes(state.assets.reduce((n, a) => n + a.size, 0))} armazenados · Seus originais preservados`}
      >
        <Button
          variant="primary"
          icon={Upload}
          onClick={upload}
          disabled={uploading}
        >
          {uploading ? "Importando…" : "Importar arquivos"}
        </Button>
      </PageHeading>
      <div
        className={"upload-zone library-upload " + (dragging ? "dragging" : "")}
        role="button"
        tabIndex={0}
        onClick={upload}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            upload();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          uploadFiles(e.dataTransfer.files);
        }}
      >
        <span className="upload-icon">
          <Upload size={24} />
        </span>
        <div>
          <b>
            {dragging
              ? "Solte aqui. A próxima história começa agora."
              : "Arraste seus arquivos para cá"}
          </b>
          <p>
            Ou clique para escolher · Vídeos, imagens, áudios e SRT · Até 2 GB
            por arquivo
          </p>
        </div>
        <span className="tag">ACERVO INDEPENDENTE</span>
      </div>
      <div className="toolbar library-toolbar">
        <div className="filter-tabs">
          {[
            "Todos",
            "Vídeos",
            "Imagens",
            "Áudios",
            "Legendas",
            "Favoritos",
          ].map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={16} />
          <input
            aria-label="Buscar arquivos e marcadores"
            placeholder="Nome ou marcador…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="collection-caption library-caption">
        <label className="library-select">
          <input
            type="checkbox"
            aria-label="Selecionar arquivos visíveis"
            checked={
              assets.length > 0 && assets.every((a) => selected.includes(a.id))
            }
            onChange={(e) =>
              setSelected((s) =>
                e.target.checked
                  ? [...new Set([...s, ...assets.map((a) => a.id)])]
                  : s.filter((id) => !assets.some((a) => a.id === id)),
              )
            }
          />
          <span>
            {assets.length} {assets.length === 1 ? "ARQUIVO" : "ARQUIVOS"}
          </span>
        </label>
        <label className="library-order">
          <ArrowDownWideNarrow size={14} />
          <select
            aria-label="Ordenar biblioteca"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="recent">Mais recentes</option>
            <option value="name">Nome A–Z</option>
            <option value="size">Maiores arquivos</option>
          </select>
        </label>
      </div>
      {selectedAssets.length > 0 && (
        <div className="selection-bar">
          <span>
            <Check size={16} />
            {selectedAssets.length} selecionado(s)
          </span>
          <Button
            icon={Clapperboard}
            disabled={!editable.length}
            onClick={() => edit(editable.map((a) => a.id))}
          >
            Editar lote
          </Button>
          <Button
            icon={Tag}
            onClick={() => {
              setTags("");
              setReplaceTags(false);
              setTagModal(true);
            }}
          >
            Marcadores
          </Button>
          <button
            className="icon-btn"
            aria-label="Excluir selecionados"
            title="Excluir selecionados"
            onClick={() => remove(selectedAssets.map((a) => a.id))}
          >
            <Trash2 size={16} />
          </button>
          <button className="text-btn" onClick={() => setSelected([])}>
            Limpar seleção
          </button>
        </div>
      )}
      {!assets.length ? (
        <Empty
          icon={FolderOpen}
          title={
            state.assets.length
              ? "Nada com esse nome. Ainda."
              : "Um acervo começa com o primeiro arquivo."
          }
          description={
            state.assets.length
              ? "Busque por outro nome, marcador ou tipo de mídia."
              : "Importe suas mídias e organize o material da sua próxima criação."
          }
        >
          <Button
            onClick={
              state.assets.length
                ? () => {
                    setQuery("");
                    setFilter("Todos");
                  }
                : upload
            }
          >
            {state.assets.length ? "Limpar filtros" : "Escolher arquivos"}
          </Button>
        </Empty>
      ) : (
        <div className="asset-grid">
          {assets.map((a) => (
            <article
              key={a.id}
              className={
                "asset-card " + (selected.includes(a.id) ? "selected" : "")
              }
            >
              <div className="asset-cover">
                <button
                  className="asset-open"
                  onClick={() => preview(a)}
                  aria-label={"Visualizar " + a.name}
                >
                  <Thumb asset={a} />
                  <span className="play-overlay">
                    {a.type === "image" ? (
                      <Eye size={22} />
                    ) : a.type === "subtitle" ? (
                      <Subtitles size={22} />
                    ) : (
                      <Play size={24} />
                    )}
                  </span>
                </button>
                <input
                  className="asset-check"
                  aria-label={"Selecionar " + a.name}
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() =>
                    setSelected((s) =>
                      s.includes(a.id)
                        ? s.filter((id) => id !== a.id)
                        : [...s, a.id],
                    )
                  }
                />
                <button
                  className={"favorite-btn " + (a.favorite ? "active" : "")}
                  aria-label={"Favoritar arquivo " + a.name}
                  aria-pressed={a.favorite}
                  title="Favoritar"
                  onClick={() =>
                    mutate("/assets/" + a.id, "PATCH", {
                      favorite: !a.favorite,
                    })
                  }
                >
                  <Star size={16} fill={a.favorite ? "currentColor" : "none"} />
                </button>
              </div>
              <div className="asset-info">
                <h3 title={a.name}>{a.name}</h3>
                <small>
                  {a.type === "audio" || a.type === "subtitle"
                    ? time(a.duration)
                    : a.width + " × " + a.height}{" "}
                  <span>·</span> {bytes(a.size)}
                </small>
                {a.tags?.length > 0 && (
                  <div className="asset-tags">
                    {a.tags.slice(0, 2).map((t) => (
                      <button key={t} onClick={() => setQuery(t)}>
                        {t}
                      </button>
                    ))}
                    {a.tags.length > 2 && <span>+{a.tags.length - 2}</span>}
                  </div>
                )}
                <div className="asset-actions">
                  <button
                    className="text-btn"
                    onClick={() =>
                      setDetails({ ...a, tagsText: (a.tags || []).join(", ") })
                    }
                  >
                    Organizar
                  </button>
                  <a
                    className="icon-btn"
                    href={a.url}
                    download={a.name}
                    title="Baixar original"
                  >
                    <Download size={15} />
                  </a>
                  <button
                    className="icon-btn"
                    aria-label={"Excluir arquivo " + a.name}
                    title="Excluir arquivo"
                    onClick={() => remove([a.id])}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {tagModal && (
        <Modal
          title="Organizar arquivos selecionados"
          onClose={() => setTagModal(false)}
        >
          <div className="modal-body">
            <p>{selectedAssets.length} arquivo(s) na seleção.</p>
            <Field label="Marcadores separados por vírgula">
              <input
                autoFocus
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="campanha, bastidores, coleção"
              />
            </Field>
            <Toggle
              label="Substituir os marcadores existentes"
              checked={replaceTags}
              onChange={setReplaceTags}
              hint="Desativado: os novos marcadores serão somados aos atuais."
            />
          </div>
          <div className="modal-actions">
            <Button onClick={() => setTagModal(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={busy || (!tags.trim() && !replaceTags)}
              onClick={organize}
            >
              Aplicar marcadores
            </Button>
          </div>
        </Modal>
      )}
      {details && (
        <Modal title="Organizar arquivo" onClose={() => setDetails(null)}>
          <div className="modal-body">
            <Field label="Nome do arquivo">
              <input
                autoFocus
                value={details.name}
                maxLength={200}
                onChange={(e) =>
                  setDetails({ ...details, name: e.target.value })
                }
              />
            </Field>
            <Field label="Marcadores separados por vírgula">
              <input
                value={details.tagsText}
                onChange={(e) =>
                  setDetails({ ...details, tagsText: e.target.value })
                }
              />
            </Field>
            <Toggle
              label="Favorito"
              checked={details.favorite}
              onChange={(v) => setDetails({ ...details, favorite: v })}
            />
            <div className="file-facts">
              <span>ARQUIVO ORIGINAL</span>
              <b>
                {bytes(details.size)} ·{" "}
                {details.type === "video" || details.type === "image"
                  ? details.width + " × " + details.height + " px"
                  : time(details.duration)}
              </b>
              <small>
                Importado em{" "}
                {new Date(details.createdAt).toLocaleDateString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </small>
              {references([details.id]) > 0 && (
                <small>
                  Referenciado por {references([details.id])} projeto(s) ou
                  template(s).
                </small>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setDetails(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!details.name.trim() || busy}
              onClick={async () => {
                setBusy(true);
                const r = await mutate("/assets/" + details.id, "PATCH", {
                  name: details.name,
                  tags: parseTags(details.tagsText),
                  favorite: details.favorite,
                });
                setBusy(false);
                if (r) {
                  setDetails(null);
                  notify("Arquivo organizado.");
                }
              }}
            >
              Salvar organização
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
