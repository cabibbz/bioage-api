# Canonical Catalog Expansion Spec

Last updated: 2026-04-06

## Executive Summary

The current `canonical-catalog.json` has 6 entries. This document defines the expansion to **~80 canonical codes** organized by category, with exact aliases, LOINC codes, units, and reference ranges. These are the biomarkers that matter most for longevity clinics and should be prioritized for the normalization layer.

This is not aspirational — every entry below maps to a real vendor report output or lab result documented in `vendor-biomarker-catalog.md`.

## Schema Extension Required

The current `CanonicalDefinition` type needs these additional fields:

```typescript
export type CanonicalDefinition = {
  canonicalCode: string;
  title: string;
  modality: MeasurementModality;
  category: BiomarkerCategory;          // NEW
  preferredUnit: string;
  alternateUnits?: string[];            // NEW — for unit normalization
  loincCode?: string;                   // NEW — primary LOINC
  aliases: string[];
  refRange?: {                          // NEW — standard reference
    low?: number;
    high?: number;
    sex?: "M" | "F";
    text?: string;                      // for non-numeric (e.g., "<1.0 Low Risk")
  };
  longevityOptimal?: {                  // NEW — longevity-specific target
    low?: number;
    high?: number;
    text?: string;
  };
  notes?: string;                       // NEW — normalization caveats
};

// Extend modality
export type MeasurementModality =
  | "epigenetic"
  | "blood"
  | "wearable"
  | "clinical"    // DEXA, VO2max, CAC, MRI
  | "stool"       // NEW
  | "urine"       // NEW
  | "saliva"      // NEW
  | "genetic";    // NEW — SNP/genotype results

// New field
export type BiomarkerCategory =
  | "biological_age"
  | "organ_age"
  | "fitness"
  | "immune_composition"
  | "lipid"
  | "metabolic"
  | "inflammatory"
  | "hormone"
  | "thyroid"
  | "nutrient"
  | "liver"
  | "kidney"
  | "hematology"
  | "wearable_recovery"
  | "wearable_sleep"
  | "wearable_activity"
  | "cgm"
  | "body_composition"
  | "cardiovascular_imaging"
  | "cardiovascular_advanced"
  | "gut_health"
  | "oxidative_stress"
  | "genetic_variant";
```

## Catalog Entries by Priority Tier

### Tier 1: Expand Now (34 codes — covers 80% of longevity clinic workflows)

These are the biomarkers that appear on virtually every longevity panel.

#### Biological Age (existing 2 + new 5)

| Code | Title | Modality | Unit | LOINC | Aliases | Notes |
|------|-------|----------|------|-------|---------|-------|
| `epigenetic_biological_age` | Epigenetic Biological Age | epigenetic | years | -- | omicmage, biological age, bio age, biological_age, DNAge, TallyAge, Index biological age | **EXISTS.** Add aliases for myDNAge, Tally, Elysium. |
| `pace_of_aging` | Pace of Aging | epigenetic | biological years/year | -- | dunedinpace, pace of aging, pace_of_aging | **EXISTS.** |
| `epigenetic_fitness_age` | Physical Fitness Age | epigenetic | years | -- | OMICm FitAge, fit age, fitness age | NEW |
| `intrinsic_epigenetic_age` | Intrinsic Epigenetic Age | epigenetic | years | -- | IEAA, Horvath clock, intrinsic age | NEW |
| `extrinsic_epigenetic_age` | Extrinsic Epigenetic Age | epigenetic | years | -- | EEAA, Hannum clock, extrinsic age | NEW |
| `glycan_biological_age` | Glycan Biological Age | blood | years | -- | GlycanAge, glycan age | NEW. Distinct modality from epigenetic. |
| `telomere_length` | Telomere Length | epigenetic | kb | -- | average telomere length, telomere | NEW. No standard LOINC. |

#### Lipid (existing 1 + new 4)

| Code | Title | Modality | Unit | LOINC | Aliases |
|------|-------|----------|------|-------|---------|
| `apob` | ApoB | blood | mg/dL | 1884-6 | apob, apo b, apolipoprotein b | **EXISTS.** Add LOINC. |
| `ldl_cholesterol` | LDL Cholesterol | blood | mg/dL | 13457-7 | LDL, LDL-C, LDL cholesterol calc | NEW |
| `hdl_cholesterol` | HDL Cholesterol | blood | mg/dL | 2085-9 | HDL, HDL-C | NEW |
| `triglycerides` | Triglycerides | blood | mg/dL | 2571-8 | TG, triglycerides | NEW |
| `lp_a` | Lipoprotein(a) | blood | nmol/L | 43583-4 | Lp(a), lipoprotein a, lp-a | NEW. Note: also reported in mg/dL (LOINC 10835-7). Not interconvertible. |

#### Metabolic (new 4)

| Code | Title | Modality | Unit | LOINC | Aliases |
|------|-------|----------|------|-------|---------|
| `fasting_glucose` | Fasting Glucose | blood | mg/dL | 1558-6 | glucose, fasting glucose, blood sugar | |
| `fasting_insulin` | Fasting Insulin | blood | uIU/mL | 27873-9 | insulin, fasting insulin | |
| `hba1c` | HbA1c | blood | % | 4548-4 | hemoglobin a1c, a1c, HbA1c, glycated hemoglobin | |
| `homa_ir` | HOMA-IR | blood | ratio | -- | HOMA-IR, insulin resistance | Calculated value. No formal LOINC. |

#### Inflammatory (existing 1 + new 3)

| Code | Title | Modality | Unit | LOINC | Aliases |
|------|-------|----------|------|-------|---------|
| `inflammation_crp` | hs-CRP | blood | mg/L | 30522-7 | crp, c-reactive protein, hs-crp, inflammation score | **EXISTS.** Add LOINC. Disambiguate from DNAmCRP. |
| `homocysteine` | Homocysteine | blood | umol/L | 2428-1 | homocysteine, Hcy | NEW |
| `il_6` | Interleukin-6 | blood | pg/mL | 26881-3 | IL-6, interleukin 6 | NEW |
| `fibrinogen` | Fibrinogen | blood | mg/dL | 3255-7 | fibrinogen | NEW |

#### Hormones (new 6)

| Code | Title | Modality | Unit | LOINC | Aliases |
|------|-------|----------|------|-------|---------|
| `testosterone_total` | Total Testosterone | blood | ng/dL | 2986-8 | testosterone, total testosterone | |
| `free_testosterone` | Free Testosterone | blood | pg/mL | 2991-8 | free testosterone, free T | |
| `dhea_s` | DHEA-S | blood | ug/dL | 2191-5 | DHEA-S, DHEA sulfate, dehydroepiandrosterone sulfate | |
| `cortisol_am` | Cortisol (AM) | blood | ug/dL | 2143-6 | cortisol, AM cortisol, morning cortisol | |
| `igf_1` | IGF-1 | blood | ng/mL | 2484-4 | IGF-1, insulin-like growth factor | |
| `tsh` | TSH | blood | uIU/mL | 3016-3 | TSH, thyroid stimulating hormone, thyrotropin | |

#### Nutrients (new 3)

| Code | Title | Modality | Unit | LOINC | Aliases |
|------|-------|----------|------|-------|---------|
| `vitamin_d` | Vitamin D (25-OH) | blood | ng/mL | 62292-8 | vitamin D, 25-hydroxy vitamin D, 25-OH-D | |
| `vitamin_b12` | Vitamin B12 | blood | pg/mL | 2132-9 | B12, cobalamin | |
| `omega_3_index` | Omega-3 Index | blood | % | 88998-0 | omega-3 index, EPA+DHA index, OmegaCheck | |

#### Wearable (existing 2 + new 3)

| Code | Title | Modality | Unit | LOINC | Aliases | Notes |
|------|-------|----------|------|-------|---------|-------|
| `wearable_hrv_sleep_window` | Recovery Capacity (RMSSD) | wearable | ms | -- | hrv, average hrv, nighttime hrv, rmssd, hrv_rmssd_milli | **EXISTS.** Clarify as RMSSD only. |
| `resting_heart_rate` | Resting Heart Rate | wearable | bpm | -- | rhr, resting heart rate, restingHeartRateInBeatsPerMinute | **EXISTS.** |
| `wearable_hrv_sdnn` | HRV (SDNN) | wearable | ms | -- | SDNN, HeartRateVariabilitySDNN | NEW. Apple Watch only. Not comparable to RMSSD. |
| `wearable_spo2` | Blood Oxygen (SpO2) | wearable | % | -- | SpO2, spo2_percentage, oxygen saturation | NEW |
| `wearable_vo2max_estimate` | VO2max Estimate | wearable | mL/min/kg | -- | VO2Max, cardio fitness, estimated VO2max | NEW. Wearable estimate, not lab-measured. |

---

### Tier 2: Expand Soon (25 codes — deepens clinical value)

#### Organ Ages (new 11)

| Code | Title | Modality | Unit | Aliases |
|------|-------|----------|------|---------|
| `organ_age_brain` | Brain Age | epigenetic | years | brain age, SYMPHONYAge brain, brain system age |
| `organ_age_heart` | Heart Age | epigenetic | years | heart age, SYMPHONYAge heart, heart system age |
| `organ_age_liver` | Liver Age | epigenetic | years | liver age, SYMPHONYAge liver, liver system age |
| `organ_age_kidney` | Kidney Age | epigenetic | years | kidney age, SYMPHONYAge kidney, kidney system age |
| `organ_age_lung` | Lung Age | epigenetic | years | lung age, SYMPHONYAge lung |
| `organ_age_blood` | Blood Age | epigenetic | years | blood age, SYMPHONYAge blood, blood system age |
| `organ_age_immune` | Immune System Age | epigenetic | years | immune age, SYMPHONYAge immune, immune system age |
| `organ_age_inflammation` | Inflammation Age | epigenetic | years | inflammation age, SYMPHONYAge inflammation, inflammation system age |
| `organ_age_metabolic` | Metabolic Age | epigenetic | years | metabolic age, SYMPHONYAge metabolic, metabolic system age |
| `organ_age_musculoskeletal` | Musculoskeletal Age | epigenetic | years | musculoskeletal age, SYMPHONYAge musculoskeletal |
| `organ_age_hormone` | Hormone Age | epigenetic | years | hormone age, SYMPHONYAge hormone, hormone system age |

Note: Both TruDiagnostic (SYMPHONYAge, 11 organs) and Elysium (Index, 9 system ages) report organ-specific ages. The canonical codes should capture both with vendor-specific aliases.

#### Liver / Kidney / Hematology (new 8)

| Code | Title | Modality | Unit | LOINC | Aliases |
|------|-------|----------|------|-------|---------|
| `alt` | ALT | blood | U/L | 1742-6 | ALT, alanine aminotransferase, SGPT |
| `ast` | AST | blood | U/L | 1920-8 | AST, aspartate aminotransferase, SGOT |
| `ggt` | GGT | blood | U/L | 2324-2 | GGT, gamma-glutamyl transferase |
| `albumin` | Albumin | blood | g/dL | 1751-7 | albumin |
| `creatinine` | Creatinine | blood | mg/dL | 2160-0 | creatinine |
| `egfr` | eGFR | blood | mL/min/1.73m2 | 33914-3 | eGFR, estimated GFR |
| `cystatin_c` | Cystatin C | blood | mg/L | 33863-2 | cystatin C |
| `uric_acid` | Uric Acid | blood | mg/dL | 3084-1 | uric acid, urate |

#### Body Composition (new 6)

| Code | Title | Modality | Unit | Aliases | Notes |
|------|-------|----------|------|---------|-------|
| `dexa_body_fat_pct` | Total Body Fat % | clinical | % | body fat percentage, total fat | Scanner make/model in metadata. |
| `dexa_vat_mass` | Visceral Fat (DEXA) | clinical | grams | VAT, visceral adipose tissue | Not comparable across scanner platforms. |
| `dexa_almi` | ALM Index | clinical | kg/m^2 | ALMI, appendicular lean mass index | Sarcopenia screening. |
| `dexa_bmd_tscore` | Bone Density T-score | clinical | SD | T-score, bone mineral density | >-1.0 normal, <-2.5 osteoporosis. |
| `vo2max_measured` | VO2max (Lab-Measured) | clinical | mL/kg/min | VO2max, VO2peak | Distinct from wearable estimate. |
| `cac_score` | CAC Agatston Score | clinical | dimensionless | CAC, calcium score, Agatston | 0=very low, 1-99=mild, 100-299=mod, 300+=high. |

---

### Tier 3: Expand When Demand Requires (20+ codes)

#### Advanced Cardiovascular

| Code | Title | Unit | LOINC | Notes |
|------|-------|------|-------|-------|
| `ldl_particle_number` | LDL-P | nmol/L | 54434-6 | NMR lipoprotein fractionation |
| `small_ldl_p` | Small LDL-P | nmol/L | -- | NMR |
| `oxidized_ldl` | Oxidized LDL | U/L | 68935-6 | Cleveland HeartLab |
| `mpo` | Myeloperoxidase | pmol/L | -- | Cleveland HeartLab |
| `lp_pla2` | Lp-PLA2 Activity | nmol/min/mL | -- | Cleveland HeartLab |
| `tmao` | TMAO | uM | -- | Cleveland HeartLab |
| `coq10` | Coenzyme Q10 | ug/mL | -- | Cleveland HeartLab |

#### Additional Hormones

| Code | Title | Unit | LOINC |
|------|-------|------|-------|
| `estradiol` | Estradiol | pg/mL | 2243-4 |
| `progesterone` | Progesterone | ng/mL | 2839-9 |
| `shbg` | SHBG | nmol/L | 2942-1 |
| `free_t3` | Free T3 | pg/mL | 3051-0 |
| `free_t4` | Free T4 | ng/dL | 3024-7 |
| `reverse_t3` | Reverse T3 | ng/dL | 3052-8 |

#### Additional Nutrients

| Code | Title | Unit | LOINC |
|------|-------|------|-------|
| `ferritin` | Ferritin | ng/mL | 2276-4 |
| `folate` | Folate | ng/mL | 2284-8 |
| `magnesium_rbc` | Magnesium (RBC) | mg/dL | 26746-8 |
| `iron_saturation` | Iron Saturation | % | 2502-3 |

#### Aging-Specific

| Code | Title | Unit | Notes |
|------|-------|------|-------|
| `nad_intracellular` | Intracellular NAD+ | uM | Jinfiniti. Optimal 40-100. |
| `oxidative_stress_8ohdg` | 8-OHdG | ng/mg creatinine | DUTCH, urine. LOINC 59265-9. |

#### Methylation Proxies (TruDiagnostic EBPs)

| Code | Title | Unit | Notes |
|------|-------|------|-------|
| `dnam_crp` | DNAm CRP (Proxy) | proxy | Distinct from direct hs-CRP. |
| `dnam_il6` | DNAm IL-6 (Proxy) | proxy | Distinct from direct IL-6. |

#### Gut Health (high-value markers only)

| Code | Title | Unit | Notes |
|------|-------|------|-------|
| `calprotectin` | Calprotectin | ug/g | GI-MAP, GI Effects. Gut inflammation. |
| `secretory_iga` | Secretory IgA | mg/dL | GI-MAP. Mucosal immunity. |
| `pancreatic_elastase` | Pancreatic Elastase-1 | ug/g | GI-MAP. Digestive capacity. |
| `zonulin` | Zonulin | ng/mL | Intestinal permeability. |

#### Genetic Variants

| Code | Title | Modality | Unit | Notes |
|------|-------|----------|------|-------|
| `apoe_genotype` | ApoE Genotype | genetic | categorical | e.g., "e3/e3", "e3/e4" |
| `mthfr_status` | MTHFR Status | genetic | categorical | C677T, A1298C variants |

---

## Data Model Implications

### Non-numeric values

The current `value: number` field in `CanonicalMeasurement` cannot handle:
- Genotype results ("e3/e4", "*1/*2")
- Bounded results ("<0.1", ">99")
- Categorical results ("positive", "detected")
- Ratio-only results ("compound heterozygous C677T/A1298C")

**Recommendation:** Add `textValue?: string` alongside `value?: number`. At least one must be present. The `confidence` and `interpretation` fields can carry clinical context.

### Modality expansion

Current modalities: epigenetic, blood, wearable, clinical.

Needed: stool, urine, saliva, genetic. These are required for GI-MAP (stool), DUTCH/OAT (urine), Elysium/Tally (saliva), and ApoE/MTHFR (genetic) results.

### Unit disambiguation

Several biomarkers have competing unit conventions. The catalog must store `preferredUnit` AND track `alternateUnits` with conversion rules (or explicit "not convertible" flags for Lp(a)).

### EBP vs direct measurement

TruDiagnostic TruHealth reports methylation-derived proxies (EBPs) for biomarkers that also exist as direct blood measurements. The catalog must clearly distinguish:
- `inflammation_crp` (direct blood measurement, mg/L) vs `dnam_crp` (epigenetic proxy, dimensionless)
- `il_6` (direct blood, pg/mL) vs `dnam_il6` (epigenetic proxy)

---

## Implementation Order

1. **Extend schema** — add `category`, `loincCode`, `alternateUnits`, `refRange`, `longevityOptimal`, `notes` to `CanonicalDefinition`
2. **Update existing 6 entries** — add LOINC codes to `apob` and `inflammation_crp`, add aliases to `epigenetic_biological_age`
3. **Add Tier 1 codes** (34 entries total) — covers core blood panel + key wearable + epigenetic age variants
4. **Add Tier 2 codes** (59 total) — organ ages + organ function + body composition
5. **Add Tier 3 codes** (79+ total) — advanced cardio + specialty + gut health + genetics

Each tier should ship with:
- Updated `canonical-catalog.json`
- Updated normalization aliases in `normalize.ts`
- Updated functional tests covering the new mappings
- Updated `domain-model.md` reflecting the expanded concept set
