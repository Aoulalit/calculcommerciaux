import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../auth/api";

export default function AdminUsersPage() {
  const { token, user, logout } = useAuth();
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function loadUsers() {
    try {
      setErr("");
      const data = await apiFetch("/api/users", { token });
      setRows(data);
    } catch (e) {
      setErr(e.message || "Erreur chargement utilisateurs");
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setErr("");
    setOk("");

    try {
      await apiFetch("/api/users", {
        token,
        method: "POST",
        body: { email, password, role },
      });

      setEmail("");
      setPassword("");
      setRole("user");
      setOk("Utilisateur créé");
      loadUsers();
    } catch (e) {
      setErr(e.message || "Erreur création utilisateur");
    }
  }

  async function handleDelete(id) {
    setErr("");
    setOk("");

    try {
      await apiFetch(`/api/users/${id}`, {
        token,
        method: "DELETE",
      });

      setOk("Utilisateur supprimé");
      loadUsers();
    } catch (e) {
      setErr(e.message || "Erreur suppression utilisateur");
    }
  }

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <div className="admin-brand">
          <div className="admin-logo">E</div>
          <div>
            <div className="admin-title">Administration</div>
            <div className="admin-subtitle">Gestion des comptes utilisateur</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="pill">{user?.email}</span>
          <button className="btn btn-danger" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </div>

      <div className="admin-grid">
        <div className="panel">
          <div className="panel-title">Créer un utilisateur</div>

          <form className="admin-form" onSubmit={handleCreate}>
            <div>
              <label>Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemple.com"
              />
            </div>

            <div>
              <label>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
              />
            </div>

            <div>
              <label>Rôle</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>

            {err ? <div className="alert alert-error">{err}</div> : null}
            {ok ? <div className="alert alert-success">{ok}</div> : null}

            <button className="btn btn-primary" type="submit">
              Créer
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-title">Utilisateurs</div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Créé le</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.email}</td>
                    <td>{r.role}</td>
                    <td>{r.created_at}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(r.id)}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td colSpan="5">Aucun utilisateur</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}