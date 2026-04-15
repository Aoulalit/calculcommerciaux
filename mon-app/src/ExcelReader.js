import React, { useMemo, useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/* ================== Paris — Arrondissements (centroïdes approx.) ================== */
const PARIS_ARR = [
  { id: 1, label: "Paris 1er", lat: 48.8625, lng: 2.3358 },
  { id: 2, label: "Paris 2e", lat: 48.8686, lng: 2.3412 },
  { id: 3, label: "Paris 3e", lat: 48.8647, lng: 2.3601 },
  { id: 4, label: "Paris 4e", lat: 48.8546, lng: 2.3572 },
  { id: 5, label: "Paris 5e", lat: 48.8422, lng: 2.3499 },
  { id: 6, label: "Paris 6e", lat: 48.8512, lng: 2.3320 },
  { id: 7, label: "Paris 7e", lat: 48.8572, lng: 2.3125 },
  { id: 8, label: "Paris 8e", lat: 48.8745, lng: 2.3140 },
  { id: 9, label: "Paris 9e", lat: 48.8763, lng: 2.3370 },
  { id: 10, label: "Paris 10e", lat: 48.8767, lng: 2.3601 },
  { id: 11, label: "Paris 11e", lat: 48.8579, lng: 2.3799 },
  { id: 12, label: "Paris 12e", lat: 48.8320, lng: 2.4058 },
  { id: 13, label: "Paris 13e", lat: 48.8281, lng: 2.3570 },
  { id: 14, label: "Paris 14e", lat: 48.8315, lng: 2.3256 },
  { id: 15, label: "Paris 15e", lat: 48.8414, lng: 2.2923 },
  { id: 16, label: "Paris 16e", lat: 48.8642, lng: 2.2686 },
  { id: 17, label: "Paris 17e", lat: 48.8897, lng: 2.3201 },
  { id: 18, label: "Paris 18e", lat: 48.8921, lng: 2.3445 },
  { id: 19, label: "Paris 19e", lat: 48.8852, lng: 2.3829 },
  { id: 20, label: "Paris 20e", lat: 48.8640, lng: 2.3988 },
];

/* ================== Helpers ================== */
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const HEADER_ALIASES = {
  "lieu (ville/secteur)": ["lieu", "ville", "secteur", "localite", "destination", "adresse", "point de livraison"],
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

const fmt = (n, d = 2) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(n);
const eur = (n) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const todayFR = () => new Date().toLocaleDateString("fr-FR");
const todayISO = () => new Date().toISOString().slice(0, 10);

// --- Forfait livraison ---
// 1re livraison : 37 € si ≤ 3 km, sinon +3,10 € / tranche entamée de 3 km.
// +10 € par livraison supplémentaire (au-delà de la 1re).
function computeForfaitLivraison(
  km,
  totalDeliveries,
  { base = 37, trancheKm = 3, surchargePerTranche = 3.1, extraPerDelivery = 10 } = {}
) {
  const d = Math.max(0, Number(km) || 0);
  const deliveries = Math.max(1, Math.floor(Number(totalDeliveries) || 1));
  let price = base;
  if (d > trancheKm) {
    const extraTranches = Math.ceil((d - trancheKm) / trancheKm);
    price += extraTranches * surchargePerTranche;
  }
  if (deliveries > 1) {
    price += (deliveries - 1) * extraPerDelivery;
  }
  return price;
}

/* ================== App ================== */
export default function ExcelTarifCalculator() {
  // Données Excel (tarifs)
  const [rows, setRows] = useState([]);
  const [lieuExcel, setLieuExcel] = useState("");

  // Distance & temps
  const [distance, setDistance] = useState(0); // km
  const [minutes, setMinutes] = useState(0); // min
  const [distanceSource, setDistanceSource] = useState("manuel"); // manuel | excel | mappy-like

  // Mode arrondissements (départ / arrivée)
  const [useParis, setUseParis] = useState(true);
  const [arrDepart, setArrDepart] = useState(PARIS_ARR[0].id);
  const [arrArrivee, setArrArrivee] = useState(PARIS_ARR[1].id);

  // Tarification – paramètres
  const [isNuit, setIsNuit] = useState(false);
  const [isWE, setIsWE] = useState(false);
  const [remise, setRemise] = useState(0);
  const [tva, setTva] = useState(20);

  // Forfait livraison (optionnel)
  const [useForfait, setUseForfait] = useState(false);
  const [forfaitKm, setForfaitKm] = useState(0); // km utilisé pour le forfait (prérempli avec distance)
  const [forfaitDeliveries, setForfaitDeliveries] = useState(1); // nombre total de livraisons

  // Export — style de facture
  const [invoiceStyle, setInvoiceStyle] = useState("simple"); // "simple" | "transitainer"

  // UI état fetch
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeErr, setRouteErr] = useState("");

  // Champs personnalisés
  const [customFields, setCustomFields] = useState([{ id: 1, label: "Référence devis", value: "" }]);
  const addField = () => {
    const nid = (customFields.at(-1)?.id ?? 0) + 1;
    setCustomFields([...customFields, { id: nid, label: "", value: "" }]);
  };
  const removeField = (id) => setCustomFields(customFields.filter((f) => f.id !== id));
  const updateField = (id, key, val) => setCustomFields(customFields.map((f) => (f.id === id ? { ...f, [key]: val } : f)));

  // Infos facture (client)
  const [clientNom, setClientNom] = useState("");
  const [clientAdresse, setClientAdresse] = useState("");
  const [numeroFacture, setNumeroFacture] = useState("");
  const invoiceRef = useRef(null);

  // Lieu courant
  const lieux = useMemo(
    () => Array.from(new Set(rows.map((r) => r["lieu (ville/secteur)"]))).filter(Boolean),
    [rows]
  );
  const current = useMemo(
    () => rows.find((r) => r["lieu (ville/secteur)"] === lieuExcel) || null,
    [rows, lieuExcel]
  );

  // Synchronise le km du forfait avec la distance auto (modifiable après)
  useEffect(() => {
    setForfaitKm(distance || 0);
  }, [distance]);

  /* ========== Calcul tarifaire ========== */
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

    // Déplacement : soit Excel (forfait + km), soit Forfait Livraison
    const deplExcel = FORF + KM * toNumber(distance, 0);
    const deplForfait = useForfait
      ? computeForfaitLivraison(toNumber(forfaitKm, 0), toNumber(forfaitDeliveries, 1))
      : 0;
    const depl = useForfait ? deplForfait : deplExcel;

    const maj = baseMO * ((isNuit ? MAJ_N : 0) + (isWE ? MAJ_WE : 0));
    const sousTotal = baseMO + depl + maj;

    const remisePct = Math.min(toNumber(remise, 0) / 100, REM_MAX);
    const mRemise = sousTotal * Math.max(0, remisePct);
    const totalHT = sousTotal - mRemise;
    const tvaEur = totalHT * (toNumber(tva, 0) / 100);
    const totalTTC = totalHT + tvaEur;

    return {
      dureeH,
      baseMO,
      depl,
      maj,
      sousTotal,
      remiseAppliquee: remisePct * 100,
      mRemise,
      totalHT,
      tvaEur,
      totalTTC,
    };
  }, [current, minutes, distance, isNuit, isWE, remise, tva, useForfait, forfaitKm, forfaitDeliveries]);

  /* ========== Import Excel ========== */
  function handleExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];

      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      if (!aoa || aoa.length === 0) return;

      const headers = aoa[0];
      const body = aoa.slice(1);

      const sourceByTarget = {};
      headers.forEach((h) => {
        const n = norm(h);
        for (const t of Object.keys(HEADER_ALIASES)) {
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
        for (const t of Object.keys(HEADER_ALIASES)) {
          const src = sourceByTarget[t];
          const idx = src ? idxOf(src) : -1;
          obj[t] = idx >= 0 ? r[idx] : "";
        }
        obj["tarif horaire (€ ht)"] = toNumber(obj["tarif horaire (€ ht)"]);
        obj["forfait deplacement (€ ht)"] = toNumber(obj["forfait deplacement (€ ht)"]);
        obj["tarif au km (€ ht/km)"] = toNumber(obj["tarif au km (€ ht/km)"]);
        obj["duree minimale (h)"] = toNumber(obj["duree minimale (h)"], 1);
        obj["majoration nuit (%)"] = toNumber(obj["majoration nuit (%)"], 0);
        obj["majoration week-end (%)"] = toNumber(obj["majoration week-end (%)"], 0);
        obj["remise max (%)"] = toNumber(obj["remise max (%)"], 10);
        out.push(obj);
      }

      const filtered = out.filter((o) => String(o["lieu (ville/secteur)"] || "").trim() !== "");
      setRows(filtered);

      if (filtered[0]) {
        setLieuExcel(filtered[0]["lieu (ville/secteur)"] || "");
        if (filtered[0]["distance (km)"] !== undefined && filtered[0]["distance (km)"] !== "") {
          setDistance(toNumber(filtered[0]["distance (km)"], 0));
          setDistanceSource("excel");
        }
        if (filtered[0]["minutes"] !== undefined && filtered[0]["minutes"] !== "") {
          setMinutes(toNumber(filtered[0]["minutes"], 0));
        }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /* ========== Routing “Mappy-like” via OpenRouteService (profil vélo) ========== */
  const orsKey = process.env.REACT_APP_ORS_KEY;

  async function fetchCyclingRoute({ from, to }) {
    const url = `https://api.openrouteservice.org/v2/directions/cycling-regular?start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;
    const res = await fetch(url, { headers: { Authorization: orsKey } });
    if (!res.ok) throw new Error(`ORS ${res.status}`);
    const json = await res.json();
    const seg = json?.features?.[0]?.properties?.summary;
    if (!seg) throw new Error("Réponse ORS invalide");
    return { km: seg.distance / 1000, minutes: Math.round(seg.duration / 60) };
  }

  // Appel ORS quand on utilise Paris (arrondissements)
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!useParis) return;
      const A = PARIS_ARR.find((a) => a.id === arrDepart);
      const B = PARIS_ARR.find((a) => a.id === arrArrivee);
      if (!A || !B) return;

      const match = rows.find((r) => norm(r["lieu (ville/secteur)"]).includes(norm(B.label)));
      if (match) setLieuExcel(match["lieu (ville/secteur)"]);

      if (!orsKey) {
        setRouteErr("Ajoute REACT_APP_ORS_KEY dans .env pour calculer la route vélo.");
        return;
      }

      setLoadingRoute(true);
      setRouteErr("");
      try {
        const { km, minutes } = await fetchCyclingRoute({ from: A, to: B });
        if (abort) return;
        setDistance(Number(km.toFixed(2)));
        setMinutes(minutes);
        setDistanceSource("mappy-like");
      } catch (e) {
        if (abort) return;
        setRouteErr("Erreur de calcul d’itinéraire (ORS). Vérifie la clé API ou réessaie.");
      } finally {
        if (!abort) setLoadingRoute(false);
      }
    }
    run();
    return () => {
      abort = true;
    };
  }, [useParis, arrDepart, arrArrivee, rows, orsKey]);

  /* ========== Styles (visuel) ========== */
  const styles = {
    wrap: { maxWidth: 980, margin: "24px auto", padding: 16, fontFamily: "Inter, system-ui, sans-serif", color: "#111" },
    h1: { fontSize: 24, fontWeight: 700, marginBottom: 12 },
    card: { background: "#f7f7f8", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    row: { display: "grid", gridTemplateColumns: "1fr 2fr", alignItems: "center", gap: 8, marginBottom: 8 },
    input: { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", width: "100%" },
    select: { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", width: "100%" },
    label: { color: "#555", fontSize: 14 },
    sectionTitle: { fontWeight: 600, marginBottom: 8 },
    small: { fontSize: 12, color: "#777" },
    pill: { display: "inline-flex", gap: 8, padding: "6px 10px", borderRadius: 999, border: "1px solid #ddd", background: "#fff" },
    btnRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" },
    btn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer" },
    btnDanger: { padding: "8px 12px", borderRadius: 10, border: "1px solid #e66", background: "#fff5f5", color: "#b00", cursor: "pointer" },

    // invoice (aperçu simple)
    invoiceWrap: { background: "#fff", padding: 24, border: "1px solid #eee", borderRadius: 12 },
    invoiceHeader: { display: "flex", justifyContent: "space-between", marginBottom: 12 },
    invoiceTitle: { fontSize: 20, fontWeight: 700 },
    invoiceSub: { fontSize: 12, color: "#555" },
    invoiceGrid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 },
    table: { width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 },
    th: { textAlign: "left", borderBottom: "1px solid #e5e5e5", padding: "8px 6px" },
    td: { borderBottom: "1px solid #eee", padding: "6px" },
    totals: { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
    right: { textAlign: "right" },
  };

  /* ========== Export PDF (capture de l’aperçu simple) ========== */
  async function handleExportPDF() {
    if (!res || !current) return;
    const node = invoiceRef.current;
    const canvas = await html2canvas(node, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pdfH) {
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);
    } else {
      let y = 0;
      let heightLeft = imgH;
      while (heightLeft > 0) {
        pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
        heightLeft -= pdfH;
        y -= pdfH;
        if (heightLeft > 0) pdf.addPage();
      }
    }
    const fname = `Facture_Lapeyre_${todayISO()}.pdf`;
    pdf.save(fname);
  }

  /* ========== Export PDF (modèle Transitainer) ========== */
  function handleExportPDFTransitainer() {
    if (!res || !current) return;

    const dateFacture = todayISO();
    const num = numeroFacture || `LL-${dateFacture.replaceAll("-", "")}`;
    const client = clientNom || "Client";
    const clientAdr = clientAdresse || "";
    const tauxTVA = Number(tva) || 0;

    const lignes = [
      { date: dateFacture, lib: `Main d'œuvre (durée ${eur(res.dureeH)} h)`, qte: 1, unit: "U", pu: "", tva: `${tauxTVA}%`, mht: res.baseMO },
      { date: dateFacture, lib: useForfait ? `Déplacement (forfait ${eur(forfaitKm)} km, ${Math.max(1, forfaitDeliveries)} livr.)` : "Déplacement (forfait + km Excel)", qte: 1, unit: "U", pu: "", tva: `${tauxTVA}%`, mht: res.depl },
    ];
    if ((res.maj || 0) > 0) lignes.push({ date: dateFacture, lib: "Majoration (nuit / week-end)", qte: 1, unit: "U", pu: "", tva: `${tauxTVA}%`, mht: res.maj });
    if ((res.mRemise || 0) > 0) lignes.push({ date: dateFacture, lib: `Remise (${eur(res.remiseAppliquee)} %)`, qte: 1, unit: "U", pu: "", tva: `${tauxTVA}%`, mht: -Math.abs(res.mRemise) });

    const pdf = new jsPDF("p", "mm", "a4");
    const W = pdf.internal.pageSize.getWidth();
    const left = (x) => x;
    const right = (x) => W - x;
    let y = 15;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.text("Lapeyre Logistique", left(15), y);
    pdf.setFont(undefined, "normal");
    pdf.setFontSize(10);
    y += 5; pdf.text("SAS — SIRET : à compléter", left(15), y);
    y += 5; pdf.text("TVA intracom : à compléter", left(15), y);
    y += 5; pdf.text("Adresse siège : à compléter", left(15), y);
    y += 5; pdf.text("contact@lapeyre-logistique.fr • +33 1 23 45 67 89", left(15), y);

    // Bloc facture
    const topRight = 15;
    pdf.setFontSize(12); pdf.setFont(undefined, "bold");
    pdf.text("FACTURE", right(15), topRight, { align: "right" });
    pdf.setFont(undefined, "normal"); pdf.setFontSize(10);
    pdf.text(`N° : ${num}`, right(15), topRight + 6, { align: "right" });
    pdf.text(`Date : ${dateFacture.split("-").reverse().join("/")}`, right(15), topRight + 12, { align: "right" });

    // Client + Trajet
    y = 45;
    pdf.setFont(undefined, "bold"); pdf.text("Facturer à", left(15), y);
    pdf.setFont(undefined, "normal");
    y += 5; pdf.text(client, left(15), y);
    clientAdr.split("\n").forEach((line) => { y += 5; pdf.text(line, left(15), y); });

    const trajet = useParis
      ? `${(PARIS_ARR.find((a) => a.id === arrDepart) || {}).label || "—"} → ${(PARIS_ARR.find((a) => a.id === arrArrivee) || {}).label || "—"}`
      : "Distance manuelle";
    const infoTrajet = `Trajet: ${trajet}  •  ${eur(distance)} km  •  ${minutes} min  •  ${useForfait ? "Forfait livraison" : "Tarif Excel"}`;

    pdf.setFont(undefined, "bold");
    pdf.text("Détails du trajet", right(15), 45, { align: "right" });
    pdf.setFont(undefined, "normal");
    const wrapped = pdf.splitTextToSize(infoTrajet, 90);
    wrapped.forEach((line, i) => pdf.text(line, right(15), 50 + i * 5, { align: "right" }));

    // Tableau
    y = 75;
    const cols = [
      { k: "date", label: "Date", x: 15, w: 22, align: "left" },
      { k: "lib", label: "Désignation", x: 39, w: 78, align: "left" },
      { k: "qte", label: "Quantité", x: 119, w: 18, align: "right" },
      { k: "unit", label: "Unité", x: 139, w: 18, align: "center" },
      { k: "pu", label: "P.U.", x: 159, w: 18, align: "right" },
      { k: "tva", label: "TVA", x: 179, w: 12, align: "right" },
      { k: "mht", label: "Montant H.T.", x: 193, w: 17, align: "right" },
    ];
    pdf.setFont(undefined, "bold"); pdf.setFontSize(10);
    cols.forEach((c) => pdf.text(c.label, c.x, y, { align: c.align }));
    pdf.setLineWidth(0.3); pdf.line(15, y + 2, W - 15, y + 2);
    y += 8; pdf.setFont(undefined, "normal"); pdf.setFontSize(10);

    lignes.forEach((row) => {
      const vals = {
        date: row.date.split("-").reverse().join("/"),
        lib: row.lib,
        qte: String(row.qte),
        unit: row.unit,
        pu: row.pu ? eur(row.pu) : "—",
        tva: row.tva,
        mht: eur(row.mht),
      };
      const libLines = pdf.splitTextToSize(vals.lib, cols[1].w);
      const rowHeight = Math.max(6, libLines.length * 5);

      cols.forEach((c, idx) => {
        const lines = idx === 1 ? libLines : [vals[c.k]];
        lines.forEach((t, i) => {
          const yy = y + 4 + i * 5;
          let tx = c.x;
          const opt = { align: c.align };
          if (c.align === "right") tx = c.x + c.w;
          if (c.align === "center") tx = c.x + c.w / 2;
          pdf.text(t, tx, yy, opt);
        });
      });

      y += rowHeight + 2;
      pdf.setDrawColor(230); pdf.line(15, y, W - 15, y);
      y += 2;
    });

    // Totaux
    const xLabel = W - 70;
    const xVal = W - 15;
    pdf.setFont(undefined, "normal");
    pdf.text("Sous-total H.T.", xLabel, y + 2);
    pdf.text(eur(res.totalHT), xVal, y + 2, { align: "right" });

    pdf.text(`TVA (${tauxTVA} %)`, xLabel, y + 8);
    pdf.text(eur(res.tvaEur), xVal, y + 8, { align: "right" });

    pdf.setFont(undefined, "bold");
    pdf.text("Total T.T.C.", xLabel, y + 14);
    pdf.text(eur(res.totalTTC), xVal, y + 14, { align: "right" });

    // Pied
    let yFoot = y + 26;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");
    pdf.text("TVA acquittée sur les encaissements", 15, yFoot); yFoot += 5;
    pdf.text("Mode de règlement : Virement", 15, yFoot); yFoot += 5;
    pdf.text("RIB : À compléter (Banque / IBAN / BIC)", 15, yFoot); yFoot += 5;

    const legal = [
      "Les délais de paiement convenus ne peuvent dépasser 30 jours à compter de la date d'émission de la facture.",
      "Tout retard entraînera un intérêt au taux BCE (opération de financement la plus récente) + 10 pts,",
      "et l'indemnité forfaitaire pour frais de recouvrement de 40 € (art. D.441-5 du Code du Commerce).",
    ];
    legal.forEach((l) => { pdf.text(l, 15, yFoot); yFoot += 5; });

    pdf.save(`Facture_Lapeyre_${num}.pdf`);
  }

  /* ========== UI ========== */
  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>Calculateur – Vélo cargo (Paris + Excel)</h1>

      {/* 1) Base tarifs + TVA */}
      <div style={styles.card}>
        <div style={styles.grid2}>
          <div>
            <div style={styles.sectionTitle}>Base de tarifs (Excel)</div>
            <input type="file" accept=".xlsx,.xls" onChange={handleExcel} />
            <div style={styles.small}>
              Entêtes conseillées : Lieu, Tarif horaire, Forfait, Tarif au km, Durée minimale, Maj. nuit, Maj. WE, Remise max, (optionnel) Distance (km), Minutes.
            </div>
          </div>
          <div>
            <div style={styles.sectionTitle}>Paramètres globaux</div>
            <div style={styles.row}>
              <label style={styles.label}>TVA (%)</label>
              <input style={styles.input} type="number" value={tva} onChange={(e) => setTva(Number(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      {/* 2) Distance & Temps vélo (calcul réseau) */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Distance & Temps (vélo réel)</div>

        <div style={styles.row}>
          <label style={styles.label}>Mode distance</label>
          <select
            style={styles.select}
            value={useParis ? "Paris (arr.)" : "Manuelle"}
            onChange={(e) => setUseParis(e.target.value === "Paris (arr.)")}
          >
            <option>Paris (arr.)</option>
            <option>Manuelle</option>
          </select>
        </div>

        {useParis ? (
          <>
            <div style={styles.row}>
              <label style={styles.label}>Départ</label>
              <select style={styles.select} value={arrDepart} onChange={(e) => setArrDepart(Number(e.target.value))}>
                {PARIS_ARR.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.row}>
              <label style={styles.label}>Arrivée</label>
              <select style={styles.select} value={arrArrivee} onChange={(e) => setArrArrivee(Number(e.target.value))}>
                {PARIS_ARR.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            {loadingRoute ? (
              <div style={styles.small}>Calcul de l’itinéraire vélo…</div>
            ) : routeErr ? (
              <div style={{ ...styles.small, color: "#b00" }}>{routeErr}</div>
            ) : (
              <div style={{ marginTop: 6 }}>
                <strong>Distance (vélo)</strong> : <span style={{ fontWeight: 700 }}>{fmt(distance, 2)} km</span> •{" "}
                <strong>Temps (vélo)</strong> : <span style={{ fontWeight: 700 }}>{minutes} min</span>
                <div style={styles.btnRow}>
                  <a
                    style={styles.btn}
                    href={`https://fr.mappy.com/itineraire#/velo/${encodeURIComponent(
                      PARIS_ARR.find((a) => a.id === arrDepart)?.label || ""
                    )}/${encodeURIComponent(PARIS_ARR.find((a) => a.id === arrArrivee)?.label || "")}/1`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir l’itinéraire dans Mappy
                  </a>
                  <span style={styles.small}>Vérifie visuellement le trajet sur Mappy.</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={styles.row}>
              <label style={styles.label}>Distance (km) utilisée</label>
              <input
                style={styles.input}
                type="number"
                min={0}
                step={0.1}
                value={distance}
                onChange={(e) => {
                  setDistance(Number(e.target.value));
                  setDistanceSource("manuel");
                }}
              />
            </div>
            <div style={styles.row}>
              <label style={styles.label}>Minutes (utilisées)</label>
              <input
                style={styles.input}
                type="number"
                min={0}
                step={1}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </div>
          </>
        )}

        <div style={styles.small}>
          Source distance : <span style={styles.pill}>{useParis ? "calcul itinéraire vélo" : distanceSource}</span>
        </div>
      </div>

      {/* 2bis) Forfait livraison (optionnel) */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Forfait livraison (optionnel)</div>

        <div style={styles.row}>
          <label style={styles.label}>Activer le forfait</label>
          <select
            style={styles.select}
            value={useForfait ? "Oui" : "Non"}
            onChange={(e) => setUseForfait(e.target.value === "Oui")}
          >
            <option>Non</option>
            <option>Oui</option>
          </select>
        </div>

        {useForfait && (
          <>
            <div style={styles.row}>
              <label style={styles.label}>Kilomètres pour le forfait</label>
              <input
                style={styles.input}
                type="number"
                min={0}
                step={0.1}
                value={forfaitKm}
                onChange={(e) => setForfaitKm(Number(e.target.value))}
              />
            </div>
            <div style={styles.small}>(Règle : 37 € si ≤ 3 km, sinon +3,10 € par tranche de 3 km entamée)</div>

            <div style={styles.row}>
              <label style={styles.label}>Nombre total de livraisons</label>
              <input
                style={styles.input}
                type="number"
                min={1}
                step={1}
                value={forfaitDeliveries}
                onChange={(e) => setForfaitDeliveries(Number(e.target.value))}
              />
            </div>
            <div style={styles.small}>Chaque livraison supplémentaire au-delà de la 1ʳᵉ ajoute 10 €.</div>

            <div style={{ marginTop: 8 }}>
              <strong>Aperçu forfait</strong> :{" "}
              {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
                computeForfaitLivraison(Number(forfaitKm || 0), Number(forfaitDeliveries || 1))
              )}{" "}
              € HT
            </div>
          </>
        )}
      </div>

      {/* 3) Devis (lieu Excel → tarifs) */}
      <div style={styles.card}>
        <div style={styles.grid2}>
          <div>
            <div style={styles.sectionTitle}>Lieu (depuis Excel)</div>
            <div style={styles.row}>
              <label style={styles.label}>Lieu</label>
              <select style={styles.select} value={lieuExcel} onChange={(e) => setLieuExcel(e.target.value)}>
                <option value="">Choisir…</option>
                {lieux.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div style={styles.sectionTitle}>Modulateurs</div>
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
              <input
                style={styles.input}
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={remise}
                onChange={(e) => setRemise(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3bis) Champs personnalisés + Infos facture */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Champs personnalisés (facultatif)</div>
        {customFields.map((f) => (
          <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 8 }}>
            <input
              style={styles.input}
              placeholder="Libellé"
              value={f.label}
              onChange={(e) => updateField(f.id, "label", e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Valeur"
              value={f.value}
              onChange={(e) => updateField(f.id, "value", e.target.value)}
            />
            <button type="button" style={styles.btnDanger} onClick={() => removeField(f.id)}>
              Supprimer
            </button>
          </div>
        ))}
        <div style={styles.btnRow}>
          <button type="button" style={styles.btn} onClick={addField}>
            + Ajouter un champ
          </button>
          <span style={styles.small}>Ces champs n’impactent pas le calcul.</span>
        </div>

        <div style={{ height: 8 }} />

        <div style={styles.sectionTitle}>Infos facture</div>
        <div style={styles.grid2}>
          <div>
            <div style={styles.row}>
              <label style={styles.label}>Client – Nom</label>
              <input
                style={styles.input}
                value={clientNom}
                onChange={(e) => setClientNom(e.target.value)}
                placeholder="Société / Contact"
              />
            </div>
            <div style={styles.row}>
              <label style={styles.label}>Client – Adresse</label>
              <input
                style={styles.input}
                value={clientAdresse}
                onChange={(e) => setClientAdresse(e.target.value)}
                placeholder="Adresse complète"
              />
            </div>
          </div>
          <div>
            <div style={styles.row}>
              <label style={styles.label}>N° de facture</label>
              <input
                style={styles.input}
                value={numeroFacture}
                onChange={(e) => setNumeroFacture(e.target.value)}
                placeholder="Ex: LL-2025-001"
              />
            </div>
            <div className="row" style={styles.row}>
              <label style={styles.label}>Style de facture</label>
              <select
                style={styles.select}
                value={invoiceStyle}
                onChange={(e) => setInvoiceStyle(e.target.value)}
              >
                <option value="simple">Simple (aperçu ci-dessous)</option>
                <option value="transitainer">Modèle Transitainer</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 4) Résultat */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Calcul</div>
        {current ? (
          <div style={styles.grid2}>
            <div>
              <KV k="Durée facturable" v={res?.dureeH ?? 0} suf="h" />
              <KV k="Base MO (HT)" v={res?.baseMO ?? 0} suf="€" />
              <KV k="Déplacement (HT)" v={res?.depl ?? 0} suf="€" />
              {useForfait ? (
                <>
                  <KV k="Mode déplacement" v={"Forfait livraison"} />
                  <KV k="Détail forfait" v={`${fmt(forfaitKm, 2)} km • ${Math.max(1, forfaitDeliveries)} livraison(s)`} />
                </>
              ) : (
                <KV k="Mode déplacement" v={"Tarif Excel (forfait + km)"} />
              )}
              <KV k="Majoration (HT)" v={res?.maj ?? 0} suf="€" />
              <KV k="Sous-total (HT)" v={res?.sousTotal ?? 0} suf="€" />
              <KV k="Remise appliquée" v={res?.remiseAppliquee ?? 0} suf="%" />
              <KV k="Montant remise" v={res?.mRemise ?? 0} suf="€" />
            </div>
            <div>
              <KV k={`Total après remise (HT)`} v={res?.totalHT ?? 0} suf="€" strong />
              <KV k={`TVA (${tva}%)`} v={res?.tvaEur ?? 0} suf="€" />
              <KV k={`TOTAL À FACTURER (TTC)`} v={res?.totalTTC ?? 0} suf="€" strong big />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#777" }}>Importez un Excel et choisissez un lieu pour afficher le calcul.</div>
        )}
      </div>

      {/* 5) Facture (aperçu simple + export) */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Facture PDF • Aperçu simple</div>

        {/* APERÇU SIMPLE CAPTURE POUR PDF */}
        <div ref={invoiceRef} style={styles.invoiceWrap}>
          <div style={styles.invoiceHeader}>
            <div>
              <div style={styles.invoiceTitle}>Lapeyre Logistique</div>
              <div style={styles.invoiceSub}>SIRET / TVA intracom : à compléter</div>
              <div style={styles.invoiceSub}>contact@lapeyre-logistique.fr • +33 1 23 45 67 89</div>
              <div style={styles.invoiceSub}>Adresse siège : à compléter</div>
            </div>
            <div className="right">
              <div style={{ fontWeight: 600 }}>FACTURE</div>
              <div>N°: {numeroFacture || "—"}</div>
              <div>Date: {todayFR()}</div>
            </div>
          </div>

          <div style={styles.invoiceGrid2}>
            <div>
              <div style={{ fontWeight: 600 }}>Facturer à</div>
              <div>{clientNom || "—"}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{clientAdresse || ""}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Détails du trajet</div>
              <div>
                {useParis
                  ? `Trajet: ${PARIS_ARR.find(a => a.id === arrDepart)?.label || "—"} → ${PARIS_ARR.find(a => a.id === arrArrivee)?.label || "—"}`
                  : `Distance manuelle`}
              </div>
              <div>Distance: {fmt(distance, 2)} km • Temps: {minutes} min</div>
              <div>Mode déplacement: {useForfait ? "Forfait livraison" : "Tarif Excel (forfait + km)"}</div>
            </div>
          </div>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Description</th>
                <th style={styles.th}>Qté</th>
                <th style={styles.th}>PU HT</th>
                <th style={styles.th}>Montant HT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.td}>Main d'œuvre (durée facturable {fmt(res?.dureeH ?? 0, 2)} h)</td>
                <td style={styles.td}>1</td>
                <td style={styles.td}>—</td>
                <td style={styles.td}>{eur(res?.baseMO ?? 0)}</td>
              </tr>
              <tr>
                <td style={styles.td}>
                  Déplacement {useForfait ? `(forfait ${fmt(forfaitKm, 2)} km, ${Math.max(1, forfaitDeliveries)} livr.)` : "(forfait + km Excel)"}
                </td>
                <td style={styles.td}>1</td>
                <td style={styles.td}>—</td>
                <td style={styles.td}>{eur(res?.depl ?? 0)}</td>
              </tr>
              {(res?.maj ?? 0) > 0 && (
                <tr>
                  <td style={styles.td}>Majoration (nuit / week-end)</td>
                  <td style={styles.td}>1</td>
                  <td style={styles.td}>—</td>
                  <td style={styles.td}>{eur(res?.maj ?? 0)}</td>
                </tr>
              )}
              {(res?.mRemise ?? 0) > 0 && (
                <tr>
                  <td style={styles.td}>Remise ({fmt(res?.remiseAppliquee ?? 0, 2)} %)</td>
                  <td style={styles.td}>1</td>
                  <td style={styles.td}>—</td>
                  <td style={styles.td}>- {eur(res?.mRemise ?? 0)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={styles.totals}>
            <div />
            <div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>Sous-total HT</div>
                <div>{eur(res?.totalHT ?? 0)}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>TVA ({tva} %)</div>
                <div>{eur(res?.tvaEur ?? 0)}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <div>Total TTC</div>
                <div>{eur(res?.totalTTC ?? 0)}</div>
              </div>
            </div>
          </div>

          {customFields.length > 0 && (
            <>
              <div style={{ height: 8 }} />
              <div style={{ fontWeight: 600 }}>Références</div>
              <ul style={{ marginTop: 6 }}>
                {customFields
                  .filter((f) => f.label || f.value)
                  .map((f) => (
                    <li key={f.id}>
                      {f.label || "—"} : {f.value || "—"}
                    </li>
                  ))}
              </ul>
            </>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
            Conditions de paiement : 30 jours fin de mois • Pénalités de retard selon CGV.
          </div>
        </div>

        <div style={styles.btnRow}>
          <button
            type="button"
            style={{ ...styles.btn, borderColor: "#0a84ff" }}
            disabled={!res || !current}
            onClick={() =>
              invoiceStyle === "transitainer" ? handleExportPDFTransitainer() : handleExportPDF()
            }
          >
            Exporter en PDF
          </button>
          {!res && <span style={styles.small}>Importe un Excel et calcule d’abord un résultat.</span>}
        </div>
      </div>
    </div>
  );
}

/* ================== Petits composants ================== */
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


