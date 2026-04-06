-- Postgres-ready schema target for the longevity evidence layer.
-- This schema preserves the current product contract:
-- source document -> parse task -> review decision -> measurement promotion.

create table if not exists patients (
  id text primary key,
  display_name text not null,
  chronological_age integer not null check (chronological_age > 0),
  focus text not null,
  last_reviewed_at timestamptz not null
);

create table if not exists patient_measurements (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  canonical_code text not null,
  title text not null,
  modality text not null,
  source_vendor text not null,
  observed_at timestamptz not null,
  numeric_value double precision,
  text_value text,
  unit text,
  interpretation text not null,
  evidence_status text not null,
  confidence_label text not null,
  delta_label text,
  constraint patient_measurements_has_value
    check (numeric_value is not null or text_value is not null),
  created_at timestamptz not null default now()
);

alter table if exists patient_measurements
  alter column numeric_value drop not null;

alter table if exists patient_measurements
  add column if not exists text_value text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'patient_measurements_has_value'
  ) then
    alter table patient_measurements
      add constraint patient_measurements_has_value
      check (numeric_value is not null or text_value is not null);
  end if;
end $$;

create index if not exists idx_patient_measurements_patient_observed
  on patient_measurements (patient_id, observed_at desc);

create index if not exists idx_patient_measurements_canonical
  on patient_measurements (patient_id, canonical_code, observed_at desc);

create table if not exists patient_timeline_events (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null,
  title text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_patient_timeline_events_patient_occurred
  on patient_timeline_events (patient_id, occurred_at desc);

create table if not exists report_ingestions (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  vendor text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null,
  mapped_measurements jsonb not null default '[]'::jsonb,
  unmapped_entries jsonb not null default '[]'::jsonb
);

create index if not exists idx_report_ingestions_patient_received
  on report_ingestions (patient_id, received_at desc);

create table if not exists source_documents (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  source_system text not null,
  ingestion_channel text not null,
  original_filename text not null,
  stored_filename text not null,
  storage_backend text not null,
  storage_key text not null,
  relative_path text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size >= 0),
  checksum_sha256 text not null,
  classification text not null,
  status text not null,
  received_at timestamptz not null,
  observed_at timestamptz,
  parent_document_id text references source_documents(id) on delete cascade,
  archive_entry_path text,
  archive_entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_source_documents_patient_received
  on source_documents (patient_id, received_at desc);

create index if not exists idx_source_documents_parent
  on source_documents (parent_document_id);

create index if not exists idx_source_documents_checksum
  on source_documents (checksum_sha256);

create table if not exists parse_tasks (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  source_document_filename text not null,
  source_document_classification text not null,
  mode text not null,
  parser text not null,
  status text not null,
  summary text not null,
  detail text not null,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  metadata jsonb not null default '[]'::jsonb,
  candidates jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_parse_tasks_patient_updated
  on parse_tasks (patient_id, updated_at desc);

create index if not exists idx_parse_tasks_source_document
  on parse_tasks (source_document_id);

create table if not exists review_decisions (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  parse_task_id text not null references parse_tasks(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  candidate_id text not null,
  candidate_display_name text not null,
  candidate_value_label text not null,
  candidate_source_path text not null,
  action text not null,
  reviewer_name text not null,
  note text,
  proposed_canonical_code text,
  proposed_title text,
  proposed_modality text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists idx_review_decisions_unique_candidate
  on review_decisions (patient_id, parse_task_id, candidate_id);

create index if not exists idx_review_decisions_patient_updated
  on review_decisions (patient_id, updated_at desc);

create table if not exists measurement_promotions (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  review_decision_id text not null references review_decisions(id) on delete cascade,
  parse_task_id text not null references parse_tasks(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  canonical_code text not null,
  title text not null,
  modality text not null,
  measurement_id text not null references patient_measurements(id) on delete cascade,
  promoted_at timestamptz not null
);

create unique index if not exists idx_measurement_promotions_review_decision
  on measurement_promotions (review_decision_id);

create index if not exists idx_measurement_promotions_patient_promoted
  on measurement_promotions (patient_id, promoted_at desc);
