import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../auth/api";

const FIELDS = [
  { key: "baseCourse", label: "Base course HT", suffix: "€" },
  { key: "pricePerKm", label: "Prix au km HT", suffix: "€" },
  { key: "pricePerMinute", label: "Prix à la minute HT", suffix: "€" },
  { key: "hourlyRate", label: "Tarif horaire HT", suffix: "€" },
  { key: "minimumHours", label: "Durée minimale (h)", suffix: "h" },
  { key: "forfaitPrice", label: "Forfait déplacement HT", suffix: "€" },
  { key: "vatPct", label: "TVA (%)", suffix: "%" },
  { key: "nightPct", label: "Majoration nuit (%)", suffix: "%" },
  { key: "weekendPct", label: "Majoration week-end (%)", suffix: "%" },
  { key: "discountPct", label: "Remise (%)", suffix: "%" },
];

const emptyConfig = FIELDS.reduce((acc, f) => {
  acc[f.key] = { value: 0, enabled: true };
  return acc;
}, {});

export default function AdminPricingPage() {
  const { token, user, logout } = useAuth();
  const [config, setConfig] = useState(emptyConfig);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadConfig() {
    try {
      setErr("");
      setLoading(true);
      const data = await apiFetch("/api/pricing-config", { token });
      setConfig(data);
    } catch (e) {
      setErr(e.message || "Erreur chargement de la configuration prix");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(key, patch) {
    setConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    setSaving(true);

    try {
      const updated = await apiFetch("/api/pricing-config", {
        token,
        method: "PUT",
        body: config,
      });

      setConfig(updated);
      setOk("Configuration enregistrée. Les champs verrouillés sont désormais imposés aux utilisateurs.");
    } catch (e) {
      setErr(e.message || "Erreur enregistrement de la configuration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <div className="admin-brand">
          <div className="admin-logo">E</div>
          <div>
            <div className="admin-title">Gestion prix</div>
            <div className="admin-subtitle">
              Définir et verrouiller les tarifs utilisés par les utilisateurs
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="pill">{user?.email}</span>
          <button className="btn btn-danger" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Tarification globale</div>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -6, marginBottom: 16 }}>
          Un champ <strong>activé</strong> est visible sur la page Calculateur et sa valeur
          est imposée (non modifiable) pour les utilisateurs non-admin. Un champ{" "}
          <strong>désactivé</strong> disparaît complètement de la page Calculateur pour eux.
          Les comptes admin gardent toujours la main sur tous les champs.
        </p>

        {loading ? (
          <div>Chargement...</div>
        ) : (
          <form className="admin-form" onSubmit={handleSave}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Champ</th>
                    <th>Valeur</th>
                    <th>Activé pour les utilisateurs</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map((f) => (
                    <tr key={f.key}>
                      <td>{f.label}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={config[f.key]?.value ?? 0}
                          onChange={(e) =>
                            updateField(f.key, { value: e.target.value })
                          }
                          style={{ maxWidth: 140 }}
                        />
                      </td>
                      <td>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={!!config[f.key]?.enabled}
                            onChange={(e) =>
                              updateField(f.key, { enabled: e.target.checked })
                            }
                          />
                          {config[f.key]?.enabled ? "Activé" : "Désactivé"}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {err ? <div className="alert alert-error">{err}</div> : null}
            {ok ? <div className="alert alert-success">{ok}</div> : null}

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer la configuration"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}