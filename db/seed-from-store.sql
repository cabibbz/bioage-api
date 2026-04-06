-- Generated from data/store.json
-- Safe for local bootstrap against db/postgres-schema.sql

insert into patients (id, display_name, chronological_age, focus, last_reviewed_at) values
  ('pt_001', 'Ari Morgan', 47, 'Longevity follow-up after sleep, resistance training, and omega-3 protocol.', '2026-04-03T14:15:00.000Z')
on conflict do nothing;

insert into patient_measurements (id, patient_id, canonical_code, title, modality, source_vendor, observed_at, numeric_value, unit, interpretation, evidence_status, confidence_label, delta_label, created_at) values
  ('m_epi_1', 'pt_001', 'epigenetic_biological_age', 'Epigenetic Biological Age', 'epigenetic', 'TruDiagnostic', '2026-03-22T10:00:00.000Z', 44.8, 'years', 'Younger than chronological age with moderate confidence and a favorable 6-month trend.', 'improving', 'high', '-2.2y vs chronological', now()),
  ('m_pace_1', 'pt_001', 'pace_of_aging', 'Pace of Aging', 'epigenetic', 'TruDiagnostic', '2026-03-22T10:00:00.000Z', 0.89, 'biological years/year', 'Below reference pace. Good candidate for intervention-linked tracking.', 'improving', 'high', '11% slower than reference', now()),
  ('m_crp_1', 'pt_001', 'inflammation_crp', 'hs-CRP', 'blood', 'Quest panel via Terra parser', '2026-03-18T08:30:00.000Z', 1.7, 'mg/L', 'Improved from prior draw, but still relevant for long-term intervention review.', 'watch', 'moderate', '-0.9 mg/L in 90 days', now()),
  ('m_hrv_1', 'pt_001', 'wearable_hrv_sleep_window', 'Recovery Capacity (RMSSD)', 'wearable', 'Oura', '2026-04-02T07:00:00.000Z', 46, 'ms', 'Wearable signal is improving, but still trails the favorable epigenetic trend.', 'conflicted', 'review', '+8 ms in 30 days', now())
on conflict do nothing;

insert into patient_timeline_events (id, patient_id, event_type, occurred_at, title, detail, created_at) values
  ('t_001', 'pt_001', 'assessment', '2026-03-22T10:00:00.000Z', 'TruDiagnostic follow-up uploaded', 'New OMICmAge and DunedinPACE results normalized into the longitudinal record.', now()),
  ('t_002', 'pt_001', 'intervention', '2026-02-11T16:30:00.000Z', 'Resistance training block started', '3x weekly plan, protein target raised, creatine added.', now()),
  ('t_003', 'pt_001', 'intervention', '2026-01-09T09:00:00.000Z', 'Sleep compression protocol retired', 'Care plan shifted toward consistent wake time and late caffeine removal after HRV deterioration.', now()),
  ('t_004', 'pt_001', 'assessment', '2025-12-20T08:30:00.000Z', 'Quest inflammation panel parsed', 'CRP, fasting insulin, ApoB, and CBC markers entered via document parser for baseline comparison.', now())
on conflict do nothing;

-- report_ingestions: no rows

-- source_documents: no rows

-- parse_tasks: no rows

-- review_decisions: no rows

-- measurement_promotions: no rows
