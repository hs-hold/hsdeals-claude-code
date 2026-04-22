-- extraction_audits: raw LLM responses for debugging
create table if not exists extraction_audits (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  raw_response text,
  prompt_tokens_estimate integer,
  created_at timestamptz default now()
);
create index if not exists extraction_audits_message_id_idx on extraction_audits(message_id);

-- prefilter_log: always saved, enables false-negative analysis
create table if not exists prefilter_log (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  score integer not null,
  signals jsonb,
  skip_reason text,
  created_at timestamptz default now()
);
create index if not exists prefilter_log_message_id_idx on prefilter_log(message_id);

-- review_queue: deals that need human review
create table if not exists review_queue (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete cascade,
  message_id text,
  route_reason text,
  overall_confidence float,
  extraction jsonb,
  status text default 'pending',
  created_at timestamptz default now()
);
create index if not exists review_queue_status_idx on review_queue(status);
