# Vendor Biomarker Catalog: Actual Report Outputs, Formats, and Field Names

Last updated: 2026-04-06

## Executive Summary

This document catalogs the **actual, verified** report outputs from every major vendor and data source a longevity clinic would use. It covers exact field names, units, report formats, API availability, and reference ranges as they appear on real reports — not marketing descriptions.

This directly answers the open question from `ingestion-format-landscape.md` line 342:
> "Define the first 100 canonical biomarker mappings with LOINC + unit normalization rules."

The research identifies **180+ distinct biomarkers** across 5 categories and **3 critical normalization traps** that must be handled correctly.

---

## 1. Epigenetic Age Testing Vendors

### 1A. TruDiagnostic

**Report format:** Web portal (`app.trudiagnostic.com` for providers, `portal.trudiagnostic.com` for consumers) + downloadable PDF (30+ pages for COMPLETE). No public API. Structured results available through Rupa Health API (JSON) if clinic orders via Rupa.

**Product tiers:**

| Product | Price | Biomarker Count |
|---------|-------|----------------|
| TruAge COMPLETE | $499 | 75+ across 15 report sections |
| TruAge PACE | $229 | 2 (DunedinPACE + Telomere Length) |
| TruHealth | $299 | 105-110 Epigenetic Biomarker Proxies (EBPs) |
| TruAge + TruHealth | $699 | 185+ combined |

#### TruAge COMPLETE Biomarkers

**Primary biological age:**

| Field Name (on report) | Unit | Notes |
|------------------------|------|-------|
| OMICmAge | years | Flagship biological age. Compare to chronological age. |
| DunedinPACE | biological years/calendar year | 1.0 = average rate. <1.0 = slower aging. |
| OMICm FitAge | years | Physical fitness age |
| Intrinsic Epigenetic Age (IEAA) | years | Horvath clock (353 CpG sites) |
| Extrinsic Epigenetic Age (EEAA) | years | Hannum clock (71 CpG sites) |
| Average Telomere Length | kb (kilobases) | Normal adult range 5-15 kb. Age-adjusted percentile provided. |

**SYMPHONYAge organ-specific ages (11 organs, each in years):**

Brain Age, Heart Age, Liver Age, Kidney Age, Lung Age, Blood Age, Immune System Age, Inflammation Age, Metabolic Age, Musculoskeletal Age, Hormone Age

**Fitness sub-metrics (percentile rankings):**

Grip Strength, Gait Speed, VO2 Max, FEV1

**Immune cell deconvolution (12 cell types, proportions):**

Neutrophils, Eosinophils, Basophils, Monocytes, B Naive, B Memory, CD4+ T Naive, CD4+ T Memory, CD8+ T Naive, CD8+ T Memory, NK cells, T Regulatory cells. Plus: CD4/CD8 Ratio.

**Inflammation:**

DNAmCRP (methylation-estimated CRP, proxy unit), DNAmIL-6 (proxy unit)

**Risk scores:**

Death, Stroke, Cancer, Heart Disease, COPD, Depression, Type 2 Diabetes. Plus: Mitotic Clock, Weight Loss Response, Smoking Exposure, Alcohol Consumption.

#### TruHealth EBP Biomarkers (105-110 markers)

These are methylation-derived proxies (EBPs), not direct measurements. Exact names from Rupa Health listing:

**Metabolic:** Glucose, Triglycerides, HbA1c, Uric Acid, Creatine

**Lipids:** HDL, VLDL, LDL, C-Reactive Protein, Apo A1, LDL-P, VLDL-P, HDL-P

**Blood cells:** WBC, Neutrophil Count, Lymphocyte Count, CD4/CD8 Ratio, NLR, Systemic Immune-Inflammation Index

**Stress/hormonal:** Cortisol, Vanillylmandelic Acid

**Vitamins:** A, B3, B5, B6, D, E

**Amino acids:** Cysteine, Asparagine, Glutamine, Arginine, Valine, Citrulline, Cystathionine, Glycine, Histidine, Methionine, Taurine, Threonine, Tyrosine, L-Aspartic Acid

**Fatty acids:** Total Omega-3, Total Omega-6, DHA, EPA, DPA, Linoleic Acid, MUFA, PUFA, SFA, Pentadecanoate, Phosphatidylcholine, Phosphoglycerides, Sphingomyelins

**Inflammation/immune:** IL-6, Leptin, TGF-beta-1, Serum Amyloid A-1, GlycA, Phospholipase A2, Progranulin

**Antioxidants/environmental:** Lutein, Allantoin, Acrolein, 3-HPMA, PFOA, PFOS, Ergothioneine, Carotene diol, Acetyl-L-Carnitine

**Neurocognitive:** Kynurenine, Quinolinic Acid, Neurogranin, Dopamine 3-O-Sulfate, Dopamine 4-Sulfate

**Methylation/one-carbon:** Betaine, Choline, Inositol, S-Methylmethionine, Nicotinamide, 1-Methylnicotinamide, Nicotinamide Riboside

**Metabolic/energy:** Spermidine, Acetoacetate, 3-Hydroxybutyrate, a-Ketoglutaric Acid, Hypoxanthine, Xanthine, Palmitoylcarnitine, and 8+ additional metabolites

**Other:** Systolic Blood Pressure, ATP Synthase Subunit Beta

---

### 1B. Elysium Health (Index)

**Report format:** Web portal dashboard at `my.elysiumhealth.com`. No PDF export documented. No API. Consumer-direct only. Research partnerships available.

**Sample type:** Saliva. **Turnaround:** ~6 weeks.

| Field Name | Unit | Notes |
|------------|------|-------|
| Biological Age | years (integer) | Overall epigenetic age |
| Cumulative Rate of Aging | decimal ratio (e.g., 0.89) | bio age / chrono age. <1.0 = slower aging. |
| Brain System Age | years | |
| Heart System Age | years | |
| Metabolic System Age | years | |
| Immune System Age | years | |
| Inflammation System Age | years | |
| Kidney System Age | years | |
| Liver System Age | years | |
| Hormone System Age | years | |
| Blood System Age | years | |

**Total: 11 metrics.** Based on Morgan Levine's APEX technology, ~100K CpG sites. Published in Nature Aging.

---

### 1C. GlycanAge

**Report format:** Web portal + downloadable PDF + CSV raw data export (24 GP peaks). Provider accounts available. PhysioAge integration exists.

**Sample type:** Capillary blood (finger prick). **Turnaround:** 3-5 weeks.

| Field Name | Unit | Notes |
|------------|------|-------|
| GlycanAge | years (decimal, e.g., 32.4) | Biological age from glycan analysis |
| Glycan Shield Index | percentile | Sialylated glycans (S). Higher = better. |
| Glycan Youth Index | percentile | Digalactosylated (G2). Higher = better. |
| Glycan Mature Index | percentile | Agalactosylated (G0). Lower = better. |
| Glycan Median Index | percentile | Monogalactosylated (G1). |
| Glycan Bisection Index | percentile | Bisecting GlcNAc (B). Lower = better. |
| GP1 through GP24 | relative abundance (%) | 24 individual glycan peaks, CSV exportable |

**Error margin:** +/- 5 years.

---

### 1D. myDNAge (Epimorphy)

**Report format:** PDF emailed (~30 pages). No web portal login. No raw data export. No API.

**Sample type:** Blood (finger prick) or urine. **Turnaround:** 4-6 weeks.

| Field Name | Unit | Notes |
|------------|------|-------|
| DNAge | years (integer) | Horvath clock (353 CpG + 2000 total sites) |
| DNAge Index | percentile | Comparison to same age/sex group |
| Epi-Metabolic Index | score (reference: 6.3) | Blood only. Below 6.3 = lower metabolic risk. |
| APOE Genotype | categorical (e.g., "e3/e3") | Blood only. |
| MTHFR Status | categorical | Blood only. |

---

### 1E. Tally Health

**Report format:** Web portal only. No PDF. No API. Consumer-direct.

**Sample type:** Buccal swab (cheek). **Turnaround:** 3-7 weeks.

| Field Name | Unit | Notes |
|------------|------|-------|
| TallyAge | years | CheekAge clock (proprietary, ~850K CpG sites) |
| Lifestyle Score | 0-100 | From questionnaire |

---

## 2. Standard Blood Biomarkers (with LOINC Codes)

### 2A. Lipid Panel

| Biomarker | LOINC | Unit | Standard Range | Longevity Optimal |
|-----------|-------|------|---------------|-------------------|
| Total Cholesterol | 2093-3 | mg/dL | <200 | <200 |
| LDL-C (calculated) | 13457-7 | mg/dL | <100 | <70 |
| LDL-C (direct) | 2089-1 | mg/dL | <100 | <70 |
| HDL-C | 2085-9 | mg/dL | >40 M / >50 F | >50 M / >60 F |
| Triglycerides | 2571-8 | mg/dL | <150 | <100 |
| ApoB | 1884-6 | mg/dL | <90 | <60 (Attia: 30-60) |
| Lp(a) (mass) | 10835-7 | mg/dL | <30 | <30 |
| Lp(a) (molar) | 43583-4 | nmol/L | <75 | <50 |
| LDL Particle Number | 54434-6 | nmol/L | <1000 | <1000 |
| Small Dense LDL | 90364-1 | mg/dL | varies | low |
| Oxidized LDL (Ab) | 68935-6 | U/L | <60 | <60 |

**Normalization trap:** Lp(a) has mass (mg/dL) and molar (nmol/L) conventions that are NOT directly interconvertible due to variable apo(a) isoform sizes. Must track which unit was reported.

### 2B. Metabolic

| Biomarker | LOINC | Unit | Standard Range | Longevity Optimal |
|-----------|-------|------|---------------|-------------------|
| Fasting Glucose | 1558-6 | mg/dL | 70-99 | 72-85 |
| Fasting Insulin | 27873-9 | uIU/mL | 2.6-24.9 | <5 |
| HbA1c | 4548-4 | % | <5.7 | <5.3 |
| HbA1c (IFCC) | 59261-8 | mmol/mol | <39 | <34 |
| HOMA-IR | (calculated) | ratio | <1.4 | <1.0 |

### 2C. Inflammatory

| Biomarker | LOINC | Unit | Standard Range | Longevity Optimal |
|-----------|-------|------|---------------|-------------------|
| hs-CRP | 30522-7 | mg/L | <3.0 | <1.0 |
| IL-6 | 26881-3 | pg/mL | <5.0 | <1.8 |
| TNF-alpha | 3167-4 | pg/mL | <8.1 | low |
| Homocysteine | 2428-1 | umol/L | 5-15 | <10 |
| Fibrinogen | 3255-7 | mg/dL | 200-400 | 200-300 |
| ESR (Westergren) | 4537-7 | mm/h | 0-20 M / 0-30 F | <10 |

### 2D. Hormones

| Biomarker | LOINC | Unit | Standard Range |
|-----------|-------|------|---------------|
| Total Testosterone | 2986-8 | ng/dL | M: 264-916; F: 15-70 |
| Free Testosterone | 2991-8 | pg/mL | M: 9.3-26.5; F: 0.6-3.8 |
| DHEA-S | 2191-5 | ug/dL | M: 80-560; F: 35-430 |
| Estradiol | 2243-4 | pg/mL | M: 10-40; F: varies by phase |
| Progesterone | 2839-9 | ng/mL | F: varies by phase; M: 0.3-1.2 |
| SHBG | 2942-1 | nmol/L | M: 16.5-55.9; F: 24.6-122 |
| Cortisol (AM) | 2143-6 | ug/dL | 6.2-19.4 |
| IGF-1 | 2484-4 | ng/mL | age-dependent |
| TSH | 3016-3 | uIU/mL | 0.45-4.5 (optimal 1.0-2.0) |
| Free T4 | 3024-7 | ng/dL | 0.82-1.77 |
| Free T3 | 3051-0 | pg/mL | 2.0-4.4 |
| Reverse T3 | 3052-8 | ng/dL | 9.2-24.1 |
| TPO Antibodies | 5382-7 | IU/mL | <9 |
| Thyroglobulin Ab | 5379-7 | IU/mL | <4 |

### 2E. Nutrients / Vitamins

| Biomarker | LOINC | Unit | Standard Range | Longevity Optimal |
|-----------|-------|------|---------------|-------------------|
| Vitamin D (25-OH) | 62292-8 | ng/mL | 30-100 | 50-80 |
| Vitamin B12 | 2132-9 | pg/mL | 232-1245 | >500 |
| Folate (serum) | 2284-8 | ng/mL | 3.0-17.0 | >10 |
| Ferritin | 2276-4 | ng/mL | M: 30-400; F: 15-150 | 40-100 |
| Iron (serum) | 2498-4 | ug/dL | 38-169 | mid-range |
| TIBC | 2500-7 | ug/dL | 250-370 | -- |
| Iron Saturation | 2502-3 | % | 20-55 | 25-45 |
| Magnesium (RBC) | 26746-8 | mg/dL | 4.2-6.8 | 5.2-6.5 |
| Omega-3 Index | 88998-0 | % | >4 | >8 |

### 2F. Organ Function

**Liver:**

| Biomarker | LOINC | Unit | Standard Range | Longevity Optimal |
|-----------|-------|------|---------------|-------------------|
| ALT | 1742-6 | U/L | 7-56 | <25 |
| AST | 1920-8 | U/L | 10-40 | <25 |
| GGT | 2324-2 | U/L | 0-65 | <25 |
| Albumin | 1751-7 | g/dL | 3.5-5.5 | >4.3 |
| Bilirubin (total) | 1975-2 | mg/dL | 0.1-1.2 | 0.3-1.0 |

**Kidney:**

| Biomarker | LOINC | Unit | Standard Range | Longevity Optimal |
|-----------|-------|------|---------------|-------------------|
| BUN | 3094-0 | mg/dL | 6-20 | 10-16 |
| Creatinine | 2160-0 | mg/dL | 0.74-1.35 | 0.7-1.1 |
| eGFR | 33914-3 | mL/min/1.73m2 | >60 | >90 |
| Cystatin C | 33863-2 | mg/L | 0.53-0.95 | <0.8 |
| Uric Acid | 3084-1 | mg/dL | M: 3.4-7.0; F: 2.4-6.0 | <5.5 |

**CBC (key fields):**

| Biomarker | LOINC | Unit | Standard Range |
|-----------|-------|------|---------------|
| WBC | 6690-2 | 10*3/uL | 4.5-11.0 |
| RBC | 789-8 | 10*6/uL | M: 4.5-5.5; F: 4.0-5.0 |
| Hemoglobin | 718-7 | g/dL | M: 14.0-17.5; F: 12.0-16.0 |
| Hematocrit | 4544-3 | % | M: 38.3-48.6; F: 35.5-44.9 |
| Platelets | 777-3 | 10*3/uL | 150-400 |
| RDW | 788-0 | % | 11.5-14.5 |

### 2G. Specialty Longevity Blood Markers

| Biomarker | LOINC | Unit | Notes |
|-----------|-------|------|-------|
| Intracellular NAD+ | none | uM | Jinfiniti. Optimal 40-100 uM. |
| Telomere Length | none | kb or T/S ratio | No standard LOINC. Vendor-specific. |
| Glutathione (blood) | 91685-8 | mg/dL | Specialty test |
| 8-OHdG (urine) | 59265-9 | ratio (ng/mg creatinine) | Oxidative DNA damage |

---

## 3. Wearable Devices

### CRITICAL NORMALIZATION TRAP: HRV

| Source | HRV Metric | Unit | Measurement Window |
|--------|-----------|------|-------------------|
| WHOOP | **RMSSD** | ms (field: `hrv_rmssd_milli`) | Last sleep period |
| Oura | **RMSSD** | ms (field: `average_hrv`) | Overnight sleep |
| Apple Watch | **SDNN** | ms (field: `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`) | Intermittent, day+night |
| Garmin | **RMSSD** (likely) | ms (field: `hrvValue`) | Overnight sleep window |

**RMSSD and SDNN are mathematically different and clinically non-comparable.** Must use separate canonical codes.

### 3A. WHOOP (API v2, OAuth 2.0)

**Base URL:** `https://api.prod.whoop.com/developer`

**Recovery (`GET /v1/recovery`):**

| JSON Field | Unit |
|------------|------|
| `score.recovery_score` | % (0-100) |
| `score.resting_heart_rate` | bpm |
| `score.hrv_rmssd_milli` | ms |
| `score.spo2_percentage` | % (WHOOP 4.0+) |
| `score.skin_temp_celsius` | degrees C (WHOOP 4.0+) |

**Sleep (`GET /v1/sleep`):**

| JSON Field | Unit |
|------------|------|
| `score.total_sleep_duration` | ms |
| `score.total_light_sleep_time_milli` | ms |
| `score.total_slow_wave_sleep_time_milli` | ms |
| `score.total_rem_sleep_time_milli` | ms |
| `score.respiratory_rate` | breaths/min |
| `score.sleep_performance_percentage` | % |
| `score.sleep_efficiency_percentage` | % |

**Strain (`GET /v1/cycle`):**

| JSON Field | Unit |
|------------|------|
| `score.strain` | 0-21 scale |
| `score.kilojoule` | kJ |
| `score.average_heart_rate` | bpm |
| `score.max_heart_rate` | bpm |

**CSV export:** 4 files (`physiological_cycles.csv`, `sleeps.csv`, `workouts.csv`, `journal_entries.csv`). All durations in ms.

### 3B. Oura Ring (API v2, OAuth 2.0)

**Base URL:** `https://api.ouraring.com`

**Sleep (`GET /v2/usercollection/sleep`):**

| JSON Field | Unit |
|------------|------|
| `average_hrv` | ms (RMSSD) |
| `average_heart_rate` | bpm |
| `average_breath` | breaths/min |
| `total_sleep_duration` | seconds |
| `deep_sleep_duration` | seconds |
| `light_sleep_duration` | seconds |
| `rem_sleep_duration` | seconds |
| `efficiency` | % |
| `lowest_heart_rate` | bpm |

**Readiness (`GET /v2/usercollection/daily_readiness`):**

| JSON Field | Unit |
|------------|------|
| `score` | 0-100 |
| `temperature_deviation` | degrees C |
| `temperature_trend_deviation` | degrees C |

**SpO2 (`GET /v2/usercollection/daily_spo2`):** `spo2_percentage` (%)

**Note:** All Oura sleep durations are in **seconds** (WHOOP uses milliseconds).

### 3C. Apple Watch (via HealthKit XML Export)

Key `HKQuantityTypeIdentifier` strings:

| Identifier | Unit |
|------------|------|
| `HeartRateVariabilitySDNN` | ms (**SDNN, not RMSSD**) |
| `RestingHeartRate` | count/min |
| `VO2Max` | mL/min/kg |
| `OxygenSaturation` | % |
| `RespiratoryRate` | count/min |
| `WalkingAsymmetryPercentage` | % |
| `AppleWalkingSteadiness` | % |
| `BloodGlucose` | mg/dL (CGM sync) |

Export format: proprietary XML (`export.xml`) + CDA (`export_cda.xml` with LOINC/SNOMED).

### 3D. Garmin (Health API, partner-only)

Push-based JSON via webhooks. **Not publicly available** — requires Garmin Connect Developer Program enrollment.

| JSON Field | Unit |
|------------|------|
| `restingHeartRateInBeatsPerMinute` | bpm |
| `averageStressLevel` | 1-100 |
| `bodyBatteryChargedValue` | 1-100 |
| `hrvValue` | ms |
| `deepSleepDurationInSeconds` | seconds |
| `lightSleepDurationInSeconds` | seconds |
| `remSleepInSeconds` | seconds |

### 3E. Continuous Glucose Monitors

**Dexcom (API v3, OAuth 2.0):**

Base URL: `https://api.dexcom.com`. EGVs endpoint: `GET /v3/users/self/egvs`

| JSON Field | Unit |
|------------|------|
| `value` | mg/dL (always) |
| `trend` | enum (flat, singleUp, doubleUp, etc.) |
| `trendRate` | mg/dL/min |

**NORMALIZATION TRAP:** Time in Range definitions differ:
- Clinical standard (AGP): 70-180 mg/dL
- Levels Health: 70-140 mg/dL
- Nutrisense: 70-140 mg/dL

Must store the range definition alongside the percentage.

**AGP (Ambulatory Glucose Profile) standard metrics:**

Mean glucose, GMI (%), CV (%), Time Above Range L1 (>180) and L2 (>250), Time In Range (70-180), Time Below Range L1 (<70) and L2 (<54).

Levels and Nutrisense: CSV export only, no public API.

---

## 4. Body Composition and Clinical Testing

### 4A. DEXA Scan

**Format:** PDF only. No structured export. Two major platforms: Hologic and GE Lunar. **Results are NOT directly comparable between platforms.**

| Metric | Unit |
|--------|------|
| Total Body Fat % | % |
| Regional fat/lean (Arms, Legs, Trunk, Android, Gynoid) | grams or lbs |
| Android/Gynoid (A/G) Ratio | ratio |
| Visceral Adipose Tissue (VAT) Mass | grams |
| Estimated VAT Area | cm^2 |
| Appendicular Lean Mass (ALM) | kg |
| ALMI (ALM Index) | kg/m^2 |
| Bone Mineral Density (BMD) | g/cm^2 |
| T-score | standard deviations (vs young adult) |
| Z-score | standard deviations (vs age-matched) |

### 4B. InBody (Bioimpedance)

**API:** LookinBody Web API (paid, `https://apiusa.lookinbody.com`). Result sheet also available as image/PDF.

| Metric | Unit |
|--------|------|
| Skeletal Muscle Mass (SMM) | kg |
| Body Fat Mass | kg |
| Percent Body Fat (PBF) | % |
| Total Body Water (TBW) | L |
| ECW/TBW Ratio | ratio (normal 0.360-0.390) |
| Visceral Fat Level | 1-20 scale |
| Visceral Fat Area | cm^2 |
| BMR | kcal |
| Phase Angle | degrees |
| Segmental lean/fat per limb+trunk | kg |

### 4C. VO2 Max Testing

**Format:** Proprietary PDF from metabolic cart vendors (PNOE, COSMED, Parvo Medics). No standardized structured export.

| Metric | Unit |
|--------|------|
| VO2max (or VO2peak) | mL/kg/min |
| VT1 (Ventilatory Threshold 1) | HR bpm, VO2, % VO2max |
| VT2 (Ventilatory Threshold 2) | HR bpm, VO2, % VO2max |
| RER (Respiratory Exchange Ratio) | ratio (0.7=fat, 1.0=carb) |
| RMR (Resting Metabolic Rate) | kcal/day |
| HR max | bpm |
| Fat oxidation rate | g/min |

### 4D. Coronary Artery Calcium (CAC) Score

**Format:** Narrative PDF radiology report.

| Metric | Unit | Risk Categories |
|--------|------|----------------|
| Total Agatston Score | dimensionless | 0=very low, 1-99=mild, 100-299=moderate, 300+=high |
| Per-vessel scores (LAD, LCx, RCA, Left Main) | dimensionless | |
| Age/sex/race percentile | percentile | Via MESA calculator |

### 4E. Full-Body MRI (Prenuvo)

**Format:** Patient-facing annotated report (app), physician PDF, DICOM files. **No structured data.** Narrative radiology report organized by anatomical system.

Emerging classification: ONCO-RADS (1-5 categories per finding, 7 anatomical regions). Not yet standardized enough for automated parsing.

---

## 5. Specialty Functional Medicine Panels

### 5A. GI-MAP (Diagnostic Solutions)

**Specimen:** Stool. **Method:** qPCR. **Units:** CFU/g (scientific notation). **Rupa:** Yes.

85+ markers across: Bacterial pathogens (12), H. pylori + virulence factors (12), Parasites (15), Viruses (5), Commensal bacteria (9+), Phyla ratios (3), Opportunistic bacteria (11), Fungi/yeast (5), Digestive markers (Pancreatic Elastase 1, Steatocrit), Inflammatory markers (Calprotectin, sIgA, Anti-Gliadin IgA, Eosinophil Protein X), Occult Blood, Beta-Glucuronidase.

Add-ons: StoolOMX (25 bile acids, 9 SCFAs), Zonulin.

### 5B. Organic Acids Test (Mosaic Diagnostics)

**Specimen:** First morning urine. **Method:** GC-MS. **76 metabolites.** **Rupa:** Yes.

Key sections: Intestinal Microbial Overgrowth (18 markers), Krebs Cycle/Mitochondrial (7), Neurotransmitter Metabolites (HVA, VMA, 5-HIAA, Kynurenic Acid, Quinolinic Acid), Fatty Acid Oxidation (8), Nutritional Markers (MMA, Pyridoxic Acid, etc.), Oxalate.

### 5C. DUTCH Complete (Precision Analytical)

**Specimen:** Dried urine (4-5 collections over 24 hours). **Method:** LC-MS/MS. **Units:** ng/mg creatinine. **Rupa:** Yes.

Sex hormones: Progesterone metabolites, DHEA-S, Testosterone, 5a-DHT, Estrone/Estradiol/Estriol, 2-OH/4-OH/16-OH estrogen metabolites, 2-Methoxyestrone.

Cortisol pattern (4 timepoints): Cortisol + Cortisone at Waking/Morning/Afternoon/Night.

Cortisol metabolites: a-THF, b-THF, b-THE.

Organic acids: HVA, VMA, Kynurenic Acid, MMA, 8-OHdG, Melatonin.

### 5D. Cleveland HeartLab (via Quest)

**Format:** 10-page branded PDF with color-coded risk tiers. **Rupa:** No (ordered through Quest).

| Biomarker | Units | Optimal | High |
|-----------|-------|---------|------|
| MPO | pmol/L | <470 | >=540 |
| Lp-PLA2 Activity | nmol/min/mL | <=123 | >123 |
| ADMA | ng/mL | <100 | >123 |
| OxLDL | U/L | <60 | >=70 |
| F2-Isoprostane/Creatinine | ng/mg | <0.86 | >=0.86 |
| TMAO | uM | <6.2 | >=10.0 |
| hs-TnT | ng/L | <6 | >22 M / >14 F |
| LDL-P (NMR) | nmol/L | <935 | >1816 |
| Small LDL-P | nmol/L | <467 | >820 |
| LDL Size | nm | >20.5 | <=20.5 |
| OmegaCheck | % by wt | >=5.5 | <=3.7 |
| CoQ10 | ug/mL | >0.35 | <=0.35 |
| ApoE Genotype | categorical | -- | -- |
| MTHFR Mutation | categorical | -- | -- |

### 5E. Mycotoxin Testing (Mosaic Diagnostics)

**Specimen:** Urine. **Method:** LC-MS/MS. **Units:** ppb. **Rupa:** Yes.

11 mycotoxins: Aflatoxin M1, Ochratoxin A, Roridin E, Verrucarin A, Zearalenone, Chaetoglobosin A, Enniatin B, Gliotoxin, Mycophenolic Acid, Sterigmatocystin, Citrinin.

### 5F. Cyrex Lymphocyte MAP

**Specimen:** Whole blood. **Method:** Flow cytometry. **Rupa:** Yes.

34 measurements: T cells, B cells, CD4/CD8 counts and ratios, TH1/TH2/TH17/Treg counts and ratios, NK cells, NKT cells, CD57+ subsets.

### 5G. Jinfiniti NAD+ Test

**Specimen:** Dried blood spot. **Format:** 16-page PDF.

| Field | Unit | Categories |
|-------|------|-----------|
| Intracellular NAD (icNAD) | uM | Severely deficient: 0-20, Deficient: 20-30, Suboptimal: 30-40, Optimal: 40-100, Too High: >100 |

---

## 6. Lab Company Integration Reality

### Structured Data Access

| Lab Company | FHIR | HL7 v2 | API | PDF | Rupa Health |
|-------------|------|--------|-----|-----|-------------|
| Quest Diagnostics | Yes (Quanum FHIR R4) | Yes (ORU^R01) | Quanum Hub (enrollment required) | Yes | Yes |
| LabCorp | Partial (via Health Gorilla) | Yes | Enterprise-only | Yes | Partial (via Access Medical) |
| Boston Heart | No | No | No | Yes (branded) | Yes |
| Cleveland HeartLab | No | No | No | Yes (branded) | No (via Quest) |
| Genova Diagnostics | No | No | No | Yes | Yes |
| Vibrant Wellness | No | No | Chrome extension sync | Yes | Yes |
| Diagnostic Solutions | No | No | No | Yes | Yes |
| Mosaic Diagnostics | No | No | No | Yes | Yes |
| Precision Analytical | No | No | No | Yes | Yes |

### Rupa Health API

Webhooks fire `order.new_result` per test with:
- `results_hl7` (structured, parseable)
- `results_pdf` (PDF reference)

This is the most realistic near-term path to structured specialty lab data.

### Common Field Name Variations Across Major Labs

| Canonical | Quest | LabCorp | Boston Heart |
|-----------|-------|---------|-------------|
| hs-CRP | C-Reactive Protein, Cardiac | C-Reactive Protein (hs) | hsCRP |
| ApoB | Apolipoprotein B | Apolipoprotein B | Apolipoprotein B |
| HbA1c | Hemoglobin A1c | Hemoglobin A1c | -- |
| Vitamin D | Vitamin D, 25-Hydroxy | Vitamin D, 25-OH, Total | -- |
| Testosterone | Testosterone, Total | Testosterone, Total, MS | -- |

---

## 7. Critical Normalization Traps (Summary)

### Trap 1: HRV — RMSSD vs SDNN
WHOOP and Oura report RMSSD. Apple Watch reports SDNN. These are different statistical measures of heart rate variability and cannot be compared. **Use separate canonical codes.**

### Trap 2: CGM Time in Range — 70-180 vs 70-140
Clinical standard AGP uses 70-180 mg/dL. Consumer apps (Levels, Nutrisense) use 70-140 mg/dL. **Store the range definition alongside the percentage.**

### Trap 3: DEXA Scanner Dependency
Hologic and GE Lunar use different algorithms for VAT and produce non-comparable results. **Track scanner make/model as sourceVendor metadata. Same-scanner required for longitudinal comparison.**

### Trap 4: Lp(a) Units
Mass (mg/dL) and molar (nmol/L) are not interconvertible. **Must store the unit reported by the lab, not attempt conversion.**

### Trap 5: EBP vs Direct Measurement
TruDiagnostic TruHealth EBPs (e.g., EBP for CRP) are methylation-derived proxies, not direct blood measurements. **Must distinguish `dnam_crp` (proxy) from `inflammation_crp` (direct blood measurement) in the canonical catalog.**

---

## Sources

See individual sections above. Key primary sources:
- TruDiagnostic: shop.trudiagnostic.com, trudiagnostic.com, Rupa Health listings
- Elysium: elysiumhealth.com, MIT Technology Review, AGEIST
- GlycanAge: glycanage.com/report.pdf, help.glycanage.com
- WHOOP: developer.whoop.com/docs
- Oura: api.ouraring.com, support.ouraring.com
- Dexcom: developer.dexcom.com
- LOINC: loinc.org
- Cleveland HeartLab: clevelandheartlab.com/test-menu
- Rupa Health: rupahealth.com, beta-docs.rupahealth.com
- Jinfiniti: jinfiniti.com
- PMC papers: PMC10614756 (OMICmAge), PMC11009193 (CheekAge), PMC3205872 (IgG glycans)
