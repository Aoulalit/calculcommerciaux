import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../auth/api";

export default function LoginPage() {
  const { isAuth, login } = useAuth();
  const [email, setEmail] = useState("test@gmail.com");
  const [password, setPassword] = useState("test");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  if (isAuth) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      login(data);
    } catch (e) {
      setErr(e.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-badge">✨ EDI Flow style</div>
        <h1 className="auth-title">Connexion</h1>
        <p className="auth-subtitle">
          Connecte-toi pour accéder au calculateur, moduler les tarifs et générer la facture PDF.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@gmail.com"
            />
          </div>

          <div className="auth-group">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="test"
            />
          </div>

          {err ? <div className="alert alert-error">{err}</div> : null}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <div className="auth-note">
          Compte admin par défaut : <strong>test@gmail.com / test</strong>
        </div>
      </div>
    </div>
  );
}