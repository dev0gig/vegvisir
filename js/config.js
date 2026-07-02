/* ============ KONFIGURATION (Supabase) ============ *
 * Diese Werte dürfen öffentlich im Repo stehen: Der Anon-Key ist als
 * Browser-Schlüssel gedacht (er landet ohnehin im Client) und wird durch
 * Supabase-RLS + die ALLOWED_EMAIL-Prüfung abgesichert. Es sind KEINE
 * Geheimnisse — im Gegensatz zu echten Secrets oder Kundendaten.
 *
 * Dieses Skript wird als ganz normales <script> (kein Modul) vor den
 * App-Modulen geladen und setzt window.VEGVISIR_CONFIG.
 *
 * Vercel/Build-Override: Setzt eine Umgebung (z.B. ein Build-Step) VORHER
 * window.VEGVISIR_CONFIG, gewinnen diese Werte — dann werden die Vorgaben
 * hier nicht verwendet. So lassen sich die Werte pro Umgebung austauschen,
 * ohne die Datei zu ändern. */

window.VEGVISIR_CONFIG = window.VEGVISIR_CONFIG || {
  SUPABASE_URL: "https://jvjerdlbpjrjvmkumhov.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2amVyZGxicGpyanZta3VtaG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NTUwNTcsImV4cCI6MjA5ODUzMTA1N30.asgS_YoHpt7xRnUYHolgKWxgzFcOHx3Gm5-Iw5KIj8Q",

  /* NUR diese E-Mail bekommt Zugriff. Muss exakt der E-Mail entsprechen, die
     GitHub bei der Anmeldung zurückliefert (die primäre GitHub-E-Mail). */
  ALLOWED_EMAIL: "biosgiga@gmail.com",
};
