import { createHash, timingSafeEqual } from "node:crypto";
export function accessControl(password, { required = false } = {}) {
  if (!password && required)
    throw Error(
      "Defina COPEX_ACCESS_PASSWORD antes de expor o servidor online.",
    );
  if (!password) return (_req, _res, next) => next();
  const digest = (value) => createHash("sha256").update(value, "utf8").digest();
  const expected = digest("copex:" + password);
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    if (
      typeof header === "string" &&
      header.length <= 8192 &&
      /^Basic /i.test(header)
    ) {
      const value = Buffer.from(header.slice(6), "base64").toString("utf8");
      if (timingSafeEqual(digest(value), expected)) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="Copex Studio", charset="UTF-8"');
    res.set("Cache-Control", "no-store");
    res
      .status(401)
      .json({
        error:
          "Acesso privado. Use o usuário copex e a senha configurada no seu servidor.",
      });
  };
}
