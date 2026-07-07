-- Google-Sync (Wegvisier-Spec v2, Abschnitt 4): serverseitige Ablage der
-- Google-OAuth-Tokens (refresh_token) und der Kalender-ID des eigenen
-- Kalenders "WienEnergie Dienstplan".
--
-- Sicherheit: RLS ist AN, aber es gibt ABSICHTLICH KEINE Policies.
-- Dadurch kann der Browser (anon/authenticated) diese Tabelle weder lesen
-- noch schreiben. Nur die Edge Function `google-sync` greift mit der
-- Service Role darauf zu. Das refresh_token verlaesst den Server nie.
--
-- (Am 7.7.2026 bereits auf das Supabase-Projekt jvjerdlbpjrjvmkumhov
-- angewendet; diese Datei dient der Nachvollziehbarkeit im Repo.)
create table if not exists public.user_google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  calendar_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_google_tokens enable row level security;
