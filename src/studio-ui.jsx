import React from "react";
import {
  FolderOpen,
  X,
  Music2,
  Film,
  Subtitles,
  Image as ImageIcon,
} from "lucide-react";
const time = (n) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;
export function Button({
  children,
  icon: Icon,
  variant = "",
  className = "",
  ...props
}) {
  return (
    <button type="button" className={`btn ${variant} ${className}`} {...props}>
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) &&
        ["input", "select", "textarea"].includes(child.type)
          ? React.cloneElement(child, { "aria-label": label })
          : child,
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}) {
  const [text, setText] = React.useState(String(value ?? "")),
    [editing, setEditing] = React.useState(false);
  const commit = () => {
    setEditing(false);
    const number = Number(text);
    if (text.trim() === "" || !Number.isFinite(number)) {
      setText(String(value ?? ""));
      return;
    }
    const rounded = step > 1 ? Math.round(number / step) * step : number,
      next = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, rounded));
    setText(String(next));
    if (next !== Number(value)) onChange(next);
  };
  return (
    <Field label={label}>
      <input
        type="number"
        disabled={disabled}
        inputMode="decimal"
        value={editing ? text : String(value ?? "")}
        min={min}
        max={max}
        step={step}
        onFocus={() => {
          setText(String(value ?? ""));
          setEditing(true);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const n = Number(next);
          if (
            next !== "" &&
            Number.isFinite(n) &&
            (min === undefined || n >= min) &&
            (max === undefined || n <= max)
          )
            onChange(n);
        }}
      />
    </Field>
  );
}
export function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="toggle-row">
      <div>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <input
        type="checkbox"
        aria-label={label}
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
    </label>
  );
}
export function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  suffix = "",
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <b>
          {Number(value).toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function Empty({
  icon: Icon = FolderOpen,
  title,
  description,
  children,
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
const dialogStack = [];
let scrollSnapshot = "";
export function useDialog(onClose) {
  const ref = React.useRef(null),
    close = React.useRef(onClose),
    previous = React.useRef(
      typeof document === "undefined" ? null : document.activeElement,
    );
  close.current = onClose;
  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
    if (!dialogStack.length) {
      scrollSnapshot = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialogStack.push(dialog);
    if (!dialog.contains(document.activeElement))
      (
        dialog.querySelector("[autofocus]") ||
        dialog.querySelector(selector) ||
        dialog
      ).focus();
    const handler = (e) => {
      if (dialogStack.at(-1) !== dialog) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current?.();
      }
      if (e.key === "Tab") {
        const elements = [...dialog.querySelectorAll(selector)].filter(
          (el) => el.getClientRects().length,
        );
        if (!elements.length) {
          e.preventDefault();
          return;
        }
        const first = elements[0],
          last = elements.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !dialog.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !dialog.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      const i = dialogStack.indexOf(dialog);
      if (i >= 0) dialogStack.splice(i, 1);
      if (!dialogStack.length) document.body.style.overflow = scrollSnapshot;
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, []);
  return ref;
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useDialog(onClose);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Thumb({ asset, className = "" }) {
  return (
    <div className={"thumb " + className}>
      {asset.thumbnail ? (
        <img src={asset.thumbnail} alt={asset.name} />
      ) : asset.type === "audio" ? (
        <Music2 />
      ) : asset.type === "subtitle" ? (
        <Subtitles />
      ) : asset.type === "image" ? (
        <ImageIcon />
      ) : (
        <Film />
      )}
      {asset.type === "video" && (
        <span className="duration">{time(asset.duration)}</span>
      )}
    </div>
  );
}
export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
