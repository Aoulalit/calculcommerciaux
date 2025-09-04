#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Calculateur Tarifs Commerciaux – Menu chiffré (Mac/Win/Linux)
- Lit un Excel des tarifs (alias d'en-têtes tolérés)
- Menu: choisir le lieu par numéro
- Saisies: minutes, distance (si absents dans l'Excel)
- Calcule : Base MO, déplacement, majorations, remise plafonnée, TVA, HT/TTC
"""

import os, sys
import pandas as pd

# ---- Utils ----
def norm(s: str) -> str:
    if s is None: return ""
    import unicodedata
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return " ".join(s.lower().strip().split())

HEADER_ALIASES = {
    "id": ["id","code","ref"],
    "zone": ["zone","region","secteur"],
    "lieu (ville/secteur)": ["lieu","ville","secteur","localite","destination"],
    "tarif horaire (€ ht)": ["tarif horaire","prix horaire","taux horaire","heure ht"],
    "forfait déplacement (€ ht)": ["forfait deplacement","forfait","frais fixe","frais deplacement"],
    "tarif au km (€ ht/km)": ["tarif km","prix km","cout km","km ht","tarif au km"],
    "durée minimale (h)": ["duree minimale","minimum h","min h","duree mini"],
    "majoration nuit (%)": ["maj nuit","majoration nuit","nuit %","nuit"],
    "majoration week-end (%)": ["maj weekend","maj week-end","majoration week-end","weekend %","we %"],
    "remise max (%)": ["remise max","discount max","rabais max"],
    "distance (km)": ["distance (km)","distance km","km","distance"],
    "minutes": ["minutes","duree (min)","duree minutes","min","temps (min)"],
}

def map_headers(df_cols):
    colmap, norm_cols = {}, {norm(c): c for c in df_cols}
    for canon, aliases in HEADER_ALIASES.items():
        found = None
        for alias in aliases:
            na = norm(alias)
            if na in norm_cols:
                found = norm_cols[na]; break
            for ncol, orig in norm_cols.items():
                if na in ncol:
                    found = orig; break
            if found: break
        colmap[canon] = found
    return colmap

def fnum(v, default=0.0):
    if v is None or pd.isna(v) or v == "": return default
    try: return float(str(v).replace(",", "."))
    except: return default

def ask_float(msg, default=None, min_val=0):
    while True:
        s = input(msg).strip()
        if s == "" and default is not None: return default
        try:
            x = float(s.replace(",", "."))
            if x < min_val: 
                print(f"Entrez une valeur ≥ {min_val}."); continue
            return x
        except:
            print("Nombre invalide. Réessaie.")

def ask_int(msg, min_val=1, max_val=None):
    while True:
        s = input(msg).strip()
        try:
            n = int(s)
            if n < min_val or (max_val and n > max_val):
                print(f"Entrez un entier entre {min_val} et {max_val}."); continue
            return n
        except:
            print("Entier invalide. Réessaie.")

def yn_to_bool(s): return str(s).strip().lower() in ("o","oui","y","yes")

# ---- Load Excel ----
def load_tarifs(path):
    if not os.path.exists(path):
        print(f"Fichier introuvable: {path}")
        sys.exit(1)
    xls = pd.ExcelFile(path)
    best, best_score = None, -1
    for sheet in xls.sheet_names:
        try:
            df = pd.read_excel(path, sheet_name=sheet)
            if df.empty: continue
            m = map_headers(df.columns)
            score = sum(1 for k,v in m.items() if v is not None)
            if m.get("lieu (ville/secteur)") and score > best_score:
                best, best_score = df.copy(), score
        except: pass
    if best is None:
        best = pd.read_excel(path, sheet_name=0)
        if best.empty:
            print("Excel vide."); sys.exit(1)
    best = best.dropna(how="all").reset_index(drop=True)
    return best, map_headers(best.columns)

# ---- Compute ----
def compute(row, colmap, minutes, distance_km, is_nuit, is_we, remise_pct, tva_pct):
    TH = fnum(row.get(colmap.get("tarif horaire (€ ht)")), 0)
    FORF = fnum(row.get(colmap.get("forfait déplacement (€ ht)")), 0)
    KM = fnum(row.get(colmap.get("tarif au km (€ ht/km)")), 0)
    DMIN = fnum(row.get(colmap.get("durée minimale (h)")), 1)
    MAJ_N = fnum(row.get(colmap.get("majoration nuit (%)")), 0) / 100
    MAJ_WE = fnum(row.get(colmap.get("majoration week-end (%)")), 0) / 100
    REM_MAX = fnum(row.get(colmap.get("remise max (%)")), 0) / 100

    duree_h = max(minutes/60.0, DMIN)
    base_mo = duree_h * TH
    deplacement = FORF + KM * distance_km
    majoration = base_mo * ((MAJ_N if is_nuit else 0) + (MAJ_WE if is_we else 0))
    sous_total = base_mo + deplacement + majoration

    rem_appl = max(0, min(remise_pct/100.0, REM_MAX))
    m_remise = sous_total * rem_appl
    total_ht = sous_total - m_remise
    tva = total_ht * (tva_pct/100.0)
    total_ttc = total_ht + tva

    return {
        "duree_h": duree_h, "base_mo": base_mo, "deplacement": deplacement,
        "majoration": majoration, "sous_total": sous_total, "rem_appliquee_pct": rem_appl*100,
        "m_remise": m_remise, "total_ht": total_ht, "tva": tva, "total_ttc": total_ttc
    }

# ---- Main ----
def main():
    print("=== Calculateur Tarifs – Menu chiffré ===")
    # 1) Demande le fichier (plus simple que de deviner)
    path = input("Chemin du fichier Excel (ex: /Users/…/tarifs.xlsx) : ").strip()
    df, colmap = load_tarifs(path)

    lieu_col = colmap.get("lieu (ville/secteur)")
    if not lieu_col:
        print("Colonne 'Lieu (ville/secteur)' introuvable."); sys.exit(1)

    df = df[df[lieu_col].notna()].reset_index(drop=True)
    if df.empty:
        print("Aucun lieu trouvé."); sys.exit(1)

    zone_col = colmap.get("zone")
    options = []
    for i, r in df.iterrows():
        lieu = str(r.get(lieu_col, "")).strip()
        zone = str(r.get(zone_col, "")).strip() if zone_col else ""
        options.append((i, f"{lieu}" + (f" — {zone}" if zone else "")))

    print("\nChoisissez un lieu :")
    for idx, label in options:
        print(f"  {idx+1}. {label}")
    n = ask_int("\nVotre choix (numéro) : ", 1, len(options))
    row = df.iloc[n-1]

    # Valeurs par défaut depuis Excel si dispo
    dist_col, mins_col = colmap.get("distance (km)"), colmap.get("minutes")
    def_dist = fnum(row.get(dist_col), None) if dist_col else None
    def_mins = fnum(row.get(mins_col), None) if mins_col else None

    minutes = ask_float(f"Minutes [{'Entrée' if def_mins is not None else 'obligatoire'}: {int(def_mins) if def_mins else ''}] : ",
                        default=def_mins, min_val=0)
    distance = ask_float(f"Distance (km) [{'Entrée' if def_dist is not None else 'obligatoire'}: {def_dist if def_dist is not None else ''}] : ",
                         default=def_dist, min_val=0)

    is_nuit = yn_to_bool(input("Prestation de nuit ? (o/n) : "))
    is_we = yn_to_bool(input("Prestation week-end ? (o/n) : "))
    remise_pct = ask_float("Remise (%) [Entrée=0] : ", default=0, min_val=0)
    tva_pct = ask_float("TVA (%) [Entrée=20] : ", default=20, min_val=0)

    res = compute(row, colmap, minutes, distance, is_nuit, is_we, remise_pct, tva_pct)

    lieu_label = str(row.get(lieu_col, "")).strip()
    print("\n=== RÉSULTAT ===")
    print(f"Lieu : {lieu_label}")
    print(f"Distance : {distance:.2f} km")
    print(f"Durée : {minutes:.0f} min (facturées {res['duree_h']:.2f} h)")
    print(f"Base MO (HT) : {res['base_mo']:.2f} €")
    print(f"Déplacement (HT) : {res['deplacement']:.2f} €")
    print(f"Majoration (HT) : {res['majoration']:.2f} €")
    print(f"Sous-total (HT) : {res['sous_total']:.2f} €")
    print(f"Remise appliquée : {res['rem_appliquee_pct']:.2f} % (-{res['m_remise']:.2f} €)")
    print(f"TOTAL HT : {res['total_ht']:.2f} €")
    print(f"TVA : {res['tva']:.2f} €")
    print(f"TOTAL TTC : {res['total_ttc']:.2f} €\n")

if __name__ == "__main__":
    main()
