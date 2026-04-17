import React from "react";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    busy = false,
    onConfirm,
    onClose,
}: ConfirmDialogProps) {
    if (!open) return null;

    const confirmBg = danger ? "#DC2626" : "#0F766E";
    const confirmDisabledBg = danger ? "#FCA5A5" : "#99F6E4";

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 10000,
                background: "rgba(15,23,42,0.55)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: "min(420px, 100%)",
                    background: "#fff",
                    borderRadius: 18,
                    boxShadow: "0 24px 80px rgba(15,23,42,0.28)",
                    overflow: "hidden",
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div style={{ padding: "22px 24px 10px" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>
                        {title}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.7 }}>
                        {message}
                    </div>
                </div>
                <div
                    style={{
                        padding: "18px 24px 24px",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 10,
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        style={{
                            padding: "10px 18px",
                            borderRadius: 10,
                            border: "1.5px solid #E2E8F0",
                            background: "#fff",
                            color: "#64748B",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: busy ? "default" : "pointer",
                            opacity: busy ? 0.7 : 1,
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        style={{
                            padding: "10px 18px",
                            borderRadius: 10,
                            border: "none",
                            background: busy ? confirmDisabledBg : confirmBg,
                            color: "#fff",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: busy ? "default" : "pointer",
                        }}
                    >
                        {busy ? "Working..." : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
