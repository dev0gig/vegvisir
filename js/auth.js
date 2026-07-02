/* ============ AUTH (Supabase: GitHub-Login + Zugriffsschutz) ============ *
 * Vor der eigentlichen App steht ein Login-Gate. Angemeldet wird per
 * GitHub-OAuth über Supabase. Nach dem Login wird geprüft, ob die E-Mail
 * exakt der erlaubten (ALLOWED_EMAIL aus js/config.js) entspricht — sonst
 * wird sofort wieder abgemeldet und „Kein Zugriff" angezeigt.
 *
 * Die Zugangsdaten kommen aus window.VEGVISIR_CONFIG (js/config.js), der
 * Supabase-Client aus dem per CDN geladenen globalen `supabase`-Objekt. */

const CFG = window.VEGVISIR_CONFIG || {};
const ALLOWED = String(CFG.ALLOWED_EMAIL || "").trim().toLowerCase();

const client =
  window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
    : null;

let currentUser = null;

const gate = document.getElementById("authGate");
const msg = document.getElementById("authMsg");
const loginBtn = document.getElementById("loginGithub");
const logoutBtn = document.getElementById("logoutBtn");

/* Für data.js: der Client und der angemeldete Benutzer (oder null). */
export function getSupabase() { return client; }
export function getUser() { return currentUser; }

/* Gate zeigen. Ohne Text bleibt eine evtl. gesetzte Meldung erhalten (damit
   z.B. „Kein Zugriff" nicht vom nachfolgenden Abmelde-Ereignis gelöscht wird). */
function showGate(text) {
  currentUser = null;
  if (gate) gate.hidden = false;
  if (msg && text !== undefined) msg.textContent = text;
}
function hideGate() {
  if (gate) gate.hidden = true;
  if (msg) msg.textContent = "";
}

async function loginWithGitHub() {
  if (!client) { showGate("Supabase ist nicht konfiguriert (siehe js/config.js)."); return; }
  if (msg) msg.textContent = "";
  try {
    await client.auth.signInWithOAuth({
      provider: "github",
      options: {
        // Nach dem GitHub-Umweg exakt hierher zurück (ohne Query/Hash-Reste).
        redirectTo: window.location.origin + window.location.pathname,
        scopes: "user:email",
      },
    });
  } catch {
    showGate("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
  }
}

export async function logout() {
  try { if (client) await client.auth.signOut(); } catch {}
  showGate("");
}

/* Entscheidet anhand der Session, ob die App startet oder das Gate bleibt. */
async function handleSession(session, onAuthed) {
  const user = session && session.user;
  if (!user) { showGate(); return; }

  const email = String(user.email || "").trim().toLowerCase();
  if (!ALLOWED || email !== ALLOWED) {
    // Falsches Konto: sofort abmelden, Gate mit Fehlermeldung zeigen.
    try { await client.auth.signOut(); } catch {}
    showGate("Kein Zugriff.");
    return;
  }

  currentUser = user;
  hideGate();
  if (typeof onAuthed === "function") onAuthed();
}

/* Hängt Login-/Logout-Knöpfe an, prüft die aktuelle Session und lauscht auf
   Anmelde-Änderungen (auch die Rückkehr vom GitHub-OAuth). `onAuthed` wird bei
   gültigem, erlaubtem Login aufgerufen — ggf. mehrfach, deshalb sorgt der
   Aufrufer (main.js) selbst für einen einmaligen App-Start. */
export async function initAuth(onAuthed) {
  if (loginBtn) loginBtn.addEventListener("click", loginWithGitHub);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  if (!client) { showGate("Supabase ist nicht konfiguriert (siehe js/config.js)."); return; }

  client.auth.onAuthStateChange((_event, session) => handleSession(session, onAuthed));

  try {
    const { data } = await client.auth.getSession();
    handleSession(data ? data.session : null, onAuthed);
  } catch {
    showGate();
  }
}
