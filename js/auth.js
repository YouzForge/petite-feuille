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
  try {
    const r = await app.handleRedirectPromise();
    if (r && r.account) { account = r.account; localStorage.pf_lastLogin = String(Date.now()); }
  } catch (e) { console.warn("Retour de connexion en erreur", e); }
  account = account || app.getAllAccounts()[0] || null;
  if (account) app.setActiveAccount(account);
}

export const isSignedIn = () => !!account;

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

export async function getToken() {
  if (window.PF_TEST) return "test-token";
  if (!account) throw authError("Pas connecté");
  try {
    const r = await app.acquireTokenSilent({ scopes: C.scopes, account });
    return r.accessToken;
  } catch (e) {
    throw authError("Reconnexion nécessaire");
  }
}
function authError(msg) { const e = new Error(msg); e.status = 401; e.auth = true; return e; }

export async function login() {
  localStorage.pf_lastLogin = String(Date.now());
  await app.loginRedirect({ scopes: C.scopes, prompt: "select_account" });
}
export async function logout() { if (app && account) await app.logoutRedirect({ account }); }
