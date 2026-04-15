import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../auth/api";

export default function AdminUsersPage() {
    const { token, logout } = useAuth();
    const [users, setUsers] = useState([]);
    const [err, setErr] = useState("");

    const [createForm, setCreateForm] = useState({
        email: "",
        password: "",
        role: "user",
    });

    async function load() {
        setErr("");
        try {
            const data = await apiFetch("/api/users", { token });
            setUsers(data);
        } catch (e) {
            setErr(e.message);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, []);

    async function createUser(e) {
        e.preventDefault();
        setErr("");
        try {
            await apiFetch("/api/users", {
                token,
                method: "POST",
                body: createForm,
            });
            setCreateForm({ email: "", password: "", role: "user" });
            load();
        } catch (e) {
            setErr(e.message);
        }
    }

    async function changeRole(id, role) {
        setErr("");
        try {
            await apiFetch(`/api/users/${id}`, {
                token,
                method: "PATCH",
                body: { role },
            });
            load();
        } catch (e) {
            setErr(e.message);
        }
    }

    async function resetPassword(id) {
        const pwd = prompt("Nouveau mot de passe :");
        if (!pwd) return;
        setErr("");
        try {
            await apiFetch(`/api/users/${id}`, {
                token,
                method: "PATCH",
                body: { password: pwd },
            });
            load();
        } catch (e) {
            setErr(e.message);
        }
    }

    async function delUser(id) {
        if (!window.confirm("Supprimer cet utilisateur ?")) return;
        setErr("");
        try {
            await apiFetch(`/api/users/${id}`, {
                token,
                method: "DELETE",
            });
            load();
        } catch (e) {
            setErr(e.message);
        }
    }

    return (
        <div style={{ maxWidth: 900, margin: "30px auto" }}>
            <div className="card" style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <h2 style={{ margin: 0 }}>Admin • Utilisateurs</h2>
                    <button className="btn btn--danger" onClick={logout} type="button">
                        Déconnexion
                    </button>
                </div>

                <hr style={{ opacity: 0.2 }} />

                <h3>Créer un utilisateur</h3>
                <form onSubmit={createUser} style={{ display: "grid", gap: 10 }}>
                    <input
                        className="input"
                        placeholder="Email"
                        value={createForm.email}
                        onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    />
                    <input
                        className="input"
                        type="password"
                        placeholder="Mot de passe"
                        value={createForm.password}
                        onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    />

                    <select
                        className="select"
                        value={createForm.role}
                        onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                    </select>

                    <button className="btn btn--primary" type="submit">
                        Créer
                    </button>
                </form>

                {err && <div style={{ color: "red", marginTop: 12 }}>{err}</div>}

                <hr style={{ opacity: 0.2, margin: "18px 0" }} />

                <h3>Liste</h3>
                <div style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ textAlign: "left" }}>
                                <th style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,.15)" }}>Email</th>
                                <th style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,.15)" }}>Rôle</th>
                                <th style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,.15)" }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id}>
                                    <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,.08)" }}>{u.email}</td>
                                    <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                                        <select className="select" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                                            <option value="user">user</option>
                                            <option value="admin">admin</option>
                                        </select>
                                    </td>
                                    <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            <button className="btn" type="button" onClick={() => resetPassword(u.id)}>
                                                Reset MDP
                                            </button>
                                            <button className="btn btn--danger" type="button" onClick={() => delUser(u.id)}>
                                                Supprimer
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={3} style={{ padding: 8, opacity: 0.7 }}>
                                        Aucun utilisateur
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div style={{ marginTop: 14, opacity: 0.7 }}>
                    URL : <b>/admin/users</b>
                </div>
            </div>
        </div>
    );
}