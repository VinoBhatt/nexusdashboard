import { useEscapeToClose } from "../lib/useEscapeToClose";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", danger, onConfirm, onCancel }: ConfirmDialogProps) {
  useEscapeToClose(open, onCancel);
  if (!open) return null;
  return (
    <div className="modal show">
      <div className="modal-card" style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            <div className="sub">{description}</div>
          </div>
          <button className="close" onClick={onCancel} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
