import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPrivacyPolicy, getTermsAndConditions } from "../services/api";

type LegalContentType = "TERMS_AND_CONDITIONS" | "PRIVACY_POLICY";

interface LegalContentPageProps {
  contentType: LegalContentType;
  title: string;
}

const resolveContent = async (contentType: LegalContentType): Promise<string> => {
  const records = contentType === "PRIVACY_POLICY"
    ? await getPrivacyPolicy()
    : await getTermsAndConditions();

  return (Array.isArray(records) ? records : [])
    .map((record: any) => String(record?.content || record?.text || "").trim())
    .filter(Boolean)
    .join("\n\n");
};

export default function LegalContentPage({
  contentType,
  title,
}: LegalContentPageProps) {
  const navigate = useNavigate();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    resolveContent(contentType)
      .then((nextContent) => {
        if (!cancelled) setContent(nextContent);
      })
      .catch(() => {
        if (!cancelled) setContent("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contentType]);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F8FAFC 0%, #E2E8F0 100%)",
        padding: "32px 16px",
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          display: "grid",
          gap: 20,
        }}
      >
        <button
          type="button"
          onClick={goBack}
          style={{
            width: "fit-content",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid #CBD5E1",
            background: "rgba(255,255,255,0.85)",
            color: "#0F172A",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <section
          style={{
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(148,163,184,0.28)",
            borderRadius: 28,
            boxShadow: "0 24px 64px rgba(15,23,42,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "28px 28px 18px",
              background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
              color: "#fff",
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.75 }}>
              Meet The Masters
            </div>
            <h1 style={{ margin: "10px 0 0", fontSize: 32, lineHeight: 1.1 }}>
              {title}
            </h1>
          </div>

          <div style={{ padding: 28 }}>
            {loading ? (
              <div style={{ fontSize: 15, lineHeight: 1.7, color: "#475569" }}>
                Loading the latest saved content...
              </div>
            ) : content.trim() ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "inherit",
                  fontSize: 15,
                  lineHeight: 1.8,
                  color: "#334155",
                }}
              >
                {content}
              </pre>
            ) : (
              <div style={{ fontSize: 15, lineHeight: 1.7, color: "#475569" }}>
                The latest {title} content is not available right now.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
