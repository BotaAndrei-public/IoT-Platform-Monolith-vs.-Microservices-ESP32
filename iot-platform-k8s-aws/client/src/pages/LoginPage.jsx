import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Cpu } from "lucide-react";

export default function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user]);

  useEffect(() => {
    const err = params.get("error");
    if (err === "access_denied") setError("Ai anulat login-ul.");
    if (err === "oauth_failed")
      setError("Eroare Google OAuth. Incearca din nou.");
  }, [params]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { url } = await api.getGoogleLoginUrl();
      window.location.href = url;
    } catch (e) {
      setError("Nu pot contacta serverul. Asigura-te ca e pornit.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div style={{ width: 360, textAlign: "center" }}>
        {/* LOGOUL: */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "var(--primary)",
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Cpu size={32} color="#fff" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
            IoT Platform
          </h1>
          <p style={{ color: "var(--text2)", fontSize: 14 }}>
            Monitorizare senzori ESP32 in timp real
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 32 }}>
          <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 24 }}>
            Logheaza-te cu contul tau Google pentru a accesa dashboard-ul
          </p>

          {error && (
            <div
              style={{
                background: "#3f0f0f",
                border: "1px solid var(--danger)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "var(--danger)",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 20px",
              background: "#fff",
              color: "#1f1f1f",
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              opacity: loading ? 0.7 : 1,
              transition: "all 0.15s",
            }}
          >
            {loading ? (
              <span className="spinner" style={{ borderTopColor: "#1f1f1f" }} />
            ) : (
              <GoogleIcon />
            )}
            {loading ? "Se incarca..." : "Continua cu Google"}
          </button>

          <p style={{ marginTop: 20, fontSize: 11, color: "var(--text3)" }}>
            Datele tale sunt salvate separat per cont. Niciun alt user nu iti
            vede device-urile.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
