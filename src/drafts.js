import { useEffect, useState } from "react";
export function readDraft(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    if (value === null) return fallback;
    if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
    if (
      fallback &&
      typeof fallback === "object" &&
      !Array.isArray(fallback) &&
      (typeof value !== "object" || Array.isArray(value))
    )
      return fallback;
    return value;
  } catch {
    return fallback;
  }
}
export function writeDraft(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function useDraft(key, value, enabled = true) {
  const [status, setStatus] = useState("saved");
  useEffect(() => {
    if (!enabled) return;
    setStatus("saving");
    const timer = setTimeout(
      () => setStatus(writeDraft(key, value) ? "saved" : "error"),
      400,
    );
    return () => clearTimeout(timer);
  }, [key, JSON.stringify(value), enabled]);
  return status;
}
export function downloadJSON(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
