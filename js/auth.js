// Connexion Microsoft (MSAL.js, flux « redirection », jeton gardé dans le navigateur).
const C = window.PF_CONFIG;
let app = null, account = null;
const redirectUri = location.origin + location.pathname.replace(/index\.html$/, "");

export async function initAuth() {
  if (window.PF_TEST) { account = { username: window.PF_TEST_USER || "test@exemple.fr" }; return; } // jamais défini en production : sert aux tests automatiques
  app = new msal.PublicClientApplication({
    auth: { clientId: C.clientId, authority: C.authority, redirectUri, postLogoutRedirectUri: redirectUri, navigateToLoginRequestUrl: false },
    cache: { cacheLocation: "localStorage" }
  });
  await app.initialize();
  gardeCleDeChiffrement();
  try {
    const r = await app.handleRedirectPromise();
    if (r && r.account) { account = r.account; localStorage.pf_lastLogin = String(Date.now()); }
  } catch (e) { console.warn("Retour de connexion en erreur", e); }
  account = account || app.getAllAccounts()[0] || null;
  if (account) { app.setActiveAccount(account); try { localStorage.pf_lastUser = account.username; } catch { /* tant pis */ } }
  gardeCleDeChiffrement();
  // à chaque retour dans l'application, on renouvelle la durée de vie de la clé
  document.addEventListener("visibilitychange", () => { if (!document.hidden) gardeCleDeChiffrement(); });
}

/* POURQUOI TANT DE RECONNEXIONS : depuis la version 4, MSAL chiffre ses jetons gardés dans le téléphone, et range la clé de
   chiffrement dans un cookie « de session » (sans date de fin). Sur iPhone, ce cookie disparaît dès que l'application est fermée
   ou vidée de la mémoire ; les jetons deviennent alors illisibles et il faut se reconnecter. On donne donc à ce cookie une vraie
   durée de vie (30 jours) : le jeton, lui, reste limité à 24 h côté Microsoft, ce qui donne une seule reconnexion par jour. */
function gardeCleDeChiffrement() {
  try {
    const c = document.cookie.split("; ").find(x => x.startsWith("msal.cache.encryption="));
    if (!c) return;
    const fin = new Date(Date.now() + 30 * 864e5).toUTCString();
    document.cookie = `${c}; path=/; SameSite=None; Secure; expires=${fin}`;
  } catch { /* tant pis : on se reconnectera */ }
}

export const isSignedIn = () => !!account;

/* Accès « dossiers partagés » : réservé aux téléphones qui en ont besoin (celui d'une personne à qui le dossier est partagé).
   Il demande à Microsoft l'autorisation élargie Files.ReadWrite.All, une seule fois, sur CET appareil. Les autres appareils
   gardent l'autorisation d'origine, inchangée. */
const WIDE_KEY = "pf_wide";
export const isWide = () => { try { return localStorage.getItem(WIDE_KEY) === "1"; } catch { return false; } };
const scopes = () => isWide() ? ["User.Read", "Files.ReadWrite.All"] : C.scopes;
/** Active l'accès élargi sur cet appareil puis relance la connexion Microsoft (la page est quittée). */
export async function enableWideAccess() {
  try { localStorage.setItem(WIDE_KEY, "1"); } catch { /* tant pis */ }
  jeton = null;
  localStorage.pf_lastLogin = String(Date.now());
  const req = { scopes: scopes(), prompt: "consent" };
  if (account) req.account = account;
  await app.loginRedirect(req);
}
/** Revient à l'autorisation d'origine sur cet appareil. */
export function disableWideAccess() { try { localStorage.removeItem(WIDE_KEY); } catch { /* rien */ } jeton = null; }

/** Empreinte du compte connecté (jamais l'adresse elle-même). */
export async function accountHash() {
  const data = new TextEncoder().encode("pf1:" + userName().trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
/** Ce compte a-t-il le droit d'ouvrir l'application ? (contrôle d'affichage ; la vraie protection des fichiers reste celle de OneDrive) */
export async function isAllowed() {
  if (window.PF_TEST && !window.PF_TEST_USER) return true;
  return (C.allowedHashes || []).includes(await accountHash());
}
export const userName = () => (account && account.username) || "";

let jeton = null, enCours = null;   // jeton gardé en mémoire (valable ~1 h) et demande en cours (une seule à la fois)

/** Erreurs qui veulent vraiment dire « Microsoft demande de se reconnecter » (et pas « le réseau a eu un hoquet »). */
const faut_se_reconnecter = e => !!e && (e.name === "InteractionRequiredAuthError"
  || /interaction_required|login_required|consent_required|invalid_grant|no_account|bad_token|refresh_token_expired|user_login_error/i.test(String(e.errorCode || e.subError || "") + " " + String(e.message || "")));

export async function getToken() {
  if (window.PF_TEST) return "test-token";
  if (!account) throw authError("Pas connecté");
  if (jeton && jeton.exp - Date.now() > 120000) return jeton.token;
  if (enCours) return enCours;
  enCours = (async () => {
    try {
      const r = await app.acquireTokenSilent({ scopes: scopes(), account });
      jeton = { token: r.accessToken, exp: r.expiresOn ? +new Date(r.expiresOn) : Date.now() + 3000000 };
      return r.accessToken;
    } catch (e) {
      if (faut_se_reconnecter(e)) { jeton = null; throw authError("Reconnexion nécessaire"); }
      // réseau coupé, 4G qui hésite… : ce n'est PAS une déconnexion. L'erreur n'a pas de code HTTP : l'appli lit alors sa copie locale.
      console.warn("Jeton : erreur passagère", e && (e.errorCode || e.message));
      throw new Error("Réseau indisponible");
    } finally { enCours = null; }
  })();
  return enCours;
}
function authError(msg) { const e = new Error(msg); e.status = 401; e.auth = true; return e; }

/** Connexion. Si on connaît déjà le compte de cet appareil, on le propose à Microsoft (loginHint) sans redemander de choisir :
    tant que la session Microsoft est vivante, le retour est immédiat. */
export async function login() {
  localStorage.pf_lastLogin = String(Date.now());
  let hint = ""; try { hint = localStorage.pf_lastUser || ""; } catch { /* rien */ }
  const req = { scopes: scopes() };
  if (hint) req.loginHint = hint; else req.prompt = "select_account";
  await app.loginRedirect(req);
}
/** Reconnexion automatique, une seule tentative par ouverture de l'application (jamais en boucle). */
export function autoLogin() {
  try {
    if (!app || sessionStorage.pf_auto === "1" || !localStorage.pf_lastUser) return false;
    sessionStorage.pf_auto = "1";
  } catch { return false; }
  login();
  return true;
}
export async function logout() { try { localStorage.removeItem("pf_lastUser"); } catch { /* rien */ } if (app && account) await app.logoutRedirect({ account }); }
