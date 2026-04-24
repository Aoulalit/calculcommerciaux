import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const ROUTE_API_URL =
  process.env.REACT_APP_ROUTE_API_URL ||
  "http://localhost:4000/api/routes/bike";

const STORAGE_KEYS = {
  company: "velocargo_company",
  invoice: "velocargo_invoice",
  client: "velocargo_client",
  trip: "velocargo_trip",
  pricing: "velocargo_pricing",
  customFields: "velocargo_custom_fields",
  entries: "velocargo_entries",
};

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayFR = () => {
  const [y, m, d] = todayISO().split("-");
  return `${d}/${m}/${y}`;
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const eur = (value) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value));

const fmt = (value, digits = 2) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNumber(value));

const formatInvoiceDate = (value) => {
  if (!value) return todayFR();
  const parts = String(value).split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const defaultCompany = {
  name: "Lapeyre Logistique",
  legalForm: "SAS",
  siret: "",
  vatNumber: "",
  address: "",
  email: "",
  phone: "",
  iban: "",
  bic: "",
};

const defaultInvoice = {
  number: `VL-${todayISO().replaceAll("-", "")}`,
  date: todayISO(),
  paymentMode: "Virement",
  notes: "Merci pour votre confiance.\nRèglement à réception de facture.",
};

const defaultClient = {
  name: "",
  address: "",
  contact: "",
  email: "",
};

const defaultTrip = {
  designation: "Prestation vélo cargo",
  departureAddress: "",
  arrivalAddress: "",
  location: "Paris",
  distanceKm: 0,
  minutes: 0,
  deliveries: 1,
  isNight: false,
  isWeekend: false,
  useForfait: false,
  forfaitLabel: "Forfait livraison",
  comments: "",
  departureCoords: null,
  arrivalCoords: null,
  routeProvider: "",
};

const defaultPricing = {
  baseCourse: 0,
  pricePerKm: 1,
  pricePerMinute: 0,
  hourlyRate: 0,
  minimumHours: 0,
  forfaitPrice: 25,
  nightPct: 15,
  weekendPct: 20,
  discountPct: 0,
  vatPct: 20,
};

const defaultCustomFields = [
  {
    id: uid(),
    label: "Nom du coursier",
    value: "",
    showInPdf: true,
    showInExcel: true,
  },
  {
    id: uid(),
    label: "Type de marchandise",
    value: "",
    showInPdf: true,
    showInExcel: true,
  },
];

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Erreur lecture localStorage pour ${key}`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Erreur écriture localStorage pour ${key}`, error);
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Erreur suppression localStorage pour ${key}`, error);
  }
}

function buildCalculation(trip, pricing) {
  const distanceKm = Math.max(0, toNumber(trip.distanceKm));
  const minutes = Math.max(0, toNumber(trip.minutes));
  const deliveries = Math.max(1, toNumber(trip.deliveries));

  const baseCourse = Math.max(0, toNumber(pricing.baseCourse));
  const pricePerKm = Math.max(0, toNumber(pricing.pricePerKm));
  const pricePerMinute = Math.max(0, toNumber(pricing.pricePerMinute));
  const hourlyRate = Math.max(0, toNumber(pricing.hourlyRate));
  const minimumHours = Math.max(0, toNumber(pricing.minimumHours));
  const forfaitPrice = Math.max(0, toNumber(pricing.forfaitPrice));
  const nightPct = Math.max(0, toNumber(pricing.nightPct));
  const weekendPct = Math.max(0, toNumber(pricing.weekendPct));
  const discountPct = Math.max(0, toNumber(pricing.discountPct));
  const vatPct = Math.max(0, toNumber(pricing.vatPct));

  const rawHours = minutes / 60;
  const billedHours = Math.max(rawHours, minimumHours);

  const distanceAmount = distanceKm * pricePerKm;
  const minuteAmount = minutes * pricePerMinute;
  const hourlyAmount = hourlyRate > 0 ? billedHours * hourlyRate : 0;

  const transportHT = trip.useForfait
    ? forfaitPrice
    : baseCourse + distanceAmount + minuteAmount + hourlyAmount;

  const majorationPct =
    (trip.isNight ? nightPct : 0) + (trip.isWeekend ? weekendPct : 0);

  const majorationHT = (transportHT * majorationPct) / 100;
  const subtotalHT = transportHT;
  const beforeDiscountHT = subtotalHT + majorationHT;
  const discountAmountHT = (beforeDiscountHT * discountPct) / 100;
  const totalHT = beforeDiscountHT - discountAmountHT;
  const vatAmount = (totalHT * vatPct) / 100;
  const totalTTC = totalHT + vatAmount;

  return {
    deliveries,
    rawHours,
    billedHours,
    distanceAmount,
    minuteAmount,
    hourlyAmount,
    transportHT,
    majorationPct,
    majorationHT,
    subtotalHT,
    beforeDiscountHT,
    discountAmountHT,
    totalHT,
    vatPct,
    vatAmount,
    totalTTC,
  };
}

function buildMetaSummary(customFields) {
  return customFields
    .filter((f) => String(f.label || "").trim() && String(f.value || "").trim())
    .map((f) => `${f.label} : ${f.value}`)
    .join(" • ");
}

function buildEntry({ invoice, client, trip, pricing, customFields }) {
  const results = buildCalculation(trip, pricing);

  return {
    id: uid(),
    invoiceSnapshot: { ...invoice },
    clientSnapshot: { ...client },
    tripSnapshot: {
      ...trip,
      departureCoords: trip.departureCoords ? [...trip.departureCoords] : null,
      arrivalCoords: trip.arrivalCoords ? [...trip.arrivalCoords] : null,
    },
    pricingSnapshot: { ...pricing },
    customFieldsSnapshot: customFields.map((field) => ({ ...field })),
    results,
    createdAt: new Date().toISOString(),
    designation:
      trip.designation?.trim() ||
      `Course vélo cargo ${trip.departureAddress || "Départ"} → ${
        trip.arrivalAddress || "Arrivée"
      }`,
    metaSummary: buildMetaSummary(customFields),
  };
}

export default function ExcelReader() {
  const invoiceRef = useRef(null);

  const [company, setCompany] = useState(() =>
    readStorage(STORAGE_KEYS.company, defaultCompany)
  );
  const [invoice, setInvoice] = useState(() =>
    readStorage(STORAGE_KEYS.invoice, defaultInvoice)
  );
  const [client, setClient] = useState(() =>
    readStorage(STORAGE_KEYS.client, defaultClient)
  );
  const [trip, setTrip] = useState(() =>
    readStorage(STORAGE_KEYS.trip, defaultTrip)
  );
  const [pricing, setPricing] = useState(() =>
    readStorage(STORAGE_KEYS.pricing, defaultPricing)
  );
  const [customFields, setCustomFields] = useState(() =>
    readStorage(STORAGE_KEYS.customFields, defaultCustomFields)
  );
  const [entries, setEntries] = useState(() =>
    readStorage(STORAGE_KEYS.entries, [])
  );
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeSuccess, setRouteSuccess] = useState("");

  useEffect(() => {
    writeStorage(STORAGE_KEYS.company, company);
  }, [company]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.invoice, invoice);
  }, [invoice]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.client, client);
  }, [client]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.trip, trip);
  }, [trip]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.pricing, pricing);
  }, [pricing]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.customFields, customFields);
  }, [customFields]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.entries, entries);
  }, [entries]);

  const currentCalc = useMemo(
    () => buildCalculation(trip, pricing),
    [trip, pricing]
  );

  // IMPORTANT :
  // La prévisualisation PDF est TOUJOURS reconstruite à partir des champs en cours.
  // Donc elle suit en temps réel chaque modif + le bouton Charger.
  const currentPreviewEntry = useMemo(() => {
    return buildEntry({
      invoice,
      client,
      trip,
      pricing,
      customFields,
    });
  }, [
    invoice.number,
    invoice.date,
    invoice.paymentMode,
    invoice.notes,
    client.name,
    client.address,
    client.contact,
    client.email,
    trip.designation,
    trip.departureAddress,
    trip.arrivalAddress,
    trip.location,
    trip.distanceKm,
    trip.minutes,
    trip.deliveries,
    trip.isNight,
    trip.isWeekend,
    trip.useForfait,
    trip.forfaitLabel,
    trip.comments,
    trip.routeProvider,
    pricing.baseCourse,
    pricing.pricePerKm,
    pricing.pricePerMinute,
    pricing.hourlyRate,
    pricing.minimumHours,
    pricing.forfaitPrice,
    pricing.nightPct,
    pricing.weekendPct,
    pricing.discountPct,
    pricing.vatPct,
    customFields,
  ]);

  const previewLines = useMemo(() => {
    return [currentPreviewEntry];
  }, [currentPreviewEntry]);

  const previewTotals = useMemo(() => {
    return previewLines.reduce(
      (acc, line) => {
        acc.totalHT += line.results.totalHT;
        acc.vatAmount += line.results.vatAmount;
        acc.totalTTC += line.results.totalTTC;
        return acc;
      },
      { totalHT: 0, vatAmount: 0, totalTTC: 0 }
    );
  }, [previewLines]);

  const dashboard = useMemo(() => {
    return entries.reduce(
      (acc, line) => {
        acc.totalCourses += 1;
        acc.totalKm += toNumber(line.tripSnapshot.distanceKm);
        acc.totalMinutes += toNumber(line.tripSnapshot.minutes);
        acc.totalHT += toNumber(line.results.totalHT);
        acc.totalTTC += toNumber(line.results.totalTTC);
        return acc;
      },
      {
        totalCourses: 0,
        totalKm: 0,
        totalMinutes: 0,
        totalHT: 0,
        totalTTC: 0,
      }
    );
  }, [entries]);

  const visiblePdfFields = customFields.filter(
    (field) =>
      field.showInPdf &&
      String(field.label || "").trim() &&
      String(field.value || "").trim()
  );

  const updateCompany = (key, value) =>
    setCompany((prev) => ({ ...prev, [key]: value }));

  const updateInvoice = (key, value) =>
    setInvoice((prev) => ({ ...prev, [key]: value }));

  const updateClient = (key, value) =>
    setClient((prev) => ({ ...prev, [key]: value }));

  const updateTrip = (key, value) =>
    setTrip((prev) => ({ ...prev, [key]: value }));

  const updatePricing = (key, value) =>
    setPricing((prev) => ({ ...prev, [key]: value }));

  const addCustomField = () => {
    setCustomFields((prev) => [
      ...prev,
      {
        id: uid(),
        label: "",
        value: "",
        showInPdf: true,
        showInExcel: true,
      },
    ]);
  };

  const updateCustomField = (id, key, value) => {
    setCustomFields((prev) =>
      prev.map((field) =>
        field.id === id ? { ...field, [key]: value } : field
      )
    );
  };

  const removeCustomField = (id) => {
    setCustomFields((prev) => prev.filter((field) => field.id !== id));
  };

  const handleCalculateRoute = async () => {
    setRouteError("");
    setRouteSuccess("");

    if (!trip.departureAddress.trim() || !trip.arrivalAddress.trim()) {
      setRouteError("Renseigne l’adresse de départ et l’adresse d’arrivée.");
      return;
    }

    try {
      setRouteLoading(true);

      const response = await fetch(ROUTE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          departureAddress: trip.departureAddress.trim(),
          arrivalAddress: trip.arrivalAddress.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Impossible de calculer le trajet vélo.");
      }

      setTrip((prev) => ({
        ...prev,
        departureAddress: data.departureAddress || prev.departureAddress,
        arrivalAddress: data.arrivalAddress || prev.arrivalAddress,
        departureCoords: Array.isArray(data.departureCoords)
          ? data.departureCoords
          : null,
        arrivalCoords: Array.isArray(data.arrivalCoords)
          ? data.arrivalCoords
          : null,
        distanceKm: Number(toNumber(data.distanceKm).toFixed(2)),
        minutes: Math.ceil(toNumber(data.minutes)),
        routeProvider: data.routeProvider || "backend / openrouteservice",
      }));

      setRouteSuccess("Trajet vélo calculé avec succès.");
    } catch (error) {
      setRouteError(error.message || "Erreur lors du calcul du trajet.");
    } finally {
      setRouteLoading(false);
    }
  };

  const handleAddEntry = () => {
    const entry = buildEntry({
      invoice,
      client,
      trip,
      pricing,
      customFields,
    });

    setEntries((prev) => [...prev, entry]);
    setRouteSuccess("Prestation ajoutée et sauvegardée automatiquement.");
    setRouteError("");
  };

  const handleDeleteEntry = (id) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleClearEntries = () => {
    setEntries([]);
    removeStorage(STORAGE_KEYS.entries);
    setRouteSuccess("Liste vidée et sauvegarde supprimée.");
    setRouteError("");
  };

  const handleLoadEntry = (entry) => {
    setInvoice({ ...entry.invoiceSnapshot });
    setClient({ ...entry.clientSnapshot });
    setTrip({
      ...entry.tripSnapshot,
      departureCoords: entry.tripSnapshot.departureCoords
        ? [...entry.tripSnapshot.departureCoords]
        : null,
      arrivalCoords: entry.tripSnapshot.arrivalCoords
        ? [...entry.tripSnapshot.arrivalCoords]
        : null,
    });
    setPricing({ ...entry.pricingSnapshot });
    setCustomFields(entry.customFieldsSnapshot.map((field) => ({ ...field })));
    setRouteError("");
    setRouteSuccess("Prestation rechargée dans le formulaire.");
  };

  const handleResetDraft = () => {
    setCompany(defaultCompany);
    setInvoice(defaultInvoice);
    setClient(defaultClient);
    setTrip(defaultTrip);
    setPricing(defaultPricing);
    setCustomFields(defaultCustomFields);

    removeStorage(STORAGE_KEYS.company);
    removeStorage(STORAGE_KEYS.invoice);
    removeStorage(STORAGE_KEYS.client);
    removeStorage(STORAGE_KEYS.trip);
    removeStorage(STORAGE_KEYS.pricing);
    removeStorage(STORAGE_KEYS.customFields);

    setRouteError("");
    setRouteSuccess("Formulaire réinitialisé.");
  };

  const buildExcelRows = () => {
    const sourceEntries = entries.length > 0 ? entries : [currentPreviewEntry];

    const allDynamicLabels = Array.from(
      new Set(
        sourceEntries.flatMap((entry) =>
          entry.customFieldsSnapshot
            .filter((field) => field.showInExcel && String(field.label).trim())
            .map((field) => field.label.trim())
        )
      )
    );

    return sourceEntries.map((entry) => {
      const dynamicData = {};
      allDynamicLabels.forEach((label) => {
        const found = entry.customFieldsSnapshot.find(
          (field) =>
            field.showInExcel && String(field.label || "").trim() === label
        );
        dynamicData[label] = found?.value || "";
      });

      return {
        "Date facture": entry.invoiceSnapshot.date || "",
        "N° facture": entry.invoiceSnapshot.number || "",
        Client: entry.clientSnapshot.name || "",
        "Adresse client": entry.clientSnapshot.address || "",
        Contact: entry.clientSnapshot.contact || "",
        "Email client": entry.clientSnapshot.email || "",
        Société: company.name || "",
        Lieu: entry.tripSnapshot.location || "",
        Désignation: entry.designation || "",
        "Adresse départ": entry.tripSnapshot.departureAddress || "",
        "Adresse arrivée": entry.tripSnapshot.arrivalAddress || "",
        "Distance (km)": toNumber(entry.tripSnapshot.distanceKm),
        "Temps (min)": toNumber(entry.tripSnapshot.minutes),
        "Nombre de livraisons": toNumber(entry.tripSnapshot.deliveries),
        Nuit: entry.tripSnapshot.isNight ? "Oui" : "Non",
        "Week-end": entry.tripSnapshot.isWeekend ? "Oui" : "Non",
        "Mode déplacement": entry.tripSnapshot.useForfait
          ? entry.tripSnapshot.forfaitLabel || "Forfait"
          : "Adresse réelle / trajet vélo",
        "Fournisseur route": entry.tripSnapshot.routeProvider || "",
        "Base course HT": toNumber(entry.pricingSnapshot.baseCourse),
        "Prix au km HT": toNumber(entry.pricingSnapshot.pricePerKm),
        "Prix à la minute HT": toNumber(entry.pricingSnapshot.pricePerMinute),
        "Tarif horaire HT": toNumber(entry.pricingSnapshot.hourlyRate),
        "Durée mini (h)": toNumber(entry.pricingSnapshot.minimumHours),
        "Forfait déplacement HT": toNumber(entry.pricingSnapshot.forfaitPrice),
        "Majoration nuit (%)": toNumber(entry.pricingSnapshot.nightPct),
        "Majoration week-end (%)": toNumber(entry.pricingSnapshot.weekendPct),
        "Remise (%)": toNumber(entry.pricingSnapshot.discountPct),
        "TVA (%)": toNumber(entry.pricingSnapshot.vatPct),
        "Heures réelles": toNumber(entry.results.rawHours),
        "Heures facturées": toNumber(entry.results.billedHours),
        "Montant distance HT": toNumber(entry.results.distanceAmount),
        "Montant temps HT": toNumber(entry.results.minuteAmount),
        "Montant horaire HT": toNumber(entry.results.hourlyAmount),
        "Déplacement HT": toNumber(entry.results.transportHT),
        "Majoration (%)": toNumber(entry.results.majorationPct),
        "Majoration HT": toNumber(entry.results.majorationHT),
        "Sous-total HT": toNumber(entry.results.subtotalHT),
        "Avant remise HT": toNumber(entry.results.beforeDiscountHT),
        "Montant remise HT": toNumber(entry.results.discountAmountHT),
        "Total HT": toNumber(entry.results.totalHT),
        "TVA (€)": toNumber(entry.results.vatAmount),
        "Total TTC": toNumber(entry.results.totalTTC),
        "Commentaires trajet": entry.tripSnapshot.comments || "",
        ...dynamicData,
      };
    });
  };

  const handleExportExcel = () => {
    const rows = buildExcelRows();
    if (!rows.length) return;

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(key.length + 2, 18),
    }));

    XLSX.utils.book_append_sheet(wb, ws, "Depenses Velocargo");
    XLSX.writeFile(
      wb,
      `depenses_velocargo_${invoice.number || "sans_numero"}_${todayISO()}.xlsx`
    );
  };

  const handleExportPDF = async () => {
    if (!invoiceRef.current) return;

    const canvas = await html2canvas(invoiceRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position -= pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(`facture_velocargo_${invoice.number || todayISO()}.pdf`);
  };

  return (
    <div className="page">
      <div className="container">
        <div className="hero">
          <div>
            <p className="eyebrow">Velocargo • Adresses réelles • PDF • Excel</p>
            <h1>Tableau de bord Velocargo</h1>
            <p className="hero-text">
              Tu saisis les vraies adresses, le backend calcule le trajet vélo,
              puis le prix est généré automatiquement selon tes règles tarifaires.
            </p>
          </div>

          <div className="hero-actions">
            <button className="btn btn-primary" onClick={handleAddEntry}>
              Ajouter la prestation
            </button>
            <button className="btn btn-secondary" onClick={handleExportExcel}>
              Export Excel
            </button>
            <button className="btn btn-secondary" onClick={handleExportPDF}>
              Export PDF
            </button>
            <button className="btn btn-secondary" onClick={handleResetDraft}>
              Réinitialiser le formulaire
            </button>
            <button className="btn btn-danger" onClick={handleClearEntries}>
              Vider la liste
            </button>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Prestations</span>
            <strong>{dashboard.totalCourses}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Kilomètres</span>
            <strong>{fmt(dashboard.totalKm, 2)} km</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Temps total</span>
            <strong>{fmt(dashboard.totalMinutes, 0)} min</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total HT</span>
            <strong>{eur(dashboard.totalHT)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total TTC</span>
            <strong>{eur(dashboard.totalTTC)}</strong>
          </div>
        </div>

        <div className="layout">
          <div className="left-column">
            <section className="card">
              <h2>Informations société</h2>
              <div className="grid-2">
                <div className="field">
                  <label>Nom société</label>
                  <input
                    value={company.name}
                    onChange={(e) => updateCompany("name", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Forme juridique</label>
                  <input
                    value={company.legalForm}
                    onChange={(e) => updateCompany("legalForm", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>SIRET</label>
                  <input
                    value={company.siret}
                    onChange={(e) => updateCompany("siret", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>TVA intracom</label>
                  <input
                    value={company.vatNumber}
                    onChange={(e) => updateCompany("vatNumber", e.target.value)}
                  />
                </div>
                <div className="field field-full">
                  <label>Adresse</label>
                  <textarea
                    rows="3"
                    value={company.address}
                    onChange={(e) => updateCompany("address", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input
                    value={company.email}
                    onChange={(e) => updateCompany("email", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Téléphone</label>
                  <input
                    value={company.phone}
                    onChange={(e) => updateCompany("phone", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>IBAN</label>
                  <input
                    value={company.iban}
                    onChange={(e) => updateCompany("iban", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>BIC</label>
                  <input
                    value={company.bic}
                    onChange={(e) => updateCompany("bic", e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="card">
              <h2>Facture & client</h2>
              <div className="grid-2">
                <div className="field">
                  <label>N° facture</label>
                  <input
                    value={invoice.number}
                    onChange={(e) => updateInvoice("number", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={invoice.date}
                    onChange={(e) => updateInvoice("date", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Client</label>
                  <input
                    value={client.name}
                    onChange={(e) => updateClient("name", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Contact client</label>
                  <input
                    value={client.contact}
                    onChange={(e) => updateClient("contact", e.target.value)}
                  />
                </div>
                <div className="field field-full">
                  <label>Adresse client</label>
                  <textarea
                    rows="3"
                    value={client.address}
                    onChange={(e) => updateClient("address", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Email client</label>
                  <input
                    value={client.email}
                    onChange={(e) => updateClient("email", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Mode de règlement</label>
                  <input
                    value={invoice.paymentMode}
                    onChange={(e) =>
                      updateInvoice("paymentMode", e.target.value)
                    }
                  />
                </div>
              </div>
            </section>

            <section className="card">
              <div className="section-head">
                <h2>Prestation Velocargo</h2>
                <button
                  className="btn btn-secondary"
                  onClick={handleCalculateRoute}
                  disabled={routeLoading}
                >
                  {routeLoading ? "Calcul en cours..." : "Calculer trajet vélo"}
                </button>
              </div>

              <div className="grid-2">
                <div className="field field-full">
                  <label>Désignation</label>
                  <input
                    value={trip.designation}
                    onChange={(e) => updateTrip("designation", e.target.value)}
                  />
                </div>

                <div className="field field-full">
                  <label>Adresse de départ</label>
                  <input
                    value={trip.departureAddress}
                    onChange={(e) =>
                      updateTrip("departureAddress", e.target.value)
                    }
                    placeholder="Ex : 10 Rue de Rivoli, Paris"
                  />
                </div>

                <div className="field field-full">
                  <label>Adresse d’arrivée</label>
                  <input
                    value={trip.arrivalAddress}
                    onChange={(e) =>
                      updateTrip("arrivalAddress", e.target.value)
                    }
                    placeholder="Ex : 25 Avenue de l’Opéra, Paris"
                  />
                </div>

                <div className="field">
                  <label>Lieu</label>
                  <input
                    value={trip.location}
                    onChange={(e) => updateTrip("location", e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Nombre de livraisons</label>
                  <input
                    type="number"
                    min="1"
                    value={trip.deliveries}
                    onChange={(e) =>
                      updateTrip("deliveries", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Distance (km)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={trip.distanceKm}
                    onChange={(e) =>
                      updateTrip("distanceKm", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Temps (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    value={trip.minutes}
                    onChange={(e) =>
                      updateTrip("minutes", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Libellé forfait</label>
                  <input
                    value={trip.forfaitLabel}
                    onChange={(e) => updateTrip("forfaitLabel", e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Fournisseur trajet</label>
                  <input
                    value={trip.routeProvider}
                    onChange={(e) => updateTrip("routeProvider", e.target.value)}
                    placeholder="Calcul auto ou saisie manuelle"
                  />
                </div>

                <div className="field field-full">
                  <label>Commentaires</label>
                  <textarea
                    rows="3"
                    value={trip.comments}
                    onChange={(e) => updateTrip("comments", e.target.value)}
                  />
                </div>
              </div>

              {routeError ? <div className="alert alert-error">{routeError}</div> : null}
              {routeSuccess ? (
                <div className="alert alert-success">{routeSuccess}</div>
              ) : null}

              <div className="checkbox-row">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={trip.useForfait}
                    onChange={(e) => updateTrip("useForfait", e.target.checked)}
                  />
                  Utiliser le forfait déplacement
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={trip.isNight}
                    onChange={(e) => updateTrip("isNight", e.target.checked)}
                  />
                  Prestation de nuit
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={trip.isWeekend}
                    onChange={(e) => updateTrip("isWeekend", e.target.checked)}
                  />
                  Prestation week-end
                </label>
              </div>
            </section>

            <section className="card">
              <h2>Tarification</h2>
              <div className="grid-2">
                <div className="field">
                  <label>Base course HT</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.baseCourse}
                    onChange={(e) =>
                      updatePricing("baseCourse", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Prix au km HT</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.pricePerKm}
                    onChange={(e) =>
                      updatePricing("pricePerKm", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Prix à la minute HT</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.pricePerMinute}
                    onChange={(e) =>
                      updatePricing("pricePerMinute", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Tarif horaire HT</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.hourlyRate}
                    onChange={(e) =>
                      updatePricing("hourlyRate", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Durée minimale (h)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.minimumHours}
                    onChange={(e) =>
                      updatePricing("minimumHours", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Forfait déplacement HT</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.forfaitPrice}
                    onChange={(e) =>
                      updatePricing("forfaitPrice", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>TVA (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.vatPct}
                    onChange={(e) =>
                      updatePricing("vatPct", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Majoration nuit (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.nightPct}
                    onChange={(e) =>
                      updatePricing("nightPct", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Majoration week-end (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.weekendPct}
                    onChange={(e) =>
                      updatePricing("weekendPct", toNumber(e.target.value))
                    }
                  />
                </div>

                <div className="field">
                  <label>Remise (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pricing.discountPct}
                    onChange={(e) =>
                      updatePricing("discountPct", toNumber(e.target.value))
                    }
                  />
                </div>
              </div>
            </section>

            <section className="card">
              <div className="section-head">
                <h2>Champs modulables</h2>
                <button className="btn btn-secondary" onClick={addCustomField}>
                  Ajouter un champ
                </button>
              </div>

              <div className="dynamic-list">
                {customFields.map((field) => (
                  <div key={field.id} className="dynamic-row">
                    <div className="field">
                      <label>Nom du champ</label>
                      <input
                        value={field.label}
                        onChange={(e) =>
                          updateCustomField(field.id, "label", e.target.value)
                        }
                      />
                    </div>

                    <div className="field">
                      <label>Valeur</label>
                      <input
                        value={field.value}
                        onChange={(e) =>
                          updateCustomField(field.id, "value", e.target.value)
                        }
                      />
                    </div>

                    <label className="check inline-check">
                      <input
                        type="checkbox"
                        checked={field.showInPdf}
                        onChange={(e) =>
                          updateCustomField(
                            field.id,
                            "showInPdf",
                            e.target.checked
                          )
                        }
                      />
                      PDF
                    </label>

                    <label className="check inline-check">
                      <input
                        type="checkbox"
                        checked={field.showInExcel}
                        onChange={(e) =>
                          updateCustomField(
                            field.id,
                            "showInExcel",
                            e.target.checked
                          )
                        }
                      />
                      Excel
                    </label>

                    <button
                      className="btn btn-danger"
                      onClick={() => removeCustomField(field.id)}
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <h2>Calcul en direct</h2>
              <div className="calc-grid">
                <div className="calc-item">
                  <span>Montant distance HT</span>
                  <strong>{eur(currentCalc.distanceAmount)}</strong>
                </div>
                <div className="calc-item">
                  <span>Montant temps HT</span>
                  <strong>{eur(currentCalc.minuteAmount)}</strong>
                </div>
                <div className="calc-item">
                  <span>Montant horaire HT</span>
                  <strong>{eur(currentCalc.hourlyAmount)}</strong>
                </div>
                <div className="calc-item">
                  <span>Déplacement HT</span>
                  <strong>{eur(currentCalc.transportHT)}</strong>
                </div>
                <div className="calc-item">
                  <span>Heures réelles</span>
                  <strong>{fmt(currentCalc.rawHours, 2)} h</strong>
                </div>
                <div className="calc-item">
                  <span>Heures facturées</span>
                  <strong>{fmt(currentCalc.billedHours, 2)} h</strong>
                </div>
                <div className="calc-item">
                  <span>Majoration</span>
                  <strong>
                    {fmt(currentCalc.majorationPct, 2)} % •{" "}
                    {eur(currentCalc.majorationHT)}
                  </strong>
                </div>
                <div className="calc-item">
                  <span>Avant remise HT</span>
                  <strong>{eur(currentCalc.beforeDiscountHT)}</strong>
                </div>
                <div className="calc-item">
                  <span>Remise HT</span>
                  <strong>{eur(currentCalc.discountAmountHT)}</strong>
                </div>
                <div className="calc-item">
                  <span>Total HT</span>
                  <strong>{eur(currentCalc.totalHT)}</strong>
                </div>
                <div className="calc-item">
                  <span>TVA</span>
                  <strong>{eur(currentCalc.vatAmount)}</strong>
                </div>
                <div className="calc-item">
                  <span>Total TTC</span>
                  <strong>{eur(currentCalc.totalTTC)}</strong>
                </div>
              </div>
            </section>
          </div>

          <div className="right-column">
            <section className="card">
              <div className="section-head">
                <h2>Liste des prestations</h2>
                <span className="badge">{entries.length} ligne(s)</span>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th>Km</th>
                      <th>Min</th>
                      <th>HT</th>
                      <th>TTC</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="empty-cell">
                          Aucune prestation enregistrée. Tu peux exporter le
                          brouillon courant ou cliquer sur “Ajouter la prestation”.
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            <div className="table-main">
                              {entry.designation}
                              {entry.metaSummary ? (
                                <div className="table-sub">
                                  {entry.metaSummary}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td>{fmt(entry.tripSnapshot.distanceKm, 2)}</td>
                          <td>{fmt(entry.tripSnapshot.minutes, 0)}</td>
                          <td>{eur(entry.results.totalHT)}</td>
                          <td>{eur(entry.results.totalTTC)}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                className="btn btn-secondary btn-small"
                                onClick={() => handleLoadEntry(entry)}
                              >
                                Charger
                              </button>
                              <button
                                className="btn btn-danger btn-small"
                                onClick={() => handleDeleteEntry(entry.id)}
                              >
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card invoice-shell">
              <div className="section-head">
                <h2>Aperçu PDF</h2>
                <span className="badge">PDF du formulaire courant</span>
              </div>

              <div ref={invoiceRef} className="invoice-preview">
                <div className="invoice-top">
                  <div>
                    <h3>{company.name || "Votre société"}</h3>
                    <p>{company.legalForm || ""}</p>
                    {company.siret ? <p>SIRET : {company.siret}</p> : null}
                    {company.vatNumber ? <p>TVA : {company.vatNumber}</p> : null}
                    {company.address ? <p>{company.address}</p> : null}
                    {company.email ? <p>{company.email}</p> : null}
                    {company.phone ? <p>{company.phone}</p> : null}
                  </div>

                  <div className="invoice-top-right">
                    <h3>FACTURE</h3>
                    <p>N° : {invoice.number || "-"}</p>
                    <p>Date : {formatInvoiceDate(invoice.date)}</p>
                    <p>Règlement : {invoice.paymentMode || "-"}</p>
                  </div>
                </div>

                <div className="invoice-blocks">
                  <div className="invoice-block">
                    <h4>Facturé à</h4>
                    <p>{client.name || "Client"}</p>
                    {client.contact ? <p>Contact : {client.contact}</p> : null}
                    {client.address ? <p>{client.address}</p> : null}
                    {client.email ? <p>{client.email}</p> : null}
                  </div>

                  <div className="invoice-block">
                    <h4>Informations complémentaires</h4>
                    {visiblePdfFields.length === 0 ? (
                      <p>Aucun champ complémentaire affiché dans le PDF.</p>
                    ) : (
                      visiblePdfFields.map((field) => (
                        <p key={field.id}>
                          <strong>{field.label} :</strong> {field.value}
                        </p>
                      ))
                    )}
                  </div>
                </div>

                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th>Adresses</th>
                      <th>Km</th>
                      <th>Temps</th>
                      <th>Montant HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewLines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.designation}</strong>
                          {line.metaSummary ? (
                            <div className="table-sub">{line.metaSummary}</div>
                          ) : null}
                          {line.tripSnapshot.comments ? (
                            <div className="table-sub">
                              {line.tripSnapshot.comments}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {line.tripSnapshot.departureAddress || "—"}
                          <br />
                          <span className="table-sub">→</span>
                          <br />
                          {line.tripSnapshot.arrivalAddress || "—"}
                        </td>
                        <td>{fmt(line.tripSnapshot.distanceKm, 2)}</td>
                        <td>{fmt(line.tripSnapshot.minutes, 0)} min</td>
                        <td>{eur(line.results.totalHT)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="invoice-totals">
                  <div className="invoice-total-row">
                    <span>Total HT</span>
                    <strong>{eur(previewTotals.totalHT)}</strong>
                  </div>
                  <div className="invoice-total-row">
                    <span>TVA</span>
                    <strong>{eur(previewTotals.vatAmount)}</strong>
                  </div>
                  <div className="invoice-total-row grand-total">
                    <span>Total TTC</span>
                    <strong>{eur(previewTotals.totalTTC)}</strong>
                  </div>
                </div>

                <div className="invoice-footer">
                  {invoice.notes ? (
                    <div className="invoice-notes">
                      <h4>Notes</h4>
                      {invoice.notes.split("\n").map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </div>
                  ) : null}

                  {(company.iban || company.bic) && (
                    <div className="invoice-notes">
                      <h4>Coordonnées bancaires</h4>
                      {company.iban ? <p>IBAN : {company.iban}</p> : null}
                      {company.bic ? <p>BIC : {company.bic}</p> : null}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}


