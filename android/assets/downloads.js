(() => {
  if (window.__copexDownloads) return;
  window.__copexDownloads = true;
  const original = HTMLAnchorElement.prototype.click;
  async function save(anchor) {
    let token;
    try {
      const blob = await (await fetch(anchor.href)).blob();
      token = CopexFiles.begin(
        anchor.download || "copex-exportacao",
        blob.type || "application/octet-stream",
        blob.size,
      );
      if (!token)
        throw Error(
          "Não foi possível preparar o salvamento. Confira espaço e conclua outros downloads.",
        );
      for (let position = 0; position < blob.size; position += 262144) {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob.slice(position, position + 262144));
        });
        if (!CopexFiles.append(token, data))
          throw Error("Download interrompido. Tente exportar novamente.");
      }
      if (!CopexFiles.finish(token))
        throw Error("Não foi possível concluir o arquivo.");
    } catch (error) {
      if (token) CopexFiles.cancel(token);
      alert(error.message || "Falha ao salvar o arquivo.");
    }
  }
  HTMLAnchorElement.prototype.click = function () {
    if (this.href.startsWith("blob:")) {
      void save(this);
      return;
    }
    return original.call(this);
  };
  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest?.('a[href^="blob:"]');
      if (anchor) {
        event.preventDefault();
        void save(anchor);
      }
    },
    true,
  );
})();
