/**
 * Elegoo Centauri Carbon 2 — Cloud Canvas & Filament Tracker
 */

const COLOR_NAMES_IT = {
  "#FFFFFF": "Bianco",
  "#F5F7FA": "Bianco",
  "#898989": "Grigio",
  "#808080": "Grigio",
  "#7C8594": "Grigio",
  "#F72221": "Rosso",
  "#FF3B30": "Rosso",
  "#FF0000": "Rosso",
  "#000000": "Nero",
  "#1E1E24": "Nero",
  "#22252E": "Nero",
  "#00D2FF": "Ciano",
  "#36A8E1": "Azzurro",
  "#007AFF": "Blu",
  "#34C759": "Verde",
  "#00FF00": "Verde",
  "#FFCC00": "Giallo",
  "#FFFF00": "Giallo",
  "#FF9500": "Arancione",
  "#AF52DE": "Viola"
};

const DEFAULT_IGNORED_OLD_TASK_IDS = [];

const state = {
  auth: {
    loggedIn: false,
    region: "intl",
    email: "",
    token: "",
    refreshToken: "",
    user: null
  },
  printers: [],
  selectedPrinterSn: "",
  spools: [],
  prints: [],
  fileMetaCache: {},
  liveSnapshotsByFile: {},
  ignoredCloudTaskIds: [...DEFAULT_IGNORED_OLD_TASK_IDS],
  manuallyDeletedTaskIds: [],
  lastActiveSlot: null,
  lastActiveSlotAt: 0,
  updatedAt: 0,
  ui: {
    historyFilter: "all",
    lastSyncTime: null
  }
};

const SESSION_STORAGE_KEY = "elegoo_cc2_user_session";
const MOBILE_APP_URL_STORAGE_KEY = "elegoo_cc2_mobile_app_url";
const QR_PAIRED_STORAGE_KEY = "elegoo_cc2_qr_paired";
const LANG_STORAGE_KEY = "elegoo_cc2_lang";
let DEFAULT_CLOUD_APP_URL = "";

let lastSlicerStatusData = null;

const I18N = {
  it: {
    brandSubtitle: "Canvas & Bobine",
    webQrTitle: "🔒 Accesso esclusivo tramite QR Code da PC",
    webQrDesc: "Questa Web App è protetta: conoscere l'indirizzo web non consente l'accesso né il login manuale con email o password.",
    webQrStepsTitle: "Come collegare il telefono:",
    webQrStep1: "1. Apri <strong>Elegoo Filament App</strong> sul tuo PC Windows.",
    webQrStep2: "2. Clicca su <strong>📱 Collega Telefono</strong> in alto a destra.",
    webQrStep3: "3. Inquadra il <strong>Codice QR</strong> con la fotocamera del telefono per accedere automaticamente.",
    tabSlicer: "⚡ Elegoo Slicer",
    tabCredentials: "Email e Password",
    tabToken: "Token Cloud",
    labelRegion: "Regione Server",
    regionIntl: "🌍 Europa / Internazionale (matrix.elegoo.com)",
    regionCn: "🇨🇳 Cina (matrix.elegoo.com.cn)",
    slicerTitle: "Connessione con Elegoo Slicer",
    btnAdoptSlicer: "✅ Usa sessione già attiva in Elegoo Slicer",
    slicerPrivacyNote: "Tutto resta <strong>100% in locale</strong> sul tuo PC: nessun token o password viene inviato all'esterno.",
    labelEmail: "Email Account Elegoo",
    placeholderEmail: "nome@esempio.com",
    labelPassword: "Password",
    togglePasswordTitle: "Mostra/Nascondi",
    btnLoginSubmit: "Accedi a Elegoo Cloud",
    labelToken: "Token di Sessione Elegoo",
    placeholderToken: "Incolla il token...",
    btnTokenSubmit: "Accedi con Token",
    printerSelectTitle: "Stampante",
    btnMobileQr: "Collega Telefono",
    btnMobileQrTitle: "Collega Smartphone tramite Codice QR",
    btnSlicerResync: "Ricollega Slicer",
    btnSlicerResyncTitle: "Ricollega Elegoo Slicer",
    btnLogout: "Esci",
    statusSynced: "Sincronizzato",
    panelInventory: "🗄️ Archivio Bobine",
    panelPrints: "🧾 Registro Stampe",
    filterAll: "Tutte",
    filterCompleted: "Completate",
    filterStopped: "Stoppate",
    modalSpoolSettings: "Impostazioni Bobina",
    labelSpoolName: "Nome / Marca Bobina",
    placeholderSpoolName: "es. Jayo PLA HS",
    labelSpoolMaterial: "Materiale",
    labelSpoolColor: "Colore",
    labelInitialWeight: "Peso Bobina Piena (g)",
    labelRemainingWeight: "Grammi Attualmente Rimasti (g)",
    btnCancel: "Annulla",
    btnSave: "Salva",
    modalPrintTitle: "Rettifica Stampa",
    labelPrintFile: "File Stampa",
    labelGcodeFile: "Carica file .gcode locale (opzionale, legge i grammi esatti)",
    labelPrintStatus: "Stato",
    optCompleted: "✅ Completata",
    optStopped: "🛑 Stoppata a metà",
    optInterrupted: "⚠️ Interrotta",
    labelSpoolUsed: "Bobina Usata",
    labelTotalSlicerGrams: "Peso Totale Slicer (g)",
    labelCompletionPct: "% Completamento",
    labelActualGrams: "Grammi Effettivamente Consumati (g)",
    modalQrTitle: "📱 Collega Telefono",
    qrCaption: "Inquadra il codice QR con la fotocamera dello smartphone per accedere subito alla Web App sincronizzata.",
    slicerWaitRunning: "Elegoo Slicer è aperto: esegui il logout e rifai l'accesso dentro Elegoo Slicer, oppure clicca qui sotto se vuoi riportarlo in primo piano.",
    slicerWaitStarting: "Elegoo Slicer avviato: completa il login nella finestra di Elegoo Slicer e questa app importerà il token da sola!",
    slicerExpired: "La sessione di Elegoo Slicer è scaduta. Clicca il pulsante qui sotto per aprire Elegoo Slicer ed eseguire un nuovo accesso.",
    slicerDefault: "Clicca il pulsante qui sotto per aprire Elegoo Slicer ed eseguire l'accesso: l'app leggerà e memorizzerà il token locale da sola senza chiederti password e senza disconnetterti.",
    btnReopenSlicer: "🔄 Riapri Elegoo Slicer",
    btnStartSlicer: "🔄 Avvia Elegoo Slicer e Accedi",
    btnOpeningSlicer: "⏳ Apertura Elegoo Slicer...",
    errInvalidQr: "QR Code non valido o scaduto. Riapri Elegoo Filament App sul PC e inquadra il nuovo Codice QR.",
    errManualDisabledWeb: "Accesso manuale disabilitato sulla Web App. Scansiona il Codice QR dall'app PC.",
    errCannotOpenSlicer: "Impossibile avviare Elegoo Slicer.",
    errStartSlicerBridge: "Errore avvio bridge Elegoo Slicer: {msg}",
    errInvalidSlicerSession: "Sessione Elegoo Slicer non valida.",
    errAdoptSlicer: "Errore adozione sessione Slicer: {msg}",
    errRelinkSlicer: "Errore ricollegamento Elegoo Slicer: {msg}",
    errInvalidCredentials: "Credenziali non valide.",
    errConnection: "Errore di connessione: {msg}",
    errSessionExpired: "Sessione scaduta. Effettua di nuovo l'accesso o riesegui Ricollega Slicer.",
    errSync: "Errore di sincronizzazione: {msg}",
    errSaveServer: "Errore nel salvataggio sul server.",
    errNotLoggedInQr: "Devi prima essere connesso a Elegoo Cloud.",
    btnLoggingIn: "Accesso in corso...",
    toastSyncedNewPrints: "Sincronizzate {count} nuove stampe da Elegoo Cloud!",
    toastSyncedCloud: "Canvas e bobine sincronizzati con Elegoo Cloud!",
    toastGcodeRead: "Letti {grams} g esatti dal file G-code!",
    toastPrintRemoved: "Stampa rimossa e grammi riaccreditati.",
    toastSpoolSaved: "Peso e materiale salvati!",
    toastPrintSaved: "Stampa salvata e peso bobina aggiornato!",
    toastOpenPcApp: "Avvia Elegoo_Filament_App.exe su PC Windows oppure incolla il Token Cloud.",
    updatedAtTime: "Aggiornato alle {time}",
    btnEditWeightMat: "✏️ Peso e Materiale",
    emptyArchive: "Nessuna bobina smontata",
    badgeUnmounted: "Smontata",
    badgeRemaining: "Residuo:",
    badgeOfWeight: "su {weight} g",
    emptyPrints: "Nessuna stampa registrata",
    badgeCompleted: "Completata ({pct}%)",
    badgeStopped: "Stoppata ({pct}%)",
    badgeInterrupted: "Interrotta ({pct}%)",
    btnAdjustPrint: "✏️ Rettifica",
    modalEditSpool: "Modifica Bobina",
    modalAddSpool: "Aggiungi Bobina Smontata in Archivio",
    slotSuffix: " — Slot A{slot}",
    archiveSuffix: " — Archivio",
    archiveTag: "[Archivio] ",
    confirmDeleteSpool: "Eliminare \"{name}\" dall'archivio?",
    spoolDefaultName: "Bobina",
    qrRequireLogin: "Effettua prima l'accesso per generare il QR.",
    qrNoGenerator: "Generatore QR non disponibile.",
    btnDonate: "Offrimi un caffè",
    btnDonateTitle: "Supporta Giulio Cantarelli su Ko-fi",
    btnMakerWorldTitle: "Modelli 3D di Giulio Cantarelli su MakerWorld",
    authorCredit: "Creato da",
    btnDonateLink: "☕ Supporta su Ko-fi"
  },
  en: {
    brandSubtitle: "Canvas & Spools",
    webQrTitle: "🔒 QR Code Login Only from PC",
    webQrDesc: "This Web App is protected: having its web address does not grant access or allow manual email/password login.",
    webQrStepsTitle: "How to link your phone:",
    webQrStep1: "1. Open <strong>Elegoo Filament App</strong> on your Windows PC.",
    webQrStep2: "2. Click <strong>📱 Link Phone</strong> in the top-right bar.",
    webQrStep3: "3. Scan the <strong>QR Code</strong> with your phone camera to log in automatically.",
    tabSlicer: "⚡ Elegoo Slicer",
    tabCredentials: "Email & Password",
    tabToken: "Cloud Token",
    labelRegion: "Server Region",
    regionIntl: "🌍 Europe / International (matrix.elegoo.com)",
    regionCn: "🇨🇳 China (matrix.elegoo.com.cn)",
    slicerTitle: "Elegoo Slicer Connection",
    btnAdoptSlicer: "✅ Use active Elegoo Slicer session",
    slicerPrivacyNote: "Everything stays <strong>100% local</strong> on your PC: no token or password is sent outside.",
    labelEmail: "Elegoo Account Email",
    placeholderEmail: "name@example.com",
    labelPassword: "Password",
    togglePasswordTitle: "Show/Hide",
    btnLoginSubmit: "Sign in to Elegoo Cloud",
    labelToken: "Elegoo Session Token",
    placeholderToken: "Paste your token...",
    btnTokenSubmit: "Sign in with Token",
    printerSelectTitle: "Printer",
    btnMobileQr: "Link Phone",
    btnMobileQrTitle: "Link Smartphone via QR Code",
    btnSlicerResync: "Relink Slicer",
    btnSlicerResyncTitle: "Relink Elegoo Slicer",
    btnLogout: "Log out",
    statusSynced: "Synced",
    panelInventory: "🗄️ Spool Archive",
    panelPrints: "🧾 Print History",
    filterAll: "All",
    filterCompleted: "Completed",
    filterStopped: "Stopped",
    modalSpoolSettings: "Spool Settings",
    labelSpoolName: "Spool Name / Brand",
    placeholderSpoolName: "e.g. Jayo PLA HS",
    labelSpoolMaterial: "Material",
    labelSpoolColor: "Color",
    labelInitialWeight: "Full Spool Weight (g)",
    labelRemainingWeight: "Remaining Weight (g)",
    btnCancel: "Cancel",
    btnSave: "Save",
    modalPrintTitle: "Adjust Print",
    labelPrintFile: "Print File",
    labelGcodeFile: "Load local .gcode file (optional, reads exact grams)",
    labelPrintStatus: "Status",
    optCompleted: "✅ Completed",
    optStopped: "🛑 Stopped mid-print",
    optInterrupted: "⚠️ Interrupted",
    labelSpoolUsed: "Spool Used",
    labelTotalSlicerGrams: "Slicer Total Weight (g)",
    labelCompletionPct: "% Completion",
    labelActualGrams: "Actual Filament Used (g)",
    modalQrTitle: "📱 Link Phone",
    qrCaption: "Scan this QR code with your smartphone camera to open your synced Web App immediately.",
    slicerWaitRunning: "Elegoo Slicer is open: log out and sign back in inside Elegoo Slicer, or click below to bring it to the front.",
    slicerWaitStarting: "Elegoo Slicer launched: finish signing in inside Elegoo Slicer and this app will import the token automatically!",
    slicerExpired: "Your Elegoo Slicer session expired. Click below to open Elegoo Slicer and sign in again.",
    slicerDefault: "Click the button below to open Elegoo Slicer and sign in: this app will read and save the local token without asking your password or disconnecting you.",
    btnReopenSlicer: "🔄 Bring Elegoo Slicer to Front",
    btnStartSlicer: "🔄 Launch Elegoo Slicer & Sign In",
    btnOpeningSlicer: "⏳ Opening Elegoo Slicer...",
    errInvalidQr: "Invalid or expired QR Code. Open Elegoo Filament App on your PC and scan a new QR Code.",
    errManualDisabledWeb: "Manual login is disabled on the Web App. Scan the QR Code from the PC app.",
    errCannotOpenSlicer: "Unable to launch Elegoo Slicer.",
    errStartSlicerBridge: "Error starting Elegoo Slicer bridge: {msg}",
    errInvalidSlicerSession: "Invalid Elegoo Slicer session.",
    errAdoptSlicer: "Error adopting Slicer session: {msg}",
    errRelinkSlicer: "Error relinking Elegoo Slicer: {msg}",
    errInvalidCredentials: "Invalid credentials.",
    errConnection: "Connection error: {msg}",
    errSessionExpired: "Session expired. Please sign in again or click Relink Slicer.",
    errSync: "Sync error: {msg}",
    errSaveServer: "Error saving data to server.",
    errNotLoggedInQr: "Please sign in to Elegoo Cloud first.",
    btnLoggingIn: "Signing in...",
    toastSyncedNewPrints: "Synced {count} new prints from Elegoo Cloud!",
    toastSyncedCloud: "Canvas and spools synced with Elegoo Cloud!",
    toastGcodeRead: "Read exact {grams} g from G-code file!",
    toastPrintRemoved: "Print removed and grams refunded.",
    toastSpoolSaved: "Weight and material saved!",
    toastPrintSaved: "Print saved and spool weight updated!",
    toastOpenPcApp: "Launch Elegoo_Filament_App.exe on Windows PC or paste your Cloud Token.",
    updatedAtTime: "Updated at {time}",
    btnEditWeightMat: "✏️ Weight & Material",
    emptyArchive: "No unmounted spools",
    badgeUnmounted: "Unmounted",
    badgeRemaining: "Left:",
    badgeOfWeight: "of {weight} g",
    emptyPrints: "No prints recorded",
    badgeCompleted: "Completed ({pct}%)",
    badgeStopped: "Stopped ({pct}%)",
    badgeInterrupted: "Interrupted ({pct}%)",
    btnAdjustPrint: "✏️ Adjust",
    modalEditSpool: "Edit Spool",
    modalAddSpool: "Add Unmounted Spool to Archive",
    slotSuffix: " — Slot A{slot}",
    archiveSuffix: " — Archive",
    archiveTag: "[Archive] ",
    confirmDeleteSpool: "Delete \"{name}\" from archive?",
    spoolDefaultName: "Spool",
    qrRequireLogin: "Please sign in first to generate the QR code.",
    qrNoGenerator: "QR generator unavailable.",
    btnDonate: "Buy me a coffee",
    btnDonateTitle: "Support Giulio Cantarelli on Ko-fi",
    btnMakerWorldTitle: "Giulio Cantarelli's 3D Models on MakerWorld",
    authorCredit: "Created by",
    btnDonateLink: "☕ Support on Ko-fi"
  }
};

function getCurrentLang() {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "it";
  } catch {
    return "it";
  }
}

function t(key, vars = null) {
  const lang = getCurrentLang();
  const dict = I18N[lang] || I18N.it;
  let str = dict[key] !== undefined ? dict[key] : (I18N.it[key] || key);
  if (vars && typeof vars === "object") {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

function applyLanguage(lang, persist = true) {
  const cleanLang = lang === "en" ? "en" : "it";
  if (persist) {
    try { localStorage.setItem(LANG_STORAGE_KEY, cleanLang); } catch {}
  }
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = cleanLang;
  }

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (k) el.textContent = t(k);
  });
  document.querySelectorAll("[data-i18n-html]").forEach(el => {
    const k = el.getAttribute("data-i18n-html");
    if (k) el.innerHTML = t(k);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const k = el.getAttribute("data-i18n-placeholder");
    if (k) el.setAttribute("placeholder", t(k));
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const k = el.getAttribute("data-i18n-title");
    if (k) el.setAttribute("title", t(k));
  });

  const toggleText = cleanLang === "en" ? "🌐 EN" : "🌐 IT";
  const toggleTitle = cleanLang === "en" ? "Switch to Italian" : "Switch to English";
  ["btn-lang-toggle", "btn-lang-toggle-login"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.textContent = toggleText;
      btn.title = toggleTitle;
    }
  });

  if (lastSlicerStatusData) {
    updateSlicerStatusUi(lastSlicerStatusData);
  }
  if (state.auth && state.auth.loggedIn) {
    renderAll();
  }
}

function normalizeRemoteBaseUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  let clean = raw.split("#")[0].split("?")[0].replace(/\/+$/, "");
  if (!clean) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(clean)) {
    clean = "https://" + clean;
  }
  return /^https?:\/\//i.test(clean) ? clean : "";
}

function getConfiguredRemoteSyncUrl() {
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!isLocalhost) return "";
  try {
    const stored = localStorage.getItem(MOBILE_APP_URL_STORAGE_KEY);
    const normalized = normalizeRemoteBaseUrl(stored || DEFAULT_CLOUD_APP_URL);
    if (!normalized) return "";
    const parsed = new URL(normalized);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return "";
    return normalized;
  } catch {
    return DEFAULT_CLOUD_APP_URL;
  }
}

const BOOT_SPLASH_START_MS = Date.now();
let bootSplashHidden = false;

async function hideBootSplash(minDurationMs = 550) {
  if (bootSplashHidden) return;
  bootSplashHidden = true;
  const splash = document.getElementById("boot-splash");
  if (!splash || splash.classList.contains("hidden")) return;
  const elapsed = Date.now() - BOOT_SPLASH_START_MS;
  const waitMs = Math.max(0, minDurationMs - elapsed);
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  splash.classList.add("fade-out");
  setTimeout(() => {
    splash.classList.add("hidden");
  }, 280);
}

function buildMobilePairingUrl() {
  const token = String(state.auth.token || "").trim();
  const region = state.auth.region === "cn" ? "cn" : "intl";
  const inp = document.getElementById("mobile-qr-base-url");
  let clean = normalizeRemoteBaseUrl(inp ? inp.value : "");
  if (!clean) {
    try {
      clean = normalizeRemoteBaseUrl(localStorage.getItem(MOBILE_APP_URL_STORAGE_KEY));
    } catch {}
  }

  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!clean && !isLocalhost && /^https?:/i.test(window.location.protocol)) {
    clean = window.location.origin;
  }
  if (!clean) {
    clean = normalizeRemoteBaseUrl(DEFAULT_CLOUD_APP_URL);
  }

  if (clean) {
    return `${clean}/#token=${encodeURIComponent(token)}&region=${encodeURIComponent(region)}`;
  }

  return `elegoo-cc2://pair?token=${encodeURIComponent(token)}&region=${encodeURIComponent(region)}`;
}

function renderMobileQrModal() {
  const wrap = document.getElementById("mobile-qr-svg-wrap");
  if (!wrap) return;
  if (!state.auth.token) {
    wrap.innerHTML = `<p style="color:#0b0e14;font-size:0.85rem;padding:12px;">${escapeHtml(t("qrRequireLogin"))}</p>`;
    return;
  }
  const pairUrl = buildMobilePairingUrl();
  try {
    if (typeof window.generateQrSvg === "function") {
      wrap.innerHTML = window.generateQrSvg(pairUrl, 224);
    } else {
      wrap.innerHTML = `<p style="color:#0b0e14;font-size:0.85rem;padding:12px;">${escapeHtml(t("qrNoGenerator"))}</p>`;
    }
  } catch (err) {
    wrap.innerHTML = `<p style="color:#b91c1c;font-size:0.82rem;padding:12px;">${escapeHtml(err.message || String(err))}</p>`;
  }
}

function refreshOpenMobileQrModal() {
  const modal = document.getElementById("modal-mobile-qr");
  if (modal && !modal.classList.contains("hidden")) {
    renderMobileQrModal();
  }
}

function getSavedBrowserSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveBrowserSession(authObj) {
  try {
    if (authObj && authObj.loggedIn && authObj.token) {
      const key = String(authObj.user?.email || authObj.email || authObj.user?.id || authObj.token).trim().toLowerCase();
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        accountKey: key,
        email: authObj.user?.email || authObj.email || "",
        region: authObj.region || "intl",
        token: authObj.token,
        refreshToken: authObj.refreshToken || "",
        user: authObj.user || null
      }));
      refreshOpenMobileQrModal();
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {}
}

function getActiveAccountKey() {
  if (state.auth && state.auth.loggedIn) {
    const k = String(state.auth.user?.email || state.auth.email || state.auth.user?.id || state.auth.token || "").trim().toLowerCase();
    if (k && k !== "token cloud") return k;
  }
  const s = getSavedBrowserSession();
  if (s && s.accountKey) return s.accountKey;
  return String(state.auth?.token || "").trim().toLowerCase();
}

// ============================================================================
// INITIALIZATION & PERSISTENCE
// ============================================================================
let syncIntervalId = null;
let slicerPollIntervalId = null;

function activateLoginTab(mode) {
  document.querySelectorAll(".login-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === mode);
  });
  const fCred = document.getElementById("login-form-credentials");
  const fTok = document.getElementById("login-form-token");
  const fSlicer = document.getElementById("login-form-slicer");
  const regionGroup = document.getElementById("login-region-group");
  if (fCred) fCred.classList.toggle("hidden", mode !== "credentials");
  if (fTok) fTok.classList.toggle("hidden", mode !== "token");
  if (fSlicer) fSlicer.classList.toggle("hidden", mode !== "slicer");
  if (regionGroup) regionGroup.classList.toggle("hidden", mode === "slicer");
}

function updateSlicerStatusUi(slicerData) {
  if (slicerData) lastSlicerStatusData = slicerData;
  const box = document.getElementById("slicer-sync-status-text");
  const btn = document.getElementById("btn-slicer-force-relogin");
  const adoptBtn = document.getElementById("btn-slicer-adopt-current");
  if (!box || !btn || !slicerData) return;

  if (adoptBtn) {
    adoptBtn.classList.toggle("hidden", !slicerData.hasCurrentValidToken);
  }

  if (slicerData.waitingForFreshLogin) {
    box.textContent = slicerData.slicerRunning
      ? t("slicerWaitRunning")
      : t("slicerWaitStarting");
    btn.disabled = false;
    btn.textContent = t("btnReopenSlicer");
  } else if (slicerData.reason === "expired") {
    box.textContent = t("slicerExpired");
    btn.disabled = false;
    btn.textContent = t("btnStartSlicer");
  } else {
    box.textContent = t("slicerDefault");
    btn.disabled = false;
    btn.textContent = t("btnStartSlicer");
  }
}

async function applySlicerAuthAndOpen(slicerData, showFeedback = false) {
  state.auth = {
    loggedIn: true,
    region: slicerData.region || "intl",
    email: slicerData.user?.email || slicerData.user?.nickname || "Elegoo Slicer",
    token: slicerData.token,
    refreshToken: slicerData.refreshToken || "",
    user: slicerData.user || null
  };
  saveBrowserSession(state.auth);
  await loadPersistentState();
  showDashboardView();
  const resyncBtn = document.getElementById("btn-slicer-resync");
  if (resyncBtn) resyncBtn.classList.remove("hidden");
  renderAll();
  await syncWithElegooCloud(showFeedback);
  startAutoSyncTimer();
}

function pollSlicerRelogin() {
  if (slicerPollIntervalId) clearInterval(slicerPollIntervalId);
  slicerPollIntervalId = setInterval(async () => {
    try {
      const resp = await fetch("/api/slicer/status", { cache: "no-store" });
      if (!resp.ok) return;
      const slicerData = await resp.json();
      updateSlicerStatusUi(slicerData);
      if (slicerData.paired && slicerData.token) {
        clearInterval(slicerPollIntervalId);
        slicerPollIntervalId = null;
        await applySlicerAuthAndOpen(slicerData, true);
      }
    } catch {}
  }, 2000);
}

function applyWebAppQrOnlyLockUi(errorMessage = "") {
  const notice = document.getElementById("web-qr-only-notice");
  const tabs = document.querySelector(".login-tabs");
  const fCred = document.getElementById("login-form-credentials");
  const fTok = document.getElementById("login-form-token");
  const fSlicer = document.getElementById("login-form-slicer");
  const regionGroup = document.getElementById("login-region-group");
  const errBox = document.getElementById("login-error-box");
  const webErr = document.getElementById("web-qr-error-msg");

  if (tabs) tabs.classList.add("hidden");
  if (fCred) fCred.classList.add("hidden");
  if (fTok) fTok.classList.add("hidden");
  if (fSlicer) fSlicer.classList.add("hidden");
  if (regionGroup) regionGroup.classList.add("hidden");
  if (errBox) errBox.classList.add("hidden");
  if (notice) notice.classList.remove("hidden");

  if (webErr) {
    if (errorMessage) {
      webErr.textContent = errorMessage;
      webErr.classList.remove("hidden");
    } else {
      webErr.textContent = "";
      webErr.classList.add("hidden");
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  localStorage.removeItem("elegoo_cc2_filament_db");

  bindEvents();
  applyLanguage(getCurrentLang(), false);

  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocalhost) {
    try {
      const infoResp = await fetch("/api/info", { cache: "no-store" });
      if (infoResp.ok) {
        const infoData = await infoResp.json();
        if (infoData && infoData.cloudAppUrl) {
          DEFAULT_CLOUD_APP_URL = normalizeRemoteBaseUrl(infoData.cloudAppUrl);
        }
      }
    } catch {}
  } else {
    applyWebAppQrOnlyLockUi();
  }

  try {
    try {
      const hashStr = String(window.location.hash || "").replace(/^#/, "");
      const hashParams = new URLSearchParams(hashStr);
      const queryParams = new URLSearchParams(window.location.search);
      const urlToken = String(hashParams.get("token") || queryParams.get("token") || "").trim();
      const rawUrlRegion = String(hashParams.get("region") || queryParams.get("region") || "intl").trim().toLowerCase();
      const urlRegion = rawUrlRegion === "cn" ? "cn" : "intl";
      if (/^[a-f0-9]{32}$/i.test(urlToken)) {
        if (window.history && typeof window.history.replaceState === "function") {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        state.auth = {
          loggedIn: true,
          region: urlRegion,
          email: "Token Cloud",
          token: urlToken,
          refreshToken: "",
          user: null
        };
        let tokenVerified = false;
        try {
          const accResp = await cloudProxyRequest("/api/v1/account-center-server/account-info/account", "GET");
          if (accResp && (accResp.code === 0 || accResp.code === 200 || !accResp.code) && accResp.data && (accResp.data.email || accResp.data.id)) {
            state.auth.user = accResp.data;
            state.auth.email = accResp.data.email || accResp.data.nickname || "Elegoo Cloud";
            tokenVerified = true;
          }
        } catch {}
        if (!isLocalhost && !tokenVerified) {
          state.auth.loggedIn = false;
          state.auth.token = "";
          saveBrowserSession(null);
          localStorage.removeItem(QR_PAIRED_STORAGE_KEY);
          applyWebAppQrOnlyLockUi(t("errInvalidQr"));
          showLoginView();
          return;
        }
        localStorage.setItem(QR_PAIRED_STORAGE_KEY, "1");
        if (isLocalhost) {
          const resyncBtn = document.getElementById("btn-slicer-resync");
          if (resyncBtn) resyncBtn.classList.remove("hidden");
        }
        saveBrowserSession(state.auth);
        await loadPersistentState();
        renderAll();
        await syncWithElegooCloud(false);
        showDashboardView();
        startAutoSyncTimer();
        return;
      }
    } catch {}

    const browserSession = getSavedBrowserSession();
    const isQrPaired = localStorage.getItem(QR_PAIRED_STORAGE_KEY) === "1";
    if (!isLocalhost && !isQrPaired) {
      saveBrowserSession(null);
    }
    if (browserSession && browserSession.token && (isLocalhost || isQrPaired)) {
      state.auth = {
        loggedIn: true,
        region: browserSession.region || "intl",
        email: browserSession.email || "",
        token: browserSession.token,
        refreshToken: browserSession.refreshToken || "",
        user: browserSession.user || null
      };
      if (isLocalhost) {
        const resyncBtn = document.getElementById("btn-slicer-resync");
        if (resyncBtn) resyncBtn.classList.remove("hidden");
        try {
          const slicerResp = await fetch("/api/slicer/status", { cache: "no-store" });
          if (slicerResp.ok) {
            const slicerData = await slicerResp.json();
            if (slicerData && slicerData.paired && slicerData.token) {
              state.auth = {
                loggedIn: true,
                region: slicerData.region || state.auth.region || "intl",
                email: slicerData.user?.email || slicerData.user?.nickname || state.auth.email || "Elegoo Slicer",
                token: slicerData.token,
                refreshToken: slicerData.refreshToken || state.auth.refreshToken || "",
                user: slicerData.user || state.auth.user || null
              };
              saveBrowserSession(state.auth);
            }
          }
        } catch {}
      }
      await loadPersistentState();
      renderAll();
      await syncWithElegooCloud(false);
      showDashboardView();
      startAutoSyncTimer();
      return;
    }

    if (isLocalhost) {
      try {
        const slicerResp = await fetch("/api/slicer/status", { cache: "no-store" });
        if (slicerResp.ok) {
          const slicerData = await slicerResp.json();
          if (slicerData && slicerData.paired && slicerData.token) {
            await applySlicerAuthAndOpen(slicerData, false);
            return;
          }
          if (slicerData && slicerData.available && slicerData.needsForcedRelogin) {
            activateLoginTab("slicer");
            updateSlicerStatusUi(slicerData);
            showLoginView();
            if (slicerData.waitingForFreshLogin) {
              pollSlicerRelogin();
            }
            return;
          }
        }
      } catch {}

      await loadPersistentState();
      if (state.auth.loggedIn && state.auth.token) {
        saveBrowserSession(state.auth);
        const resyncBtn = document.getElementById("btn-slicer-resync");
        if (resyncBtn) resyncBtn.classList.remove("hidden");
        renderAll();
        await syncWithElegooCloud(false);
        showDashboardView();
        startAutoSyncTimer();
        return;
      }
    } else {
      applyWebAppQrOnlyLockUi();
    }

    showLoginView();
  } finally {
    await hideBootSplash();
  }
});

function startAutoSyncTimer() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  syncIntervalId = setInterval(() => {
    if (state.auth.loggedIn && state.auth.token && (isLocalhost || !document.hidden)) {
      syncWithElegooCloud(false);
    }
  }, 10000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.auth.loggedIn && state.auth.token) {
    syncWithElegooCloud(false);
  }
});

window.addEventListener("focus", () => {
  if (state.auth.loggedIn && state.auth.token) {
    syncWithElegooCloud(false);
  }
});

let isSavingState = false;
let isSyncingCloud = false;

function isAnyModalOpen() {
  const mSpool = document.getElementById("modal-spool");
  const mPrint = document.getElementById("modal-print");
  const mQr = document.getElementById("modal-mobile-qr");
  return (mSpool && !mSpool.classList.contains("hidden")) ||
         (mPrint && !mPrint.classList.contains("hidden")) ||
         (mQr && !mQr.classList.contains("hidden"));
}

function applyLoadedDbData(data) {
  if (!data || data.empty) return;
  if (Array.isArray(data.spools) && data.spools.length > 0) state.spools = data.spools;
  if (Array.isArray(data.prints)) state.prints = data.prints;
  state.fileMetaCache = (data.fileMetaCache && typeof data.fileMetaCache === "object") ? data.fileMetaCache : {};
  state.liveSnapshotsByFile = (data.liveSnapshotsByFile && typeof data.liveSnapshotsByFile === "object") ? data.liveSnapshotsByFile : {};
  if (Array.isArray(data.ignoredCloudTaskIds)) {
    const merged = new Set([...DEFAULT_IGNORED_OLD_TASK_IDS, ...data.ignoredCloudTaskIds.map(String)]);
    state.ignoredCloudTaskIds = Array.from(merged);
  }
  if (Array.isArray(data.manuallyDeletedTaskIds)) {
    state.manuallyDeletedTaskIds = Array.from(new Set(data.manuallyDeletedTaskIds.map(String)));
  }
  if (data.lastActiveSlot) {
    state.lastActiveSlot = Number(data.lastActiveSlot);
    state.lastActiveSlotAt = Number(data.lastActiveSlotAt || 0);
  }
  if (data.updatedAt) {
    state.updatedAt = Number(data.updatedAt);
  }
  if (data.auth && data.auth.loggedIn) {
    // Adopt fresher server token if present so all devices stay synced on one Elegoo token
    const currentToken = data.auth.token || state.auth.token;
    state.auth = { ...data.auth, token: currentToken };
    saveBrowserSession(state.auth);
  }
  if (data.selectedPrinterSn) {
    state.selectedPrinterSn = data.selectedPrinterSn;
  }
}

function buildPersistentPayload(updatedAtMs = Date.now()) {
  return {
    accountKey: getActiveAccountKey(),
    auth: state.auth,
    selectedPrinterSn: state.selectedPrinterSn,
    spools: state.spools,
    prints: state.prints,
    fileMetaCache: state.fileMetaCache,
    liveSnapshotsByFile: state.liveSnapshotsByFile,
    ignoredCloudTaskIds: state.ignoredCloudTaskIds,
    manuallyDeletedTaskIds: state.manuallyDeletedTaskIds,
    lastActiveSlot: state.lastActiveSlot,
    lastActiveSlotAt: state.lastActiveSlotAt,
    baseUpdatedAt: state.updatedAt || 0,
    updatedAt: updatedAtMs
  };
}

async function postDbPayload(url, accountKey, payload) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Account-Key": accountKey,
      "X-Elegoo-Token": state.auth.token || ""
    },
    body: JSON.stringify(payload)
  });
}

async function loadPersistentState() {
  try {
    const accountKey = getActiveAccountKey();
    const headers = {};
    if (accountKey) headers["X-Account-Key"] = accountKey;
    if (state.auth.token) headers["X-Elegoo-Token"] = state.auth.token;

    let localData = null;
    const resp = await fetch(`/api/data?account=${encodeURIComponent(accountKey)}`, {
      headers,
      cache: "no-store"
    });
    if (resp.ok) {
      localData = await resp.json();
      if (localData && !localData.empty) {
        applyLoadedDbData(localData);
      }
    }

    const remoteBase = getConfiguredRemoteSyncUrl();
    if (remoteBase && state.auth.token && accountKey) {
      try {
        const rResp = await fetch(`${remoteBase}/api/data?account=${encodeURIComponent(accountKey)}`, {
          headers,
          cache: "no-store"
        });
        if (rResp.ok) {
          const remoteData = await rResp.json();
          const localUpdated = Number((localData && !localData.empty && localData.updatedAt) || state.updatedAt || 0);
          const remoteUpdated = Number((remoteData && !remoteData.empty && remoteData.updatedAt) || 0);

          if (remoteData && !remoteData.empty && remoteUpdated > localUpdated) {
            const preservedAuth = state.auth && state.auth.token ? { ...state.auth } : null;
            applyLoadedDbData(remoteData);
            if (preservedAuth) {
              state.auth = preservedAuth;
              saveBrowserSession(state.auth);
            }
            state.updatedAt = remoteUpdated;
            await postDbPayload(`/api/data?account=${encodeURIComponent(accountKey)}`, accountKey, buildPersistentPayload(remoteUpdated));
          } else if (
            (!remoteData || remoteData.empty || localUpdated > remoteUpdated) &&
            (state.spools.length > 0 || state.prints.length > 0)
          ) {
            const pushTs = localUpdated || Date.now();
            postDbPayload(
              `${remoteBase}/api/data?account=${encodeURIComponent(accountKey)}`,
              accountKey,
              buildPersistentPayload(pushTs)
            ).catch(() => {});
          }
        }
      } catch (remoteErr) {
        console.warn("Sync DB remoto non riuscito:", remoteErr);
      }
    }
  } catch (e) {
    console.warn("Errore caricamento DB:", e);
  }
}

async function savePersistentState() {
  isSavingState = true;
  const accountKey = getActiveAccountKey();
  const now = Date.now();
  const payload = buildPersistentPayload(now);

  try {
    const resp = await postDbPayload(`/api/data?account=${encodeURIComponent(accountKey)}`, accountKey, payload);
    if (resp.ok) {
      state.updatedAt = now;
      const remoteBase = getConfiguredRemoteSyncUrl();
      if (remoteBase && state.auth.token && accountKey) {
        postDbPayload(`${remoteBase}/api/data?account=${encodeURIComponent(accountKey)}`, accountKey, payload).catch(() => {});
      }
    }
    return resp.ok;
  } catch (e) {
    console.warn("Salvataggio DB non riuscito:", e);
    return false;
  } finally {
    isSavingState = false;
  }
}

// ============================================================================
// UI NAVIGATION & TOASTS
// ============================================================================
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "success" ? "✅" : type === "error" ? "⚠️" : "💡";
  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.25s ease";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function showLoginView() {
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("app-view").classList.add("hidden");
}

function showDashboardView() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");

  const accLabel = document.getElementById("user-account-label");
  const userDisplay = state.auth.user?.nickname || state.auth.user?.email || state.auth.email || "Elegoo Cloud";
  accLabel.textContent = userDisplay;
}

// ============================================================================
// ELEGOO CLOUD SYNC & REPORT DATA PARSER
// ============================================================================
async function cloudProxyRequest(endpoint, method = "GET", body = null) {
  const resp = await fetch("/api/cloud/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      region: state.auth.region,
      token: state.auth.token,
      accountKey: getActiveAccountKey(),
      endpoint,
      method,
      body
    })
  });
  const data = await resp.json();
  if (data && data._refreshedToken && data._refreshedToken !== state.auth.token) {
    state.auth.token = data._refreshedToken;
    saveBrowserSession(state.auth);
    delete data._refreshedToken;
  }
  return data;
}

function normalizeColorHex(rawColor) {
  if (!rawColor) return "#3A7BD5";
  let c = String(rawColor).trim();
  if (c.startsWith("0x") || c.startsWith("0X")) c = "#" + c.slice(2);
  if (!c.startsWith("#")) c = "#" + c;
  if (c.length >= 7) return c.slice(0, 7).toUpperCase();
  return "#3A7BD5";
}

function parseHexToRgb(hex) {
  const norm = normalizeColorHex(hex);
  if (!norm || norm.length !== 7) return null;
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16)
  };
}

function getColorLabel(hex) {
  const norm = normalizeColorHex(hex);
  if (COLOR_NAMES_IT[norm]) return COLOR_NAMES_IT[norm];
  const rgb = parseHexToRgb(norm);
  if (!rgb) return norm;
  const { r, g, b } = rgb;
  if (r > 225 && g > 225 && b > 225) return "Bianco";
  if (r < 38 && g < 38 && b < 38) return "Nero";
  if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) return "Grigio";
  if (r > 180 && g < 85 && b < 85) return "Rosso";
  if (r > 200 && g > 170 && b < 70) return "Giallo";
  if (r > 200 && g > 95 && b < 60) return "Arancione";
  if (g > 150 && r < 100 && b < 110) return "Verde";
  if (b > 160 && r < 95) return "Blu";
  return norm;
}

function areColorsEquivalentOnCanvas(hexA, hexB) {
  const a = normalizeColorHex(hexA);
  const b = normalizeColorHex(hexB);
  if (a === b) return true;
  const labelA = getColorLabel(a);
  const labelB = getColorLabel(b);
  if (!labelA.startsWith("#") && !labelB.startsWith("#") && labelA === labelB) return true;
  const rgbA = parseHexToRgb(a);
  const rgbB = parseHexToRgb(b);
  if (!rgbA || !rgbB) return false;
  const dist = Math.sqrt(
    Math.pow(rgbA.r - rgbB.r, 2) +
    Math.pow(rgbA.g - rgbB.g, 2) +
    Math.pow(rgbA.b - rgbB.b, 2)
  );
  return dist < 60;
}

/**
 * Unpacks Elegoo Cloud report-data/list structure where each section (e.g. canvas_info, print_status)
 * is an array of { reportLinkKey, reportValue }
 */
function unpackCloudReportData(rawData) {
  if (!rawData || typeof rawData !== "object") return {};
  const result = {};

  for (const [key, val] of Object.entries(rawData)) {
    if (Array.isArray(val)) {
      const subObj = {};
      for (const item of val) {
        const linkKey = item?.reportLinkKey;
        const rawVal = item?.reportValue;
        if (!linkKey) continue;
        if (typeof rawVal === "string") {
          const trimmed = rawVal.trim();
          if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
              subObj[linkKey] = JSON.parse(trimmed);
              continue;
            } catch {}
          }
        }
        subObj[linkKey] = rawVal;
      }
      result[key] = subObj;
    } else if (typeof val === "string") {
      try { result[key] = JSON.parse(val); } catch { result[key] = val; }
    } else {
      result[key] = val;
    }
  }
  return result;
}

function ensureFourCanvasSlotsExist() {
  const defaultColors = ["#FFFFFF", "#898989", "#F72221", "#000000"];
  for (let slotNum = 1; slotNum <= 4; slotNum++) {
    const exists = state.spools.some(s => Number(s.slot) === slotNum);
    if (!exists) {
      const col = defaultColors[slotNum - 1];
      state.spools.push({
        id: `spool-slot-${slotNum}`,
        name: `PLA ${getColorLabel(col)}`,
        material: "PLA",
        color: col,
        initialWeight: 1000,
        remainingWeight: 1000,
        slot: slotNum,
        createdAt: Date.now()
      });
    }
  }
}

/**
 * Synchronizes the 4 Canvas slots with the printer's live Canvas report.
 * If a spool in a slot is unmounted or changed to another color/material on the printer,
 * the previous spool is automatically moved to Archivio Bobine (slot = 0) keeping its remaining grams,
 * and the new spool (or a matching spool from Archivio) is mounted in the Canvas slot.
 */
function syncCanvasSlotsFromCloudReport(rawReportData) {
  const unpacked = unpackCloudReportData(rawReportData);
  const machineStatus = unpacked.machine_status;
  const printStatus = unpacked.print_status;
  const canvasInfo = unpacked.canvas_info;

  let activeTrayZeroIdx = -1;
  if (canvasInfo && canvasInfo.active_tray_id !== undefined && canvasInfo.active_tray_id !== "") {
    activeTrayZeroIdx = Number(canvasInfo.active_tray_id);
  }
  const activeSlot = activeTrayZeroIdx >= 0 && activeTrayZeroIdx <= 3 ? activeTrayZeroIdx + 1 : null;
  if (activeSlot) {
    state.lastActiveSlot = activeSlot;
    state.lastActiveSlotAt = Date.now();
  }

  // Track live printing progress and active Canvas slot
  const fileCreateTime = String(printStatus?.file_create_time || "").trim();
  const printDuration = Number(printStatus?.print_duration || 0);
  if (printStatus && printStatus.filename) {
    const fn = String(printStatus.filename).trim();
    const baseFn = fn.split("/").pop().split("\\").pop();
    if (fn) {
      const prevSnap = state.liveSnapshotsByFile[fn] || state.liveSnapshotsByFile[normalizeFileKey(baseFn)] || {};
      const prog = Number(machineStatus?.progress ?? prevSnap.progress ?? 0);
      const snap = {
        progress: prog > 0 && prog < 100 ? Math.max(prog, prevSnap.progress || 0) : (prevSnap.progress || 0),
        currentLayer: Math.max(Number(printStatus.current_layer || 0), prevSnap.currentLayer || 0),
        totalLayer: Number(printStatus.total_layer || prevSnap.totalLayer || 0),
        printDuration: Math.max(printDuration, prevSnap.printDuration || 0),
        activeSlot: activeSlot || prevSnap.activeSlot || undefined,
        updatedAt: Date.now()
      };
      state.liveSnapshotsByFile[fn] = snap;
      state.liveSnapshotsByFile[normalizeFileKey(baseFn)] = snap;
      if (fileCreateTime && fileCreateTime !== "0") {
        state.liveSnapshotsByFile["ctime:" + fileCreateTime] = snap;
      }
    }
  } else if (fileCreateTime && fileCreateTime !== "0" && (printDuration > 0 || activeSlot)) {
    const ckey = "ctime:" + fileCreateTime;
    const prevSnap = state.liveSnapshotsByFile[ckey] || {};
    const prog = Number(machineStatus?.progress ?? prevSnap.progress ?? 0);
    state.liveSnapshotsByFile[ckey] = {
      progress: prog > 0 && prog < 100 ? Math.max(prog, prevSnap.progress || 0) : (prevSnap.progress || 0),
      currentLayer: Math.max(Number(printStatus?.current_layer || 0), prevSnap.currentLayer || 0),
      totalLayer: Number(printStatus?.total_layer || prevSnap.totalLayer || 0),
      printDuration: Math.max(printDuration, prevSnap.printDuration || 0),
      activeSlot: activeSlot || prevSnap.activeSlot || undefined,
      updatedAt: Date.now()
    };
  }

  ensureFourCanvasSlotsExist();

  if (!canvasInfo) return;

  let trays = [];
  if (Array.isArray(canvasInfo.canvas_list)) {
    for (const unit of canvasInfo.canvas_list) {
      if (Array.isArray(unit.tray_list)) {
        trays.push(...unit.tray_list);
      }
    }
  } else if (Array.isArray(canvasInfo.tray_list)) {
    trays = canvasInfo.tray_list;
  }

  if (trays.length === 0) return;

  const isZeroIndexed = trays.some(t => Number(t.tray_id ?? t.trayId) === 0);

  let canvasChanged = false;

  trays.forEach((tray, idx) => {
    const rawId = tray.tray_id ?? tray.trayId;
    const slotNum = rawId !== undefined
      ? (isZeroIndexed ? Number(rawId) + 1 : Number(rawId))
      : (idx + 1);

    if (slotNum < 1 || slotNum > 4) return;

    let currentSlotSpool = state.spools.find(s => Number(s.slot) === slotNum);

    // If the physical slot on the Canvas was emptied (status === 0 and no color)
    const trayStatus = tray.status !== undefined ? Number(tray.status) : 1;
    const rawColorStr = String(tray.filament_color || tray.color || "").trim();

    if (trayStatus === 0 && !rawColorStr) {
      if (currentSlotSpool) {
        currentSlotSpool.slot = 0;
        currentSlotSpool.unmountedAt = Date.now();
        canvasChanged = true;
      }
      return;
    }

    if (!rawColorStr) return;

    const cloudColor = normalizeColorHex(rawColorStr);
    const cloudMat = String(tray.filament_type || tray.material || "PLA").trim();

    if (currentSlotSpool) {
      const prevCloudColor = normalizeColorHex(currentSlotSpool.cloudColor || currentSlotSpool.color);
      const isPlaceholder = prevCloudColor === "#3A7BD5";
      const colorChanged = !isPlaceholder && !areColorsEquivalentOnCanvas(prevCloudColor, cloudColor);

      if (colorChanged) {
        // 1. Move the old spool from the Canvas slot into the Archive (slot = 0), keeping its weights!
        currentSlotSpool.slot = 0;
        currentSlotSpool.unmountedAt = Date.now();

        // 2. Check if there is already an unmounted spool in the Archive with this new color
        const archivedMatch = state.spools.find(
          s => (!s.slot || Number(s.slot) === 0) &&
               s.id !== currentSlotSpool.id &&
               areColorsEquivalentOnCanvas(s.color, cloudColor)
        );

        if (archivedMatch) {
          archivedMatch.slot = slotNum;
          archivedMatch.color = cloudColor;
          archivedMatch.cloudColor = cloudColor;
        } else {
          state.spools.push({
            id: `spool-slot-${slotNum}-${Date.now()}`,
            name: `${cloudMat} ${getColorLabel(cloudColor)}`,
            material: cloudMat,
            color: cloudColor,
            cloudColor: cloudColor,
            initialWeight: 1000,
            remainingWeight: 1000,
            slot: slotNum,
            createdAt: Date.now()
          });
        }
        canvasChanged = true;
      } else {
        // Same spool in this slot: keep user's edited weight & material intact!
        if (currentSlotSpool.cloudColor !== cloudColor) {
          currentSlotSpool.cloudColor = cloudColor;
          if (!currentSlotSpool.userEdited) {
            currentSlotSpool.color = cloudColor;
          }
          canvasChanged = true;
        }
        if (isPlaceholder || !currentSlotSpool.userEdited) {
          if (currentSlotSpool.material !== cloudMat) {
            currentSlotSpool.material = cloudMat;
            canvasChanged = true;
          }
          const autoName = `${cloudMat} ${getColorLabel(cloudColor)}`;
          if (currentSlotSpool.name !== autoName) {
            currentSlotSpool.name = autoName;
            canvasChanged = true;
          }
        }
      }
    } else {
      // Slot was empty: check Archive for a matching spool or create a new one
      const archivedMatch = state.spools.find(
        s => (!s.slot || Number(s.slot) === 0) && areColorsEquivalentOnCanvas(s.color, cloudColor)
      );

      if (archivedMatch) {
        archivedMatch.slot = slotNum;
        archivedMatch.color = cloudColor;
        archivedMatch.cloudColor = cloudColor;
      } else {
        state.spools.push({
          id: `spool-slot-${slotNum}-${Date.now()}`,
          name: `${cloudMat} ${getColorLabel(cloudColor)}`,
          material: cloudMat,
          color: cloudColor,
          cloudColor: cloudColor,
          initialWeight: 1000,
          remainingWeight: 1000,
          slot: slotNum,
          createdAt: Date.now()
        });
      }
      canvasChanged = true;
    }
  });

  return canvasChanged;
}

function normalizeFileKey(name) {
  return String(name || "").trim().replace(/^\/+/, "").toLowerCase();
}

function cachePrinterFileMeta(f) {
  if (!f || !f.filename) return;
  const baseOnly = f.filename.split("/").pop().split("\\").pop();
  const entry = {
    filename: baseOnly,
    fullFilename: f.filename,
    totalFilamentUsed: Number(f.totalFilamentUsed ?? f.filamentUsed ?? 0),
    totalFilamentUsedLength: Number(f.totalFilamentUsedLength ?? 0),
    printTime: Number(f.printTime || 0),
    layer: Number(f.layer || 0),
    createTime: Number(f.createTime || 0),
    colorMap: f.colorMap || null,
    cachedAt: Date.now()
  };
  state.fileMetaCache[f.filename] = entry;
  state.fileMetaCache[normalizeFileKey(f.filename)] = entry;
  state.fileMetaCache[normalizeFileKey(baseOnly)] = entry;
  if (entry.createTime > 0) {
    state.fileMetaCache["ctime:" + entry.createTime] = entry;
    state.fileMetaCache["ctime:" + Math.floor(entry.createTime / 1000)] = entry;
  }
}

function getLiveSnapshotForTask(filename, baseFilename, ev = null) {
  const snaps = state.liveSnapshotsByFile || {};
  return (
    snaps[filename] ||
    snaps[baseFilename] ||
    snaps[normalizeFileKey(baseFilename)] ||
    (ev?.file_create_time ? snaps["ctime:" + ev.file_create_time] : null) ||
    null
  );
}

function findCachedFileMeta(filename, baseFilename, ev = null) {
  const cache = state.fileMetaCache || {};
  const direct =
    cache[filename] ||
    cache[normalizeFileKey(filename)] ||
    cache[normalizeFileKey(baseFilename)] ||
    (ev?.file_create_time ? cache["ctime:" + ev.file_create_time] : null);
  if (direct) return direct;

  const targetKey = normalizeFileKey(baseFilename);
  for (const [k, v] of Object.entries(cache)) {
    if (v && (normalizeFileKey(k) === targetKey || normalizeFileKey(v.filename) === targetKey)) {
      return v;
    }
  }
  return null;
}

function parseSlicerTimeSecFromFilename(filename) {
  const match = String(filename || "").match(/_(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?\.gcode$/i);
  if (!match) return 0;
  const d = Number(match[1] || 0);
  const h = Number(match[2] || 0);
  const m = Number(match[3] || 0);
  const s = Number(match[4] || 0);
  const total = d * 86400 + h * 3600 + m * 60 + s;
  return total > 0 ? total : 0;
}

function parseLayerHeightFromFilename(filename) {
  const match = String(filename || "").match(/_(0\.\d+)_(?:\d+h|\d+m|\d+s)/i);
  if (!match) return 0.2;
  const lh = parseFloat(match[1]);
  return lh > 0 && lh <= 1.0 ? lh : 0.2;
}

function resolveSlotForPrint(fileMeta, filename, ev = null) {
  const baseFilename = String(filename || "").split("/").pop().split("\\").pop();
  const snap = getLiveSnapshotForTask(filename, baseFilename, ev);

  // 1. Check live snapshot if captured during printing and no colorMap overrides it
  if (snap && snap.activeSlot >= 1 && snap.activeSlot <= 4 && !fileMeta?.colorMap) {
    return Number(snap.activeSlot);
  }

  // 2. Check colorMap from Elegoo Slicer / printer file metadata
  if (fileMeta && fileMeta.colorMap) {
    try {
      const cmap = typeof fileMeta.colorMap === "string" ? JSON.parse(fileMeta.colorMap) : fileMeta.colorMap;
      if (Array.isArray(cmap) && cmap.length > 0) {
        const tRaw = cmap[0].t;
        const tSlot = tRaw !== undefined && Number(tRaw) >= 0 && Number(tRaw) <= 3 ? Number(tRaw) + 1 : null;

        if (cmap[0].color) {
          if (tSlot) {
            const tSpool = state.spools.find(s => Number(s.slot) === tSlot);
            if (tSpool && areColorsEquivalentOnCanvas(tSpool.color, cmap[0].color)) {
              return tSlot;
            }
          }
          const matchByColor = state.spools.find(
            s => s.slot >= 1 && s.slot <= 4 && areColorsEquivalentOnCanvas(s.color, cmap[0].color)
          );
          if (matchByColor) return Number(matchByColor.slot);
        }

        if (tSlot) return tSlot;
      }
    } catch {}
  }

  // 3. Fallback to live snapshot or last active slot
  if (snap && snap.activeSlot >= 1 && snap.activeSlot <= 4) {
    return Number(snap.activeSlot);
  }
  if (state.lastActiveSlot >= 1 && state.lastActiveSlot <= 4) {
    return Number(state.lastActiveSlot);
  }

  return 1;
}

function reconcileExistingPrintsAndSpools() {
  let changed = false;
  const manualDeleted = new Set((state.manuallyDeletedTaskIds || []).map(String));
  const defaultIgnored = new Set(DEFAULT_IGNORED_OLD_TASK_IDS);

  if (Array.isArray(state.ignoredCloudTaskIds)) {
    const cleanedIgnored = state.ignoredCloudTaskIds.filter(id => {
      const sid = String(id);
      return defaultIgnored.has(sid) || manualDeleted.has(sid);
    });
    if (cleanedIgnored.length !== state.ignoredCloudTaskIds.length) {
      state.ignoredCloudTaskIds = cleanedIgnored;
      changed = true;
    }
  }

  for (const p of state.prints || []) {
    if (!p || p.gramsDeducted) continue;

    const fileMeta = (!p.spoolManuallyEdited || Number(p.actualGrams || 0) <= 0)
      ? findCachedFileMeta(p.filename, p.filename, null)
      : null;

    if (Number(p.actualGrams || 0) <= 0) {
      let recoveredGrams = 0;
      if (fileMeta && Number(fileMeta.totalFilamentUsedGrams || 0) > 0) {
        recoveredGrams = round1(Number(fileMeta.totalFilamentUsedGrams));
      } else {
        const durSec = parseSlicerTimeSecFromFilename(p.filename) || Number(p.duration || 0);
        if (durSec > 0) {
          recoveredGrams = round1(estimateFilamentGramsFromDuration(durSec, p.filename));
        }
      }
      if (recoveredGrams > 0) {
        p.totalEstimatedGrams = recoveredGrams;
        p.actualGrams = recoveredGrams;
        changed = true;
      }
    }

    if (!p.spoolManuallyEdited && p.cloudTaskId && !String(p.cloudTaskId).startsWith("manual-")) {
      if (fileMeta) {
        const resolvedSlot = resolveSlotForPrint(fileMeta, p.filename, null);
        const resolvedSpool = state.spools.find(s => Number(s.slot) === Number(resolvedSlot));
        if (resolvedSpool && resolvedSpool.id !== p.spoolId) {
          p.spoolId = resolvedSpool.id;
          changed = true;
        }
      }
    }

    const spool = state.spools.find(s => s.id === p.spoolId) || state.spools[0];
    if (spool) {
      if (Number(p.actualGrams || 0) > 0) {
        spool.remainingWeight = Math.max(0, round1(Number(spool.remainingWeight || 0) - Number(p.actualGrams)));
      }
      p.gramsDeducted = true;
      changed = true;
    }
  }

  return changed;
}

async function syncWithElegooCloud(showFeedback = false) {
  if (!state.auth.loggedIn || !state.auth.token) return;
  if (isSavingState || isSyncingCloud) return;
  if (!showFeedback && isAnyModalOpen()) return;

  isSyncingCloud = true;
  const syncIcon = document.getElementById("sync-icon");
  if (syncIcon) syncIcon.classList.add("spinning");

  try {
    await loadPersistentState();
    ensureFourCanvasSlotsExist();
    let anyCloudStateChanged = reconcileExistingPrintsAndSpools();

    // 1. Fetch Printer List
    const devResp = await cloudProxyRequest("/api/v1/device-management-server/device/list", "GET");
    if (devResp && Array.isArray(devResp.data) && devResp.data.length > 0) {
      state.printers = devResp.data;
      if (!state.selectedPrinterSn || !state.printers.some(p => p.serialNo === state.selectedPrinterSn)) {
        state.selectedPrinterSn = state.printers[0].serialNo;
        anyCloudStateChanged = true;
      }
      renderPrinterSelect();
    } else if (devResp && (devResp.code === 401 || devResp.code === "401")) {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      let healed = false;
      if (isLocalhost) {
        try {
          const slicerResp = await fetch("/api/slicer/status", { cache: "no-store" });
          if (slicerResp.ok) {
            const slicerData = await slicerResp.json();
            if (slicerData?.paired && slicerData.token && slicerData.token !== state.auth.token) {
              state.auth.token = slicerData.token;
              if (slicerData.user) state.auth.user = slicerData.user;
              saveBrowserSession(state.auth);
              healed = true;
            }
          }
        } catch {}
      } else {
        const prevTok = state.auth.token;
        await loadPersistentState();
        if (state.auth.token && state.auth.token !== prevTok) {
          healed = true;
        }
      }
      if (healed) {
        isSyncingCloud = false;
        return await syncWithElegooCloud(showFeedback);
      }
      showToast(t("errSessionExpired"), "error");
      return;
    }

    const sn = state.selectedPrinterSn;
    if (!sn) {
      renderAll();
      return;
    }

    // 2. Fetch Live Report Data (Canvas Colors, Materials & Active Print Progress)
    const reportResp = await cloudProxyRequest(
      `/api/v1/device-management-server/device/report-data/list?deviceCode=${encodeURIComponent(sn)}`,
      "GET"
    );

    if (reportResp && reportResp.data) {
      const cChanged = syncCanvasSlotsFromCloudReport(reportResp.data);
      if (cChanged) anyCloudStateChanged = true;
    }

    // 3. Fetch Local Files List on Printer (caches exact totalFilamentUsed & colorMap before files are ever deleted)
    try {
      const filesResp = await cloudProxyRequest(
        `/api/v1/device-management-server/local-file/page?serialNo=${encodeURIComponent(sn)}&pageNo=1&pageSize=100`,
        "GET"
      );
      const fileList = filesResp?.data?.list || filesResp?.data?.records || (Array.isArray(filesResp?.data) ? filesResp.data : []);
      for (const f of fileList) {
        cachePrinterFileMeta(f);
      }
    } catch {}

    // 4. Fetch Print Task History from Cloud
    const historyResp = await cloudProxyRequest(
      `/api/v1/device-management-server/device/event-data/page?deviceCode=${encodeURIComponent(sn)}&pageNo=1&pageSize=50&eventKey=history_task&sort=create_time,desc`,
      "GET"
    );

    const historyItems = historyResp?.data?.list || historyResp?.data?.records || [];
    let newPrintsProcessed = 0;

    const orderedItems = [...historyItems].reverse();

    for (const item of orderedItems) {
      const cloudId = String(item.id || "");
      if (!cloudId) continue;

      // Skip old historical tasks or manually deleted tasks
      if (DEFAULT_IGNORED_OLD_TASK_IDS.includes(cloudId)) continue;
      if ((state.manuallyDeletedTaskIds || []).includes(cloudId)) continue;
      if (state.ignoredCloudTaskIds.includes(cloudId)) continue;
      if (state.prints.some(p => p.cloudTaskId === cloudId)) continue;

      let ev = null;
      try {
        ev = typeof item.eventValue === "string" ? JSON.parse(item.eventValue) : item.eventValue;
      } catch {
        continue;
      }
      if (!ev || !ev.task_name) continue;

      const filename = ev.task_name;
      const baseFilename = filename.split("/").pop().split("\\").pop();
      const taskStatus = Number(ev.task_status || 1); // 1=Completed, 2=Exception, 3=Stopped
      const beginTimeSec = Number(ev.begin_time || 0);
      const endTimeSec = Number(ev.end_time || 0);
      const durationSec = endTimeSec > beginTimeSec ? (endTimeSec - beginTimeSec) : 0;

      // Look up exact slicer metadata from printer file list or single file detail
      let fileMeta = findCachedFileMeta(filename, baseFilename, ev);

      if (!fileMeta) {
        const tryNames = filename === baseFilename ? [filename] : [filename, baseFilename];
        for (const qName of tryNames) {
          try {
            const singleFileResp = await cloudProxyRequest(
              `/api/v1/device-management-server/local-file/filename?serialNo=${encodeURIComponent(sn)}&filename=${encodeURIComponent(qName)}`,
              "GET"
            );
            if (singleFileResp && singleFileResp.data && singleFileResp.data.filename) {
              cachePrinterFileMeta(singleFileResp.data);
              fileMeta = findCachedFileMeta(filename, baseFilename, ev);
              anyCloudStateChanged = true;
              break;
            }
          } catch {}
        }
      }

      const snapshot = getLiveSnapshotForTask(filename, baseFilename, ev);
      let isEstimatedFromTime = false;
      let totalFilamentUsedGrams = Number(
        fileMeta?.totalFilamentUsed ??
        ev?.totalFilamentUsed ??
        0
      );

      if (totalFilamentUsedGrams <= 0) {
        const lenMm = Number(fileMeta?.totalFilamentUsedLength ?? ev?.totalFilamentUsedLength ?? 0);
        if (lenMm > 0) {
          totalFilamentUsedGrams = round1((lenMm / 1000) * 2.98);
        }
      }

      // Fallback for prints sent via LAN from ElegooSlicer that do not appear in Cloud local-file/page
      if (totalFilamentUsedGrams <= 0) {
        const slicerSec = parseSlicerTimeSecFromFilename(baseFilename);
        const snapDurSec = Number(snapshot?.printDuration || 0);
        const netExtrusionSec = durationSec > 300 ? Math.max(60, durationSec - 240) : durationSec;
        const estSec = slicerSec || snapDurSec || netExtrusionSec;
        if (estSec > 0) {
          const layerHeight = parseLayerHeightFromFilename(baseFilename);
          const layerScale = Math.max(0.3, Math.min(1.5, layerHeight / 0.2));
          totalFilamentUsedGrams = Math.max(0.5, round1(estSec * 0.012667 * layerScale));
          isEstimatedFromTime = true;
        }
      }

      if (totalFilamentUsedGrams <= 0) {
        continue;
      }

      const slotUsed = resolveSlotForPrint(fileMeta, filename, ev);

      // Determine completion percentage (100% if completed, or partial % if stopped/interrupted)
      let progressPct = 100;
      const estimatedPrintTimeSec = Number(fileMeta?.printTime || parseSlicerTimeSecFromFilename(baseFilename) || 0);

      if (taskStatus === 1) {
        progressPct = 100;
      } else {
        if (snapshot && snapshot.progress > 0 && snapshot.progress < 100) {
          progressPct = Math.round(snapshot.progress);
        } else if (snapshot && snapshot.totalLayer > 0 && snapshot.currentLayer > 0) {
          progressPct = Math.max(1, Math.min(99, Math.round((snapshot.currentLayer / snapshot.totalLayer) * 100)));
        } else if (estimatedPrintTimeSec > 0 && durationSec > 0) {
          const netExtrusionSec = Math.max(30, durationSec - 240);
          progressPct = Math.max(1, Math.min(99, Math.round((netExtrusionSec / estimatedPrintTimeSec) * 100)));
        } else {
          progressPct = 50;
        }
      }

      const actualGrams = round1((totalFilamentUsedGrams * progressPct) / 100);
      const targetSpool = state.spools.find(s => Number(s.slot) === Number(slotUsed)) || state.spools[0];
      const spoolId = targetSpool ? targetSpool.id : "";

      if (targetSpool && actualGrams > 0) {
        targetSpool.remainingWeight = Math.max(0, round1(Number(targetSpool.remainingWeight || 0) - actualGrams));
      }

      const printTimestamp = endTimeSec > 0 ? endTimeSec * 1000 : Date.now();
      state.prints.unshift({
        id: "print-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        cloudTaskId: cloudId,
        filename: baseFilename,
        status: taskStatus,
        spoolId,
        totalEstimatedGrams: round1(totalFilamentUsedGrams),
        progressPct,
        actualGrams,
        gramsDeducted: true,
        estimatedFromTime: isEstimatedFromTime,
        timestamp: printTimestamp
      });

      newPrintsProcessed++;
    }

    state.prints.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    state.ui.lastSyncTime = new Date();

    if (anyCloudStateChanged || newPrintsProcessed > 0) {
      await savePersistentState();
    }
    if (!isAnyModalOpen()) {
      renderAll();
    }

    if (showFeedback) {
      showToast(
        newPrintsProcessed > 0
          ? t("toastSyncedNewPrints", { count: newPrintsProcessed })
          : t("toastSyncedCloud"),
        "success"
      );
    }
  } catch (err) {
    console.error("Errore sync Cloud:", err);
    if (showFeedback) {
      showToast(t("errSync", { msg: err.message || err }), "error");
    }
  } finally {
    isSyncingCloud = false;
    if (syncIcon) syncIcon.classList.remove("spinning");
  }
}

// ============================================================================
// RENDERING
// ============================================================================
function renderAll() {
  ensureFourCanvasSlotsExist();
  renderSyncTimestamp();
  renderCanvasSlots();
  renderInventoryGrid();
  renderHistoryList();
}

function renderSyncTimestamp() {
  const el = document.getElementById("last-sync-time");
  if (!el) return;
  if (state.ui.lastSyncTime) {
    const locale = getCurrentLang() === "en" ? "en-US" : "it-IT";
    el.textContent = t("updatedAtTime", { time: state.ui.lastSyncTime.toLocaleTimeString(locale) });
  } else {
    el.textContent = t("statusSynced");
  }
}

function renderPrinterSelect() {
  const sel = document.getElementById("printer-select");
  if (!sel) return;
  sel.classList.toggle("hidden", state.printers.length <= 1);
  if (state.printers.length === 0) {
    sel.innerHTML = `<option value="">Centauri Carbon 2</option>`;
    return;
  }
  sel.innerHTML = state.printers
    .map(p => {
      const name = p.deviceName || "Centauri Carbon 2";
      const selected = p.serialNo === state.selectedPrinterSn ? "selected" : "";
      return `<option value="${escapeHtml(p.serialNo)}" ${selected}>${escapeHtml(name)}</option>`;
    })
    .join("");
}

/**
 * Clean Stylized Spool SVG with non-overlapping percentage centered inside the hub
 */
function createStylizedSpoolSvg(colorHex, percentage, size = 176) {
  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  const pctText = `${Math.round(pct)}%`;

  const minR = 31;
  const maxR = 52;
  const filamentR = minR + ((maxR - minR) * (pct / 100));

  const circumference = 376.99;
  const dashOffset = circumference - (circumference * pct) / 100;
  const ringColor = pct > 35 ? "#00d2ff" : pct > 15 ? "#f59e0b" : "#f43f5e";

  const fontSize = size < 100 ? 22 : 19;

  return `
    <svg viewBox="0 0 136 136" class="spool-svg" style="width:${size}px;height:${size}px">
      <circle cx="68" cy="68" r="60" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5" />
      <circle cx="68" cy="68" r="60" fill="none" stroke="${ringColor}" stroke-width="5"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${dashOffset}"
        transform="rotate(-90 68 68)" />

      <circle cx="68" cy="68" r="53" fill="#111622" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
      <circle cx="68" cy="68" r="${filamentR.toFixed(1)}" fill="${colorHex}" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
      <circle cx="68" cy="68" r="${Math.max(minR, filamentR * 0.86).toFixed(1)}" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.5" stroke-dasharray="6 4" />

      <circle cx="68" cy="68" r="29" fill="#0b0e14" stroke="rgba(255,255,255,0.28)" stroke-width="2" />

      <text x="68" y="68"
        text-anchor="middle"
        dominant-baseline="central"
        fill="#ffffff"
        font-family="'JetBrains Mono', monospace"
        font-size="${fontSize}"
        font-weight="800">${pctText}</text>
    </svg>
  `;
}

function renderCanvasSlots() {
  const grid = document.getElementById("canvas-slots-grid");
  if (!grid) return;

  let html = "";

  for (let slotNum = 1; slotNum <= 4; slotNum++) {
    const spool = state.spools.find(s => Number(s.slot) === slotNum);
    if (!spool) continue;

    const pct = spool.initialWeight > 0
      ? Math.max(0, Math.min(100, (spool.remainingWeight / spool.initialWeight) * 100))
      : 0;
    const barColor = pct > 35 ? "var(--cyan)" : pct > 15 ? "var(--amber)" : "var(--rose)";

    html += `
      <div class="canvas-slot-card">
        <div class="slot-top-row">
          <span class="slot-number-badge">SLOT A${slotNum}</span>
          <span class="slot-material-tag">${escapeHtml(spool.material)}</span>
        </div>

        <div class="spool-visual-wrap">
          ${createStylizedSpoolSvg(spool.color, pct, 176)}
        </div>

        <div class="slot-spool-name" title="${escapeHtml(spool.name)}">${escapeHtml(spool.name)}</div>

        <div class="slot-weight-line">
          ${round1(spool.remainingWeight)} g <small>/ ${round1(spool.initialWeight)} g</small>
        </div>

        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width:${pct}%; background:${barColor}"></div>
        </div>

        <div class="slot-actions-row">
          <button type="button" class="btn btn-glass btn-xs" onclick="openEditSpoolModal('${spool.id}')">
            ${escapeHtml(t("btnEditWeightMat"))}
          </button>
        </div>
      </div>
    `;
  }

  grid.innerHTML = html;
}

/**
 * Renders ONLY unmounted spools (slot === 0) in Archivio Bobine Smontate,
 * never repeating the 4 spools already mounted in the Canvas.
 */
function renderInventoryGrid() {
  const grid = document.getElementById("inventory-grid");
  const badge = document.getElementById("inventory-count-badge");
  if (!grid) return;

  const archivedSpools = state.spools.filter(s => !s.slot || Number(s.slot) === 0);
  if (badge) badge.textContent = archivedSpools.length;

  if (archivedSpools.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding: 18px; color: var(--text-muted); font-size: 0.85rem;">
        ${escapeHtml(t("emptyArchive"))}
      </div>
    `;
    return;
  }

  grid.innerHTML = archivedSpools
    .map(spool => {
      const pct = spool.initialWeight > 0
        ? Math.max(0, Math.min(100, (spool.remainingWeight / spool.initialWeight) * 100))
        : 0;
      const barColor = pct > 35 ? "var(--cyan)" : pct > 15 ? "var(--amber)" : "var(--rose)";

      return `
        <div class="inventory-card">
          <div class="inv-card-top">
            ${createStylizedSpoolSvg(spool.color, pct, 84)}
            <div class="inv-title-block">
              <h4 title="${escapeHtml(spool.name)}">${escapeHtml(spool.name)}</h4>
              <div class="inv-sub-badges">
                <span class="badge badge-outline">${escapeHtml(t("badgeUnmounted"))}</span>
                <span class="badge badge-outline">${escapeHtml(spool.material)}</span>
              </div>
            </div>
          </div>

          <div class="inv-weight-row">
            <span>${escapeHtml(t("badgeRemaining"))} <strong style="color:var(--cyan)">${round1(spool.remainingWeight)} g</strong></span>
            <span style="color:var(--text-muted)">${escapeHtml(t("badgeOfWeight", { weight: round1(spool.initialWeight) }))}</span>
          </div>

          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${pct}%; background:${barColor}"></div>
          </div>

          <div class="inv-actions">
            <button type="button" class="btn btn-glass btn-xs" onclick="openEditSpoolModal('${spool.id}')">
              ${escapeHtml(t("btnEditWeightMat"))}
            </button>
            <button type="button" class="btn btn-glass btn-danger-hover btn-xs" onclick="deleteSpool('${spool.id}')">
              🗑️
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderHistoryList() {
  const listEl = document.getElementById("history-list");
  const countBadge = document.getElementById("prints-count-badge");
  if (!listEl) return;

  if (countBadge) countBadge.textContent = state.prints.length;

  const hfilter = state.ui.historyFilter;
  const filtered = state.prints.filter(p => {
    if (hfilter === "completed") return Number(p.status) === 1;
    if (hfilter === "stopped") return Number(p.status) !== 1;
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 18px; color: var(--text-muted); font-size: 0.85rem;">
        ${escapeHtml(t("emptyPrints"))}
      </div>
    `;
    return;
  }

  const locale = getCurrentLang() === "en" ? "en-US" : "it-IT";
  listEl.innerHTML = filtered
    .map(p => {
      const spool = state.spools.find(s => s.id === p.spoolId) || state.spools[0];
      const spoolName = spool ? spool.name : "Slot A1";
      const spoolColor = spool ? spool.color : "#00d2ff";
      const isCompleted = Number(p.status) === 1;
      const isStopped = Number(p.status) === 3;

      const rowClass = isCompleted ? "status-completed" : isStopped ? "status-stopped" : "status-error";
      const statusBadge = isCompleted
        ? `<span class="badge badge-success">${escapeHtml(t("badgeCompleted", { pct: p.progressPct }))}</span>`
        : isStopped
          ? `<span class="badge badge-warning">${escapeHtml(t("badgeStopped", { pct: p.progressPct }))}</span>`
          : `<span class="badge badge-danger">${escapeHtml(t("badgeInterrupted", { pct: p.progressPct }))}</span>`;

      const dateStr = new Date(p.timestamp || Date.now()).toLocaleString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

      const gramsText = `-${round1(p.actualGrams)} g`;

      return `
        <div class="history-row ${rowClass}">
          <div class="history-main-info">
            <span class="history-color-dot" style="background:${spoolColor}"></span>
            <div>
              <div class="history-title">${escapeHtml(p.filename)}</div>
              <div class="history-meta">
                ${statusBadge}
                <span>•</span>
                <span>${escapeHtml(spoolName)}</span>
                <span>•</span>
                <span>${dateStr}</span>
              </div>
            </div>
          </div>

          <div class="history-consumption-box">
            <span class="grams-deducted">${gramsText}</span>
            <button type="button" class="btn btn-glass btn-xs" onclick="openEditPrintModal('${p.id}')">
              ${escapeHtml(t("btnAdjustPrint"))}
            </button>
            <button type="button" class="btn btn-glass btn-danger-hover btn-xs" onclick="deletePrintRecord('${p.id}')">
              🗑️
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// ============================================================================
// ACTIONS & MODALS
// ============================================================================
window.openEditSpoolModal = function (spoolId = null) {
  const modal = document.getElementById("modal-spool");
  const title = document.getElementById("modal-spool-title");

  if (spoolId) {
    const spool = state.spools.find(s => s.id === spoolId);
    if (!spool) return;
    const slotText = spool.slot >= 1 && spool.slot <= 4 ? t("slotSuffix", { slot: spool.slot }) : t("archiveSuffix");
    title.textContent = t("modalEditSpool") + slotText;
    document.getElementById("spool-id").value = spool.id;
    document.getElementById("spool-slot").value = String(spool.slot || 0);
    document.getElementById("spool-name").value = spool.name;
    document.getElementById("spool-material").value = spool.material || "PLA";
    document.getElementById("spool-color-picker").value = spool.color || "#00d2ff";
    document.getElementById("spool-color-hex").value = (spool.color || "#00D2FF").toUpperCase();
    document.getElementById("spool-initial-weight").value = spool.initialWeight;
    document.getElementById("spool-remaining-weight").value = spool.remainingWeight;
  } else {
    title.textContent = t("modalAddSpool");
    document.getElementById("spool-id").value = "";
    document.getElementById("spool-slot").value = "0";
    document.getElementById("spool-name").value = "";
    document.getElementById("spool-material").value = "PLA HS";
    document.getElementById("spool-color-picker").value = "#00d2ff";
    document.getElementById("spool-color-hex").value = "#00D2FF";
    document.getElementById("spool-initial-weight").value = 1000;
    document.getElementById("spool-remaining-weight").value = 1000;
  }

  modal.classList.remove("hidden");
};

window.deleteSpool = async function (spoolId) {
  const spool = state.spools.find(s => s.id === spoolId);
  if (!spool) return;
  if (!confirm(t("confirmDeleteSpool", { name: spool.name }))) return;
  state.spools = state.spools.filter(s => s.id !== spoolId);
  await savePersistentState();
  renderAll();
};

window.openEditPrintModal = function (printId = null) {
  const modal = document.getElementById("modal-print");
  const spoolSelect = document.getElementById("print-spool-select");

  spoolSelect.innerHTML = state.spools
    .map(s => {
      const slotTag = s.slot >= 1 && s.slot <= 4 ? `[Slot A${s.slot}] ` : t("archiveTag");
      return `<option value="${s.id}">${slotTag}${escapeHtml(s.name)} (${round1(s.remainingWeight)}g)</option>`;
    })
    .join("");

  if (printId) {
    const p = state.prints.find(x => x.id === printId);
    if (!p) return;
    document.getElementById("print-id").value = p.id;
    document.getElementById("print-filename").value = p.filename;
    document.getElementById("print-status").value = String(p.status);
    if (p.spoolId) spoolSelect.value = p.spoolId;
    document.getElementById("print-total-grams").value = p.totalEstimatedGrams || 0;
    document.getElementById("print-progress-pct").value = p.progressPct || 100;
    document.getElementById("print-actual-grams").value = p.actualGrams || 0;
  } else {
    document.getElementById("print-id").value = "";
    document.getElementById("print-filename").value = "";
    document.getElementById("print-status").value = "1";
    document.getElementById("print-total-grams").value = 50;
    document.getElementById("print-progress-pct").value = 100;
    document.getElementById("print-actual-grams").value = 50;
  }

  modal.classList.remove("hidden");
};

window.deletePrintRecord = async function (printId) {
  const idx = state.prints.findIndex(p => p.id === printId);
  if (idx === -1) return;
  const p = state.prints[idx];

  const spool = state.spools.find(s => s.id === p.spoolId);
  if (spool && p.actualGrams > 0) {
    spool.remainingWeight = round1(spool.remainingWeight + Number(p.actualGrams));
  }

  if (p.cloudTaskId && !String(p.cloudTaskId).startsWith("manual-")) {
    const cid = String(p.cloudTaskId);
    if (!state.ignoredCloudTaskIds.includes(cid)) {
      state.ignoredCloudTaskIds.push(cid);
    }
    state.manuallyDeletedTaskIds = state.manuallyDeletedTaskIds || [];
    if (!state.manuallyDeletedTaskIds.includes(cid)) {
      state.manuallyDeletedTaskIds.push(cid);
    }
  }

  state.prints.splice(idx, 1);
  await savePersistentState();
  renderAll();
  showToast(t("toastPrintRemoved"), "info");
};

// ============================================================================
// EVENTS
// ============================================================================
function bindEvents() {
  ["btn-lang-toggle", "btn-lang-toggle-login"].forEach(id => {
    const langBtn = document.getElementById(id);
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        const next = getCurrentLang() === "en" ? "it" : "en";
        applyLanguage(next, true);
      });
    }
  });

  document.querySelectorAll(".login-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      activateLoginTab(tab.dataset.tab);
    });
  });

  const btnSlicerForceRelogin = document.getElementById("btn-slicer-force-relogin");
  if (btnSlicerForceRelogin) {
    btnSlicerForceRelogin.addEventListener("click", async () => {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (!isLocalhost) {
        showToast(t("toastOpenPcApp"), "info");
        activateLoginTab("token");
        return;
      }

      btnSlicerForceRelogin.disabled = true;
      btnSlicerForceRelogin.textContent = t("btnOpeningSlicer");
      try {
        const resp = await fetch("/api/slicer/force-relogin", { method: "POST" });
        const data = await resp.json();
        if (!data.ok) {
          btnSlicerForceRelogin.disabled = false;
          btnSlicerForceRelogin.textContent = t("btnStartSlicer");
          showToast(data.error || t("errCannotOpenSlicer"), "error");
          return;
        }
        updateSlicerStatusUi({
          waitingForFreshLogin: true,
          slicerRunning: data.slicerRunning
        });
        pollSlicerRelogin();
      } catch (err) {
        btnSlicerForceRelogin.disabled = false;
        btnSlicerForceRelogin.textContent = t("btnStartSlicer");
        showToast(t("errStartSlicerBridge", { msg: err.message || err }), "error");
      }
    });
  }

  const btnSlicerAdoptCurrent = document.getElementById("btn-slicer-adopt-current");
  if (btnSlicerAdoptCurrent) {
    btnSlicerAdoptCurrent.addEventListener("click", async () => {
      btnSlicerAdoptCurrent.disabled = true;
      try {
        const resp = await fetch("/api/slicer/adopt-current", { method: "POST" });
        const data = await resp.json();
        if (data.ok && data.token) {
          if (slicerPollIntervalId) {
            clearInterval(slicerPollIntervalId);
            slicerPollIntervalId = null;
          }
          await applySlicerAuthAndOpen(data, true);
        } else {
          showToast(data.error || t("errInvalidSlicerSession"), "error");
        }
      } catch (err) {
        showToast(t("errAdoptSlicer", { msg: err.message || err }), "error");
      } finally {
        btnSlicerAdoptCurrent.disabled = false;
      }
    });
  }

  const btnSlicerResync = document.getElementById("btn-slicer-resync");
  if (btnSlicerResync) {
    btnSlicerResync.addEventListener("click", async () => {
      if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
      }
      saveBrowserSession(null);
      state.auth.loggedIn = false;
      state.auth.token = "";
      showLoginView();
      activateLoginTab("slicer");
      try {
        const resp = await fetch("/api/slicer/force-relogin", { method: "POST" });
        const data = await resp.json();
        updateSlicerStatusUi({
          waitingForFreshLogin: true,
          slicerRunning: data.slicerRunning
        });
        pollSlicerRelogin();
      } catch (err) {
        showToast(t("errRelinkSlicer", { msg: err.message || err }), "error");
      }
    });
  }

  document.getElementById("toggle-password-btn").addEventListener("click", () => {
    const inp = document.getElementById("login-password");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  document.getElementById("login-form-credentials").addEventListener("submit", async (e) => {
    e.preventDefault();
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocalhost) {
      applyWebAppQrOnlyLockUi(t("errManualDisabledWeb"));
      return;
    }
    const errBox = document.getElementById("login-error-box");
    errBox.classList.add("hidden");

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const region = document.getElementById("login-region").value;
    const btn = document.getElementById("btn-login-submit");

    btn.disabled = true;
    btn.textContent = t("btnLoggingIn");

    try {
      const resp = await fetch("/api/cloud/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, region })
      });
      const data = await resp.json();

      if (!data.ok || !data.token) {
        errBox.textContent = data.error || t("errInvalidCredentials");
        errBox.classList.remove("hidden");
        return;
      }

      state.auth = {
        loggedIn: true,
        region,
        email: data.user?.email || email,
        token: data.token,
        refreshToken: data.refreshToken || "",
        user: data.user || null
      };

      saveBrowserSession(state.auth);
      state.spools = [];
      state.prints = [];
      state.printers = [];
      state.selectedPrinterSn = "";

      await loadPersistentState();
      showDashboardView();
      renderAll();
      await syncWithElegooCloud(true);
      startAutoSyncTimer();
    } catch (err) {
      errBox.textContent = t("errConnection", { msg: err.message || err });
      errBox.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = t("btnLoginSubmit");
    }
  });

  document.getElementById("login-form-token").addEventListener("submit", async (e) => {
    e.preventDefault();
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocalhost) {
      applyWebAppQrOnlyLockUi(t("errManualDisabledWeb"));
      return;
    }
    const token = document.getElementById("login-token-input").value.trim();
    const region = document.getElementById("login-region").value;
    if (!token) return;

    state.auth = {
      loggedIn: true,
      region,
      email: "Token Cloud",
      token,
      refreshToken: "",
      user: null
    };

    try {
      const accResp = await cloudProxyRequest("/api/v1/account-center-server/account-info/account", "GET");
      if (accResp && accResp.data && (accResp.data.email || accResp.data.id)) {
        state.auth.user = accResp.data;
        state.auth.email = accResp.data.email || accResp.data.nickname || "Token Cloud";
      }
    } catch {}

    saveBrowserSession(state.auth);
    state.spools = [];
    state.prints = [];
    state.printers = [];
    state.selectedPrinterSn = "";

    await loadPersistentState();
    showDashboardView();
    renderAll();
    await syncWithElegooCloud(true);
    startAutoSyncTimer();
  });

  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (syncIntervalId) clearInterval(syncIntervalId);
    saveBrowserSession(null);
    try { localStorage.removeItem(QR_PAIRED_STORAGE_KEY); } catch {}
    state.auth.loggedIn = false;
    state.auth.token = "";
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocalhost) {
      applyWebAppQrOnlyLockUi();
    }
    showLoginView();
  });

  document.getElementById("printer-select").addEventListener("change", (e) => {
    state.selectedPrinterSn = e.target.value;
    savePersistentState();
    syncWithElegooCloud(true);
  });

  const colorPicker = document.getElementById("spool-color-picker");
  const colorHex = document.getElementById("spool-color-hex");
  const matSelect = document.getElementById("spool-material");
  const nameInp = document.getElementById("spool-name");

  // Auto-update spool name when material changes if name matches a standard "<Material> <Color>" pattern
  matSelect.addEventListener("change", () => {
    const curName = nameInp.value.trim();
    const colorLabel = getColorLabel(colorPicker.value);
    const knownMats = ["PLA", "PLA+", "PLA HS", "PLA Matte", "PLA Silk", "PLA-CF", "PETG", "Rapid PETG", "ABS", "ASA", "TPU", "PA-CF", "PETG-CF"];
    for (const m of knownMats) {
      if (curName.toLowerCase() === `${m} ${colorLabel}`.toLowerCase()) {
        nameInp.value = `${matSelect.value} ${colorLabel}`;
        break;
      }
    }
  });

  colorPicker.addEventListener("input", () => {
    colorHex.value = colorPicker.value.toUpperCase();
  });

  colorHex.addEventListener("input", () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(colorHex.value)) {
      colorPicker.value = colorHex.value;
    }
  });

  document.querySelectorAll(".color-swatch").forEach(sw => {
    sw.addEventListener("click", () => {
      const c = sw.dataset.color;
      colorPicker.value = c;
      colorHex.value = c.toUpperCase();
    });
  });

  document.getElementById("form-spool").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("spool-id").value;
    const slot = Number(document.getElementById("spool-slot").value || 0);
    const name = document.getElementById("spool-name").value.trim() || t("spoolDefaultName");
    const material = document.getElementById("spool-material").value;
    const color = document.getElementById("spool-color-picker").value;
    const initialWeight = Math.max(1, parseFloat(document.getElementById("spool-initial-weight").value) || 1000);
    const remainingWeight = Math.max(0, parseFloat(document.getElementById("spool-remaining-weight").value) || 0);

    if (id) {
      const existing = state.spools.find(s => s.id === id);
      if (existing) {
        existing.name = name;
        existing.material = material;
        existing.color = normalizeColorHex(color);
        existing.initialWeight = round1(initialWeight);
        existing.remainingWeight = round1(remainingWeight);
        existing.manualRemainingWeight = round1(remainingWeight);
        existing.userEdited = true;
        existing.userEditedAt = Date.now();
        existing.userEditVersion = Number(existing.userEditVersion || 0) + 1;
      }
    } else {
      state.spools.push({
        id: "spool-" + Date.now(),
        name,
        material,
        slot,
        color: normalizeColorHex(color),
        initialWeight: round1(initialWeight),
        remainingWeight: round1(remainingWeight),
        manualRemainingWeight: round1(remainingWeight),
        userEdited: true,
        userEditedAt: Date.now(),
        userEditVersion: 1,
        createdAt: Date.now()
      });
    }

    document.getElementById("modal-spool").classList.add("hidden");
    renderAll();
    const saved = await savePersistentState();
    if (saved) {
      showToast(t("toastSpoolSaved"), "success");
    } else {
      showToast(t("errSaveServer"), "error");
    }
  });

  document.querySelectorAll("#history-filters .filter-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#history-filters .filter-pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.ui.historyFilter = btn.dataset.hfilter;
      renderHistoryList();
    });
  });

  const totGramsInp = document.getElementById("print-total-grams");
  const pctInp = document.getElementById("print-progress-pct");
  const statusInp = document.getElementById("print-status");
  const actualGramsInp = document.getElementById("print-actual-grams");

  const recalcPrintModalGrams = () => {
    const tot = parseFloat(totGramsInp.value) || 0;
    const pct = Math.max(0, Math.min(100, parseFloat(pctInp.value) || 0));
    actualGramsInp.value = round1((tot * pct) / 100);
  };

  totGramsInp.addEventListener("input", recalcPrintModalGrams);
  pctInp.addEventListener("input", recalcPrintModalGrams);
  statusInp.addEventListener("change", () => {
    if (statusInp.value === "1") {
      pctInp.value = 100;
      recalcPrintModalGrams();
    }
  });

  // Read exact filament grams directly from a local .gcode file
  const gcodeFileInput = document.getElementById("gcode-file-input");
  if (gcodeFileInput) {
    gcodeFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      document.getElementById("print-filename").value = file.name;

      try {
        // Read first 120KB and last 120KB of the .gcode file where Orca/ElegooSlicer writes filament used [g]
        const headBlob = file.slice(0, 120000);
        const tailBlob = file.size > 120000 ? file.slice(file.size - 120000) : null;
        const headText = await headBlob.text();
        const tailText = tailBlob ? await tailBlob.text() : "";
        const combined = headText + "\n" + tailText;

        // Match "; filament used [g] = 42.13" or "; total filament used [g] = 42.13"
        const gMatch =
          combined.match(/;\s*total filament used \[g\]\s*=\s*([0-9.,;\s]+)/i) ||
          combined.match(/;\s*filament used \[g\]\s*=\s*([0-9.,;\s]+)/i);

        if (gMatch && gMatch[1]) {
          const parts = gMatch[1]
            .split(/[;,\s]+/)
            .map(v => parseFloat(v))
            .filter(v => !isNaN(v) && v > 0);
          const sumGrams = parts.reduce((a, b) => a + b, 0);
          if (sumGrams > 0) {
            totGramsInp.value = round1(sumGrams);
            recalcPrintModalGrams();
            showToast(t("toastGcodeRead", { grams: round1(sumGrams) }), "success");
          }
        }
      } catch (err) {
        console.warn("Errore lettura G-code:", err);
      }
      gcodeFileInput.value = "";
    });
  }

  document.getElementById("form-print").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("print-id").value;
    const filename = document.getElementById("print-filename").value.trim();
    const status = Number(document.getElementById("print-status").value || 1);
    const spoolId = document.getElementById("print-spool-select").value;
    const totalEstimatedGrams = round1(parseFloat(totGramsInp.value) || 0);
    const progressPct = Math.max(1, Math.min(100, Math.round(parseFloat(pctInp.value) || 100)));
    const actualGrams = round1(parseFloat(actualGramsInp.value) || 0);

    if (id) {
      const existing = state.prints.find(p => p.id === id);
      if (existing) {
        const oldSpool = state.spools.find(s => s.id === existing.spoolId);
        if (oldSpool) {
          oldSpool.remainingWeight = round1(oldSpool.remainingWeight + Number(existing.actualGrams || 0));
        }

        const newSpool = state.spools.find(s => s.id === spoolId);
        if (newSpool) {
          newSpool.remainingWeight = Math.max(0, round1(newSpool.remainingWeight - actualGrams));
        }

        existing.filename = filename;
        existing.status = status;
        existing.spoolId = spoolId;
        existing.spoolManuallyEdited = true;
        existing.totalEstimatedGrams = totalEstimatedGrams;
        existing.progressPct = progressPct;
        existing.actualGrams = actualGrams;
        existing.gramsDeducted = true;
      }
    } else {
      const targetSpool = state.spools.find(s => s.id === spoolId);
      if (targetSpool) {
        targetSpool.remainingWeight = Math.max(0, round1(targetSpool.remainingWeight - actualGrams));
      }

      state.prints.unshift({
        id: "print-" + Date.now(),
        cloudTaskId: "manual-" + Date.now(),
        filename,
        status,
        spoolId,
        spoolManuallyEdited: true,
        totalEstimatedGrams,
        progressPct,
        actualGrams,
        gramsDeducted: true,
        timestamp: Date.now()
      });
    }

    document.getElementById("modal-print").classList.add("hidden");
    await savePersistentState();
    renderAll();
    showToast(t("toastPrintSaved"), "success");
  });

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-close");
      document.getElementById(target).classList.add("hidden");
    });
  });

  async function syncMobileCloudNow() {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocalhost) return;

    const remoteBase = getConfiguredRemoteSyncUrl();
    const accountKey = getActiveAccountKey();
    if (!remoteBase || !state.auth.token || !accountKey) return;

    try {
      await loadPersistentState();
      const pushTs = state.updatedAt || Date.now();
      await postDbPayload(
        `${remoteBase}/api/data?account=${encodeURIComponent(accountKey)}`,
        accountKey,
        buildPersistentPayload(pushTs)
      );
      state.updatedAt = pushTs;
      renderAll();
    } catch {}
  }

  const btnMobileQr = document.getElementById("btn-mobile-qr");
  if (btnMobileQr) {
    btnMobileQr.addEventListener("click", () => {
      if (!state.auth.token) {
        showToast(t("errNotLoggedInQr"), "error");
        return;
      }
      renderMobileQrModal();
      document.getElementById("modal-mobile-qr").classList.remove("hidden");
      syncMobileCloudNow();
    });
  }
}

function round1(num) {
  return Math.round((Number(num) + Number.EPSILON) * 10) / 10;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
