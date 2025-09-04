import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

// --- helpers ---
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const HEADER_ALIASES = {
  "lieu (ville/secteur)": ["lieu", "ville", "secteur", "localite", "destination", "adresse", "point de livraison"],
  zone: ["zone", "region", "secteur"],
  "tarif horaire (€ ht)": ["tarif horaire", "prix horaire", "taux horaire", "heure ht"],
  "forfait deplacement (€ ht)": ["forfait deplacement", "forfait", "frais fixe", "frais deplacement"],
  "tarif au km (€ ht/km)": ["tarif au km", "tarif km", "prix km", "cout km", "km ht"],
  "duree minimale (h)": ["duree minimale", "minimum h", "min h", "duree mini"],
  "majoration nuit (%)": ["maj nuit", "majoration nuit", "nuit %", "nuit"],
  "majoration week-end (%)": ["maj weekend", "maj week-end", "majoration week-end", "weekend %", "we %"],
  "remise max (%)": ["remise max", "discount max", "rabais max"],
  "distance (km)": ["distance (km)", "distance km", "km", "distance"],
  minutes: ["minutes", "duree (min)", "duree minutes", "min", "temps (min)"],
};

const TARGETS = Object.keys(HEADER_ALIASES);
const toNumber = (v, def = 0) => {
  if (v === null || v === undefined || v === "") return def;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : def;
};

export default function ExcelTarifCalculator() {
  const [rows, setRows] = useState([]); // objets normalisés
  const [lieu, setLieu] = useState("");
  const [minutes, setMinutes] = useState(0);
  const [distance, setDistance] = useState(0);
  const [isNuit, setIsNuit] = useState(false);
  const [isWE, setIsWE] = useState(false);
  const [remise, setRemise] = useState(0);
  const [tva, setTva] = useState(20);

  const lieux = useMemo(
    () => Array.from(new Set(rows.map((r) => r["lieu (ville/secteur)"]))).filter(Boolean),
    [rows]
  );
  const current = useMemo(() => rows.find((r) => r["lieu (ville/secteur)"] === lieu) || null, [rows, lieu]);

  const res = useMemo(() => {
    if (!current) return null;
    const TH = toNumber(current["tarif horaire (€ ht)"]);
    const FORF = toNumber(current["forfait deplacement (€ ht)"]);
    const KM = toNumber(current["tarif au km (€ ht/km)"]);
    const DMIN = toNumber(current["duree minimale (h)"], 1);
    const MAJ_N = toNumber(current["majoration nuit (%)"], 0) / 100;
    const MAJ_WE = toNumber(current["majoration week-end (%)"], 0) / 100;
    const REM_MAX = toNumber(current["remise max (%)"], 0) / 100;

    const dureeH = Math.max(toNumber(minutes, 0) / 60, DMIN);
    const baseMO = dureeH * TH;
    const depl = FORF + KM * toNumber(distance, 0);
    const maj = baseMO * ((isNuit ? MAJ_N : 0) + (isWE ? MAJ_WE : 0));
    const sousTotal = baseMO + depl + maj;

    const remiseAppliquee = Math.max(0, Math.min(toNumber(remise, 0) / 100, REM_MAX));
    const mRemise = sousTotal * remiseAppliquee;
    const totalHT = sousTotal - mRemise;
    const tvaEur = totalHT * (toNumber(tva, 0) / 100);
    const totalTTC = totalHT + tvaEur;

    return { dureeH, baseMO, depl, maj, sousTotal, remiseAppliquee: remiseAppliquee * 100, mRemise, totalHT, tvaEur, totalTTC };
  }, [current, minutes, distance, isNuit, isWE, remise, tva]);

  function handleExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target.result;
      const wb = XLSX.read(data, { type: "binary" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];

      // AOA = array of arrays ; header row at index 0
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (!aoa || aoa.length === 0) return;

      const headers = aoa[0];
      const body = aoa.slice(1);

      // mapping auto: header canonique -> label source (première correspondance trouvée)
      const sourceByTarget = {};
      headers.forEach((h) => {
        const n = norm(h);
        for (const t of TARGETS) {
          for (const alias of HEADER_ALIASES[t]) {
            if (n.includes(norm(alias))) {
              if (!sourceByTarget[t]) sourceByTarget[t] = h;
            }
          }
        }
      });

      const idxOf = (label) => headers.indexOf(label);
      const out = [];
      for (const r of body) {
        if (!r || r.every((v) => String(v ?? "").trim() === "")) continue;
        const obj = {};
        for (const t of TARGETS) {
          const src = sourceByTarget[t];
          const idx = src ? idxOf(src) : -1;
          obj[t] = idx >= 0 ? r[idx] : "";
        }
        // normalisation numériques
        obj["tarif horaire (€ ht)"] = toNumber(obj["tarif horaire (€ ht)"]);
        obj["forfait deplacement (€ ht)"] = toNumber(obj["forfait deplacement (€ ht)"]);
        obj["tarif au km (€ ht/km)"] = toNumber(obj["tarif au km (€ ht/km)"]);
        obj["duree minimale (h)"] = toNumber(obj["duree minimale (h)"], 1);
        obj["majoration nuit (%)"] = toNumber(obj["majoration nuit (%)"], 0);
        obj["majoration week-end (%)"] = toNumber(obj["majoration week-end (%)"], 0);
        obj["remise max (%)"] = toNumber(obj["remise max (%)"], 10);

        out.push(obj);
      }

      // filtre : uniquement les lignes avec lieu non vide
      const filtered = out.filter((o) => String(o["lieu (ville/secteur)"] || "").trim() !== "");
      setRows(filtered);
      if (filtered[0]) {
        setLieu(filtered[0]["lieu (ville/secteur)"] || "");
        // préremplir minutes/distance si colonnes présentes
        if (filtered[0]["minutes"] !== undefined && filtered[0]["minutes"] !== "") {
          setMinutes(toNumber(filtered[0]["minutes"], 0));
        }
        if (filtered[0]["distance (km)"] !== undefined && filtered[0]["distance (km)"] !== "") {
          setDistance(toNumber(filtered[0]["distance (km)"], 0));
        }
      }
    };
    reader.readAsBinaryString(file);
  }

  function pretty(v) {
    if (typeof v !== "number" || Number.isNaN(v)) return "-";
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v);
  }

  const styles = {
    wrap: { maxWidth: 980, margin: "24px auto", padding: 16, fontFamily: "Inter, system-ui, sans-serif", color: "#111" },
    h1: { fontSize: 24, fontWeight: 700, marginBottom: 12 },
    card: { background: "#f7f7f8", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    row: { display: "grid", gridTemplateColumns: "1fr 2fr", alignItems: "center", gap: 8, marginBottom: 8 },
    input: { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", width: "100%" },
    select: { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", width: "100%" },
    label: { color: "#555", fontSize: 14 },
    sectionTitle: { fontWeight: 600, marginBottom: 8 },
    tableWrap: { overflowX: "auto" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", borderBottom: "1px solid #e5e5e5", padding: "8px 6px", whiteSpace: "nowrap" },
    td: { borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" },
  };

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>Calculateur de prix – (React + xlsx)</h1>

      <div style={styles.card}>
        <div style={styles.grid}>
          <div>
            <div style={styles.sectionTitle}>Base de tarifs (Excel)</div>
            <input type="file" accept=".xlsx,.xls" onChange={handleExcel} />
            <div style={{ fontSize: 12, color: "#777", marginTop: 8 }}>
              Astuce : gardez des intitulés proches de “Lieu, Tarif horaire, Forfait, Tarif au km, Durée minimale, Maj. nuit, Maj. WE, Remise max”.
            </div>
          </div>
          <div>
            <div style={styles.sectionTitle}>Paramètres</div>
            <div style={styles.row}>
              <label style={styles.label}>TVA (%)</label>
              <input style={styles.input} type="number" value={tva} onChange={(e) => setTva(Number(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.grid}>
          <div>
            <div style={styles.sectionTitle}>Devis</div>
            <div style={styles.row}>
              <label style={styles.label}>Lieu</label>
              <select style={styles.select} value={lieu} onChange={(e) => setLieu(e.target.value)}>
                <option value="">Choisir…</option>
                {lieux.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.row}>
              <label style={styles.label}>Minutes</label>
              <input style={styles.input} type="number" min={0} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
            <div style={styles.row}>
              <label style={styles.label}>Distance (km)</label>
              <input style={styles.input} type="number" min={0} step={0.1} value={distance} onChange={(e) => setDistance(e.target.value)} />
            </div>
            <div style={styles.row}>
              <label style={styles.label}>Prestation de nuit ?</label>
              <select style={styles.select} value={isNuit ? "Oui" : "Non"} onChange={(e) => setIsNuit(e.target.value === "Oui")}>
                <option>Non</option>
                <option>Oui</option>
              </select>
            </div>
            <div style={styles.row}>
              <label style={styles.label}>Prestation week-end ?</label>
              <select style={styles.select} value={isWE ? "Oui" : "Non"} onChange={(e) => setIsWE(e.target.value === "Oui")}>
                <option>Non</option>
                <option>Oui</option>
              </select>
            </div>
            <div style={styles.row}>
              <label style={styles.label}>Remise (%)</label>
              <input style={styles.input} type="number" min={0} max={100} step={0.1} value={remise} onChange={(e) => setRemise(e.target.value)} />
            </div>
          </div>

          <div>
            <div style={styles.sectionTitle}>Tarifs du lieu</div>
            {current ? (
              <div>
                <KV k="Tarif horaire (HT)" v={current["tarif horaire (€ ht)"]} suf="€" />
                <KV k="Forfait déplacement" v={current["forfait deplacement (€ ht)"]} suf="€" />
                <KV k="Tarif au km" v={current["tarif au km (€ ht/km)"]} suf="€/km" />
                <KV k="Durée minimale" v={current["duree minimale (h)"]} suf="h" />
                <KV k="Majoration Nuit" v={current["majoration nuit (%)"]} suf="%" />
                <KV k="Majoration WE" v={current["majoration week-end (%)"]} suf="%" />
                <KV k="Remise max" v={current["remise max (%)"]} suf="%" />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#777" }}>Choisissez un lieu pour voir les tarifs.</div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>Calcul</div>
        {current && res ? (
          <div style={styles.grid}>
            <div>
              <KV k="Durée facturable" v={res.dureeH} suf="h" />
              <KV k="Base MO (HT)" v={res.baseMO} suf="€" />
              <KV k="Déplacement (HT)" v={res.depl} suf="€" />
              <KV k="Majoration (HT)" v={res.maj} suf="€" />
              <KV k="Sous-total (HT)" v={res.sousTotal} suf="€" />
              <KV k="Remise appliquée" v={res.remiseAppliquee} suf="%" />
              <KV k="Montant remise" v={res.mRemise} suf="€" />
            </div>
            <div>
              <KV k={`Total après remise (HT)`} v={res.totalHT} suf="€" strong />
              <KV k={`TVA (${tva}%)`} v={res.tvaEur} suf="€" />
              <KV k={`TOTAL À FACTURER (TTC)`} v={res.totalTTC} suf="€" strong big />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#777" }}>Importez un Excel et sélectionnez un lieu pour afficher le calcul.</div>
        )}
      </div>

      {rows.length > 0 && (
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Aperçu des 10 premières lignes</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {TARGETS.map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    {TARGETS.map((h) => (
                      <td key={h} style={styles.td}>
                        {String(r[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && <div style={{ fontSize: 12, color: "#777", marginTop: 8 }}>… {rows.length - 10} lignes supplémentaires</div>}
        </div>
      )}
    </div>
  );
}

function KV({ k, v, suf, strong, big }) {
  const styleRow = { display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: big ? 18 : 14 };
  const styleKey = { color: "#555" };
  const styleVal = { fontWeight: strong ? 600 : 400 };
  const val = typeof v === "number" ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v) : v;
  return (
    <div style={styleRow}>
      <span style={styleKey}>{k}</span>
      <span style={styleVal}>
        {val} {suf || ""}
      </span>
    </div>
  );
}
