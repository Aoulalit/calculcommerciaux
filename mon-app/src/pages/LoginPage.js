import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../auth/api";

export default function LoginPage() {
    const nav = useNavigate();
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setErr("");
        setLoading(true);
        try {
            const data = await apiFetch("/api/auth/login", {
                method: "POST",
                body: { email, password },
            });

            login({ token: data.token, user: data.user });
            nav(data.user.role === "admin" ? "/admin/users" : "/");
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ maxWidth: 460, margin: "70px auto" }}>
            <div className="card" style={{ padding: 18 }}>
                <h2 style={{ marginTop: 0 }}>Connexion</h2>

                <form onSubmit={submit}>
                    <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", marginBottom: 6 }}>Email</label>
                        <input
                            className="input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="ex: admin@admin.fr"
                        />
                    </div>

                    <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", marginBottom: 6 }}>Mot de passe</label>
                        <input
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>

                    {err && <div style={{ color: "red", marginBottom: 10 }}>{err}</div>}

                    <button className="btn btn--primary" type="submit" disabled={loading}>
                        {loading ? "Connexion..." : "Se connecter"}
                    </button>
                </form>
            </div>
        </div>
    );
}