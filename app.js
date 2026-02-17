/* =============================================
   FLUX — App Logic v2.0
   Architecture : Google Sheets comme source unique
   localStorage utilisé pour URL + préférences d'apparence
   ============================================= */

'use strict';

// ============ CONFIG ============
const CONFIG = {
  STORAGE_KEY: 'flux_script_url', // clé pour sauvegarder l'URL dans localStorage (URL seulement, pas les données)
  USER_DISPLAY_NAME_KEY: 'flux_user_display_name',
  APPEARANCE_THEME_KEY: 'flux_theme_mode',
  APPEARANCE_CONTRAST_KEY: 'flux_high_contrast',
  DEFAULT_THEME_MODE: 'dark',
  DEFAULT_HIGH_CONTRAST: false,

  CATEGORIES: {
    Dépense: [
      { value: 'Transport',              icon: '🚗' },
      { value: 'Toilettes',              icon: '🧴' },
      { value: 'Électricité',            icon: '💡' },
      { value: 'Loyer',                  icon: '🏠' },
      { value: 'Dettes',                 icon: '💳' },
      { value: 'Crédit de communication',icon: '📱' },
      { value: 'Dépenses courantes',     icon: '🛒' },
      { value: 'Urgences',               icon: '🚨' },
      { value: 'Loisirs',                icon: '🎭' },
      { value: 'Bonnes Œuvres',          icon: '🤝' },
      { value: 'Autres',                 icon: '📦' },
    ],
    Entrée: [
      { value: 'Salaire',                    icon: '💼' },
      { value: 'Vente / Prestation de service', icon: '🏪' },
      { value: 'Dons',                       icon: '🎁' },
      { value: 'Prêt',                       icon: '🤝' },
      { value: 'Autres',                     icon: '💰' },
    ],
  },

  CHART_COLORS: ['#4C6FFF','#00D68F','#FF4D6A','#FFB830','#9B59FF','#14B8A6','#F97316','#EC4899','#3B82F6','#6B7280'],
};

// ============ STATE ============
const state = {
  scriptUrl   : '',          // URL Apps Script de l'utilisateur
  sheetMeta   : { url: '', name: '', id: '', available: false },
  userProfile : { displayName: 'Mon Budget', initials: 'MB' },
  transactions: [],          // cache mémoire (chargé depuis Sheets)
  config      : null,        // configuration financière (types + catégories)
  loading     : false,
  currentType : 'Dépense',
  currentMonth: new Date().getMonth(),
  currentYear : new Date().getFullYear(),
  sortField   : 'date',
  sortDir     : 'desc',
  filters     : { search: '', type: '', category: '', month: '' },
  charts      : { donut: null, bar: null, line: null, savings: null },
  appearance  : {
    mode: CONFIG.DEFAULT_THEME_MODE,
    highContrast: CONFIG.DEFAULT_HIGH_CONTRAST,
    systemQuery: null,
    systemListener: null,
  },
};

// ============ UTILS ============
const $ = (id) => document.getElementById(id);
const fmt     = (n) => new Intl.NumberFormat('fr-FR').format(Math.abs(Math.round(n))) + ' FCFA';
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};
const monthKey   = (iso) => iso ? iso.substring(0, 7) : '';
const monthLabel = (y, m) => new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

function getCatIcon(catName, type) {
  if (window.FinanceConfig && state.config) {
    return FinanceConfig.getCatIcon(catName, type);
  }
  // Fallback to CONFIG.CATEGORIES
  const list  = CONFIG.CATEGORIES[type] || [...CONFIG.CATEGORIES.Dépense, ...CONFIG.CATEGORIES.Entrée];
  const found = list.find(c => c.value === catName);
  return found ? found.icon : (type === 'Entrée' ? '💰' : '📦');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ============ PERSISTANCE DE L'URL (localStorage — juste l'URL, pas les données) ============
function saveUrl(url) {
  try { localStorage.setItem(CONFIG.STORAGE_KEY, url); } catch(e) {}
}

function loadUrl() {
  try { return localStorage.getItem(CONFIG.STORAGE_KEY) || ''; } catch(e) { return ''; }
}

function safeGetLocalStorage(key, fallback = '') {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function safeSetLocalStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

function normalizeDisplayName(name) {
  const normalized = String(name || '').trim().replace(/\s+/g, ' ');
  return normalized || 'Mon Budget';
}

function loadDisplayName() {
  return normalizeDisplayName(
    safeGetLocalStorage(CONFIG.USER_DISPLAY_NAME_KEY, 'Mon Budget')
  );
}

function saveDisplayName(name) {
  safeSetLocalStorage(CONFIG.USER_DISPLAY_NAME_KEY, normalizeDisplayName(name));
}

function computeInitials(name) {
  try {
    if (!name || typeof name !== 'string') return 'MB';

    // Normaliser : supprimer accents et caractères spéciaux
    const cleanName = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!cleanName) return 'MB';

    const words = cleanName.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'MB';

    let initials = '';
    if (words.length >= 2) {
      // Prendre première lettre de chaque mot
      initials = (words[0][0] || '') + (words[1][0] || '');
    } else {
      // Un seul mot : prendre les 2 premières lettres
      initials = words[0].slice(0, 2);
    }

    // Nettoyer pour ne garder que lettres/chiffres
    initials = initials.replace(/[^A-Za-z0-9]/g, '');

    if (!initials) initials = 'MB';
    return initials.toUpperCase().slice(0, 2);
  } catch (e) {
    return 'MB'; // Sécurité absolue
  }
}
function renderUserProfileUi() {
  const name = state.userProfile.displayName || 'Mon Budget';
  const initials = state.userProfile.initials || 'MB';

  const sidebarName = $('sidebarUserDisplayName');
  const sidebarInitials = $('sidebarAvatarInitials');
  const settingsName = $('settingsUserDisplayName');
  const settingsInitials = $('settingsAvatarInitials');
  const heroAvatar = $('settingsAvatarLarge');
  const heroName = $('settingsProfileName');

  if (sidebarName) sidebarName.textContent = name;
  if (sidebarInitials) sidebarInitials.textContent = initials;
  if (settingsName) settingsName.textContent = name;
  if (settingsInitials) settingsInitials.textContent = initials;
  if (heroAvatar) heroAvatar.textContent = initials;
  if (heroName) heroName.textContent = name;
}

function applyUserProfile(name, persist = true) {
  const normalized = normalizeDisplayName(name);
  state.userProfile.displayName = normalized;
  state.userProfile.initials = computeInitials(normalized);
  if (persist) saveDisplayName(normalized);
  renderUserProfileUi();
}

function loadAppearancePrefs() {
  const modeRaw = safeGetLocalStorage(CONFIG.APPEARANCE_THEME_KEY, CONFIG.DEFAULT_THEME_MODE);
  const mode = ['light', 'dark', 'system'].includes(modeRaw) ? modeRaw : CONFIG.DEFAULT_THEME_MODE;
  const contrastRaw = safeGetLocalStorage(
    CONFIG.APPEARANCE_CONTRAST_KEY,
    CONFIG.DEFAULT_HIGH_CONTRAST ? '1' : '0'
  );

  return {
    mode,
    highContrast: contrastRaw === '1',
  };
}

function saveAppearancePrefs() {
  safeSetLocalStorage(CONFIG.APPEARANCE_THEME_KEY, state.appearance.mode);
  safeSetLocalStorage(CONFIG.APPEARANCE_CONTRAST_KEY, state.appearance.highContrast ? '1' : '0');
}

function getEffectiveTheme(mode = state.appearance.mode) {
  if (mode === 'light' || mode === 'dark') return mode;

  if (mode === 'system' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return CONFIG.DEFAULT_THEME_MODE;
}

function renderAppearanceControls() {
  document.querySelectorAll('.theme-option[data-theme-mode]').forEach(btn => {
    const isActive = btn.getAttribute('data-theme-mode') === state.appearance.mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const contrastBtn = $('settingsHighContrastToggle');
  if (contrastBtn) {
    contrastBtn.classList.toggle('active', state.appearance.highContrast);
    contrastBtn.setAttribute('aria-checked', state.appearance.highContrast ? 'true' : 'false');
  }
}

function applyAppearance() {
  const theme = getEffectiveTheme();
  document.documentElement.dataset.theme = theme;

  if (state.appearance.highContrast) document.documentElement.dataset.contrast = 'high';
  else delete document.documentElement.dataset.contrast;

  renderAppearanceControls();
}

function initAppearance() {
  const prefs = loadAppearancePrefs();
  state.appearance.mode = prefs.mode;
  state.appearance.highContrast = prefs.highContrast;
  applyAppearance();

  if (typeof window.matchMedia === 'function') {
    state.appearance.systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
    state.appearance.systemListener = () => {
      if (state.appearance.mode === 'system') applyAppearance();
    };

    if (typeof state.appearance.systemQuery.addEventListener === 'function') {
      state.appearance.systemQuery.addEventListener('change', state.appearance.systemListener);
    } else if (typeof state.appearance.systemQuery.addListener === 'function') {
      state.appearance.systemQuery.addListener(state.appearance.systemListener);
    }
  }
}

function setSheetMeta(meta = {}) {
  state.sheetMeta = {
    url: meta.url || '',
    name: meta.name || '',
    id: meta.id || '',
    available: Boolean(meta.available && meta.url),
  };
}

function updateSheetOpenUi() {
  const statusEl = $('settingsSheetStatus');
  const openBtn = $('btnOpenSheet');
  const tsEl = $('settingsSyncTimestamp');
  const tsText = $('settingsSyncTimeText');
  const lastSync = localStorage.getItem('flux_last_sync');

  if (statusEl) {
    if (!state.scriptUrl) {
      statusEl.textContent = 'Aucune Sheet connectée';
    } else if (state.sheetMeta.available) {
      statusEl.textContent = state.sheetMeta.name
        ? 'Sheet connectée : ' + state.sheetMeta.name
        : 'Sheet connectée';
    } else {
      statusEl.textContent = 'Lien du fichier indisponible';
    }
  }

  if (tsEl && tsText && lastSync) {
    tsEl.classList.remove('hidden');
    const diff = Math.round((Date.now() - new Date(lastSync)) / 60000);
    tsText.textContent = diff < 1 ? 'Synchronisé à l\'instant' : 'Synchronisé il y a ' + diff + ' min';
  } else if (tsEl) {
    tsEl.classList.add('hidden');
  }

  if (openBtn) {
    const enabled = state.sheetMeta.available && !!state.sheetMeta.url;
    openBtn.disabled = !enabled;
    openBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }
}

function updateSettingsSyncStatus() {
  updateSheetOpenUi();
}
// ============ APPS SCRIPT API ============
// Apps Script Web Apps renvoient une redirection 302 que fetch+CORS ne supporte pas en POST.
// Solution : tout passer en GET avec les paramètres encodés dans l'URL.
// Le backend doGet() gère toutes les actions via le paramètre `action`.

const API_TIMEOUT = 12000; // 12 secondes

async function apiCall(params = {}) {
  if (!state.scriptUrl) throw new Error('URL non configurée');

  // Construire la query string manuellement pour ne pas ré-encoder le payload
  // (payload est déjà encodé via encodeURIComponent avant d'arriver ici)
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    // Le payload est déjà encodé, les autres paramètres sont des strings simples
    parts.push(k + '=' + (k === 'payload' ? v : encodeURIComponent(v)));
  }
  const url = state.scriptUrl + (parts.length ? '?' + parts.join('&') : '');

  // Timeout avec AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal
    });

    if (!res.ok) throw new Error('Erreur réseau : ' + res.status);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch(e) {
      throw new Error('Réponse invalide du serveur. Vérifiez que le script est bien déployé.');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Délai dépassé (12s). Vérifiez votre connexion ou la taille de votre Sheet.');
    }
    if (err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Échec réseau. Vérifiez votre connexion Internet.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Export apiCall pour OfflineSync
window.apiCall = apiCall;

/** Charger toutes les transactions depuis Google Sheets */
async function fetchAllTransactions() {
  const data = await apiCall({ action: 'getAll' });
  if (data.result !== 'success') throw new Error(data.message || 'Erreur lors du chargement');
  return data.transactions || [];
}

/** Ajouter une transaction — payload JSON encodé dans l'URL */
async function apiAddTransaction(transaction) {
  const data = await apiCall({ action: 'add', payload: encodeURIComponent(JSON.stringify(transaction)) });
  if (data.result !== 'success') throw new Error(data.message || "Erreur lors de l'ajout");
  return data;
}

/** Supprimer une transaction */
async function apiDeleteTransaction(id) {
  const data = await apiCall({ action: 'delete', id: id });
  if (data.result !== 'success') throw new Error(data.message || 'Erreur lors de la suppression');
  return data;
}

/** Tester la connexion (ping) */
async function apiPing() {
  const data = await apiCall({ action: 'ping' });
  return data.status === 'ok';
}

async function apiGetSheetMeta() {
  const data = await apiCall({ action: 'getSheetMeta' });
  if (data.result !== 'success') throw new Error(data.message || 'Metadonnees Sheet indisponibles');
  return data;
}

async function refreshSheetMeta() {
  if (!state.scriptUrl) {
    setSheetMeta();
    updateSheetOpenUi();
    return false;
  }

  try {
    const data = await apiGetSheetMeta();
    setSheetMeta({
      url: data.spreadsheetUrl || '',
      name: data.spreadsheetName || '',
      id: data.spreadsheetId || '',
      available: Boolean(data.spreadsheetUrl),
    });
  } catch (err) {
    setSheetMeta();
  }

  updateSheetOpenUi();
  return state.sheetMeta.available;
}

// ============ ÉCRAN DE CONFIGURATION ============

function showSetupScreen() {
  $('setupScreen').classList.remove('hidden');
  $('appShell').classList.add('hidden');
}

function hideSetupScreen() {
  $('setupScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
}

function openSetupForUrlChange() {
  showSetupScreen();
  hideSetupError();
  $('inputScriptUrl').value = state.scriptUrl || loadUrl();
  const displayNameInput = $('inputDisplayName');
  if (displayNameInput) displayNameInput.value = state.userProfile.displayName || loadDisplayName();
}

function initSetup() {
  // Pré-remplir si URL déjà sauvegardée
  const savedUrl = loadUrl();
  if (savedUrl) $('inputScriptUrl').value = savedUrl;
  const displayNameInput = $('inputDisplayName');
  if (displayNameInput) displayNameInput.value = state.userProfile.displayName || loadDisplayName();

  $('btnConnect').addEventListener('click', handleConnect);
  $('btnChangeUrl').addEventListener('click', openSetupForUrlChange);

  // Permettre validation avec Entrée
  $('inputScriptUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConnect();
  });
  if (displayNameInput) {
    displayNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleConnect();
    });
  }
}

async function handleConnect() {
  const url = $('inputScriptUrl').value.trim();
  const displayNameInput = $('inputDisplayName');

  // Validation URL d'abord (fail-fast)
  if (!url) {
    showSetupError('Veuillez coller votre URL Apps Script.');
    return;
  }
  if (!url.startsWith('https://script.google.com/macros/s/') || !url.includes('/exec')) {
    showSetupError('URL invalide. Elle doit être de la forme https://script.google.com/macros/s/.../exec');
    return;
  }

  // Charger l'UI avant la requête réseau
  setConnectLoading(true);
  hideSetupError();

  try {
    // Appliquer le profil (non bloquant grâce au try/catch dans applyUserProfile)
    const displayName = displayNameInput ? displayNameInput.value.trim() : '';
    applyUserProfile(displayName || 'Mon Budget');

    state.scriptUrl = url;
    const ok = await apiPing();

    if (!ok) throw new Error('Le serveur ne répond pas correctement.');

    // Connexion réussie
    saveUrl(url);
    hideSetupScreen();
    await refreshSheetMeta();
    await loadAndRender();

  } catch (err) {
    state.scriptUrl = '';
    setSheetMeta();
    updateSheetOpenUi();
    showSetupError('Connexion impossible : ' + err.message + '\n\nVérifiez que l\'URL est correcte et que le script est bien déployé avec accès "Tout le monde".');
  } finally {
    setConnectLoading(false);
  }
}

function setConnectLoading(loading) {
  const btn = $('btnConnect');
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<svg class="spin" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="20 18"/></svg> Connexion...'
    : '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-link-2"></use></svg> Connecter mon Google Sheet';
}

function showSetupError(msg) {
  const el = $('setupError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideSetupError() {
  $('setupError').classList.add('hidden');
}

// ============ CHARGEMENT INITIAL ============

async function loadAndRender() {
  showGlobalLoader(true);
  try {
    // Charger la configuration financière d'abord
    if (window.FinanceConfig) {
      const loaded = await FinanceConfig.loadFromSheets();
      if (!loaded) {
        FinanceConfig.loadFromStorage();
      }
      updateFinanceConfigSubtitles();
    }
    
    state.transactions = await fetchAllTransactions();
    updateTxnBadge();
    refreshDashboard();
    refreshHistory();
    // Sauvegarder le cache après chargement réussi
    if (window.OfflineSync) {
      OfflineSync.saveCache(state.transactions);
      localStorage.setItem('flux_last_sync', new Date().toISOString());
    }
  } catch (err) {
    // Hors ligne : utiliser le cache
    if (window.OfflineSync) {
      const cached = OfflineSync.getCache();
      if (cached.length) {
        state.transactions = cached;
        updateTxnBadge();
        refreshDashboard();
        refreshHistory();
        console.log('[OfflineSync] Chargement depuis le cache:', cached.length, 'transactions');
      } else {
        showGlobalError('Aucune donnée en cache. Vérifiez votre connexion.');
      }
    } else {
      showGlobalError('Impossible de charger les données : ' + err.message);
    }
  } finally {
    showGlobalLoader(false);
  }
}

function showGlobalLoader(show) {
  $('globalLoader').classList.toggle('hidden', !show);
}

function showGlobalError(msg) {
  $('globalError').textContent = msg;
  $('globalError').classList.remove('hidden');
  setTimeout(() => $('globalError').classList.add('hidden'), 6000);
}

// ============ NAVIGATION ============
function initNavigation() {
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const view = el.getAttribute('data-view');
      if (view) navigateTo(view);
    });
  });

  $('mobileMenuBtn').addEventListener('click', toggleSidebar);
  $('overlay').addEventListener('click', closeSidebar);

  $('prevMonth').addEventListener('click', () => {
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    updateMonthLabel();
    refreshDashboard();
  });
  $('nextMonth').addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    updateMonthLabel();
    refreshDashboard();
  });
}

function initSettings() {
  document.querySelectorAll('.theme-option[data-theme-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-theme-mode');
      if (!['light', 'dark', 'system'].includes(mode)) return;
      state.appearance.mode = mode;
      saveAppearancePrefs();
      applyAppearance();
    });
  });

  const contrastBtn = $('settingsHighContrastToggle');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', () => {
      state.appearance.highContrast = !state.appearance.highContrast;
      saveAppearancePrefs();
      applyAppearance();
    });
  }

  const changeSheetBtn = $('btnSettingsChangeSheet');
  if (changeSheetBtn) {
    changeSheetBtn.addEventListener('click', openSetupForUrlChange);
  }

  const openSheetBtn = $('btnOpenSheet');
  if (openSheetBtn) {
    openSheetBtn.addEventListener('click', () => {
      if (!state.sheetMeta.available || !state.sheetMeta.url) return;
      window.open(state.sheetMeta.url, '_blank', 'noopener,noreferrer');
    });
  }

  // Logique d'édition du nom
  const btnEdit = $('btnEditName');
  const nameInput = $('settingsNameInput');
  const nameSpan = $('settingsProfileName');

  if (btnEdit && nameInput && nameSpan) {
    btnEdit.addEventListener('click', () => {
      nameInput.value = state.userProfile.displayName;
      nameSpan.classList.add('hidden');
      btnEdit.classList.add('hidden');
      nameInput.classList.remove('hidden');
      nameInput.focus();
    });

    const confirmEdit = () => {
      const val = nameInput.value.trim();
      if (val) applyUserProfile(val);
      nameInput.classList.add('hidden');
      nameSpan.classList.remove('hidden');
      btnEdit.classList.remove('hidden');
    };

    nameInput.addEventListener('blur', confirmEdit);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameInput.blur();
    });
  }

  renderUserProfileUi();
  renderAppearanceControls();
  updateSheetOpenUi();

  // Réinitialiser les icônes Lucide
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function refreshSettings() {
  renderUserProfileUi();
  renderAppearanceControls();
  updateSheetOpenUi();

  // Réinitialiser les icônes Lucide
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function navigateTo(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(l => l.classList.remove('active'));

  const view = document.getElementById('view-' + viewId);
  if (view) view.classList.add('active');

  document.querySelectorAll('[data-view="' + viewId + '"]').forEach(el => {
    if (el.classList.contains('nav-link') || el.classList.contains('mobile-nav-link')) {
      el.classList.add('active');
    }
  });

  const titles = {
    dashboard: 'Tableau de bord',
    add: 'Nouvelle opération',
    history: 'Historique',
    analytics: 'Statistiques',
    settings: 'Paramètres',
    types: 'Types de transactions',
    categories: 'Catégories'
  };
  $('topbarTitle').textContent = titles[viewId] || '';

  if (viewId === 'dashboard') refreshDashboard();
  if (viewId === 'history')   refreshHistory();
  if (viewId === 'analytics') refreshAnalytics();
  if (viewId === 'settings')  refreshSettings();
  if (viewId === 'types')     { renderTypesList(); updateFinanceConfigSubtitles(); }
  if (viewId === 'categories'){ renderCategoriesList(); updateFinanceConfigSubtitles(); }

  // Réinitialiser les icônes Lucide
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('visible');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('visible');
}

function updateMonthLabel() {
  $('monthLabel').textContent = monthLabel(state.currentYear, state.currentMonth);
}

function updateTxnBadge() {
  const badge = $('txnBadge');
  if (badge) badge.textContent = state.transactions.length;
}

// ============ FORMULAIRE ============
function initForm() {
  $('btnDepense').addEventListener('click', () => setType('Dépense'));
  $('btnRecette').addEventListener('click', () => setType('Entrée'));

  $('fieldDate').value = new Date().toISOString().split('T')[0];

  $('fieldIntitule').addEventListener('input', () => {
    $('charCount').textContent = $('fieldIntitule').value.length;
  });

  $('btnReset').addEventListener('click', resetForm);
  $('btnSubmit').addEventListener('click', handleSubmit);

  setType('Dépense');
}

function setType(type) {
  state.currentType = type;
  $('btnDepense').classList.toggle('active',        type === 'Dépense');
  $('btnRecette').classList.toggle('active',        type === 'Entrée');
  $('btnDepense').classList.toggle('expense-active',type === 'Dépense');
  $('btnDepense').classList.toggle('income-active', false);
  $('btnRecette').classList.toggle('income-active', type === 'Entrée');
  $('btnRecette').classList.toggle('expense-active',false);

  const sel = $('fieldCategorie');
  sel.innerHTML = '<option value="">— Sélectionner —</option>';
  
  // Utiliser state.config si disponible, sinon fallback CONFIG
  const categories = (state.config && state.config.categories) 
    ? state.config.categories[type] 
    : CONFIG.CATEGORIES[type];
  
  if (categories) {
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value       = cat.value;
      opt.textContent = cat.icon + ' ' + cat.value;
      sel.appendChild(opt);
    });
  }
}

function resetForm() {
  $('fieldDate').value      = new Date().toISOString().split('T')[0];
  $('fieldIntitule').value  = '';
  $('fieldMontant').value   = '';
  $('fieldCategorie').value = '';
  $('fieldNote').value      = '';
  $('charCount').textContent = '0';
  setType('Dépense');
  hideToast();
  document.querySelectorAll('.form-input').forEach(el => el.classList.remove('error'));
}

function validateForm() {
  const fields = ['fieldDate', 'fieldIntitule', 'fieldMontant', 'fieldCategorie'];
  let valid = true;
  fields.forEach(id => {
    const el      = $(id);
    const isEmpty = !el.value.trim() || (id === 'fieldMontant' && parseFloat(el.value) <= 0);
    el.classList.toggle('error', isEmpty);
    if (isEmpty) valid = false;
  });
  return valid;
}

async function handleSubmit() {
  if (!validateForm()) {
    showToast('error', '⚠️ Veuillez remplir tous les champs obligatoires.');
    return;
  }

  setLoading(true);

  const transaction = {
    id        : generateId(),
    date      : $('fieldDate').value,
    intitule  : $('fieldIntitule').value.trim(),
    montant   : parseFloat($('fieldMontant').value),
    type      : state.currentType,
    categorie : $('fieldCategorie').value,
    note      : $('fieldNote').value.trim(),
    timestamp : new Date().toISOString(),
  };

  try {
    await apiAddTransaction(transaction);

    // Mise à jour du cache mémoire (optimiste)
    state.transactions.unshift(transaction);
    updateTxnBadge();
    OfflineSync.saveCache(state.transactions);

    showToast('success', '✅ Opération enregistrée dans Google Sheets !');
    setTimeout(resetForm, 2200);

  } catch (err) {
    // Hors ligne : sauvegarder en file d'attente
    if (window.OfflineSync) {
      OfflineSync.enqueue('add', transaction);
      
      // Mise à jour locale quand même
      state.transactions.unshift(transaction);
      updateTxnBadge();
      OfflineSync.saveCache(state.transactions);
      
      showToast('success', '💾 Sauvegardé hors ligne, sera synchronisé à la reconnexion');
      setTimeout(resetForm, 2200);
    } else {
      showToast('error', '❌ Erreur : ' + err.message);
    }
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  $('btnSubmit').disabled = loading;
  $('btnSubmit').querySelector('.btn-text').classList.toggle('hidden', loading);
  $('btnSubmit').querySelector('.btn-spinner').classList.toggle('hidden', !loading);
}

function showToast(type, msg) {
  const toast = $('toast');
  toast.className = 'toast ' + type;
  $('toastMsg').textContent = msg;
  hideToast._timer && clearTimeout(hideToast._timer);
  hideToast._timer = setTimeout(hideToast, 5000);
}
function hideToast() { $('toast').className = 'toast hidden'; }

// ============ DASHBOARD ============
function getMonthTransactions() {
  const key = state.currentYear + '-' + String(state.currentMonth + 1).padStart(2, '0');
  return state.transactions.filter(t => monthKey(t.date) === key);
}

function refreshDashboard() {
  const txns   = getMonthTransactions();
  const income  = txns.filter(t => t.type === 'Entrée').reduce((s, t) => s + t.montant, 0);
  const expense = txns.filter(t => t.type === 'Dépense').reduce((s, t) => s + t.montant, 0);
  const balance = income - expense;

  $('kpiBalance').textContent       = (balance >= 0 ? '+' : '−') + ' ' + fmt(Math.abs(balance));
  $('kpiIncome').textContent        = fmt(income);
  $('kpiExpense').textContent       = fmt(expense);
  $('kpiIncomeCount').textContent   = txns.filter(t => t.type === 'Entrée').length + ' opération(s)';
  $('kpiExpenseCount').textContent  = txns.filter(t => t.type === 'Dépense').length + ' opération(s)';

  const pct = income > 0 ? Math.min(100, Math.round((balance / income) * 100)) : 0;
  $('kpiBalanceFill').style.width  = Math.max(0, pct) + '%';
  $('kpiBalanceTrend').textContent = income > 0 ? "Taux d'épargne : " + pct + '%' : 'Aucune recette ce mois';

  renderRecentTxns(txns.slice(0, 6));
  renderDonutChart(txns);
  renderBarChart();
}

function renderRecentTxns(txns) {
  const container = $('recentTxns');
  if (!txns.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Aucune opération ce mois</p><button class="btn-primary" data-view="add" style="margin-top:8px;font-size:0.8rem;padding:8px 16px">Ajouter</button></div>';
    container.querySelector('[data-view]')?.addEventListener('click', () => navigateTo('add'));
    return;
  }
  container.innerHTML = txns.map(t => `
    <div class="txn-item">
      <div class="txn-icon ${t.type === 'Dépense' ? 'expense' : 'income'}">${getCatIcon(t.categorie, t.type)}</div>
      <div class="txn-info">
        <div class="txn-name">${escHtml(t.intitule)}</div>
        <div class="txn-meta">${escHtml(t.categorie)} · ${fmtDate(t.date)}</div>
      </div>
      <div class="txn-amount ${t.type === 'Dépense' ? 'amount-red' : 'amount-green'}">
        ${t.type === 'Dépense' ? '−' : '+'} ${fmt(t.montant)}
      </div>
    </div>
  `).join('');
}

function renderDonutChart(txns) {
  const ctx     = $('donutChart').getContext('2d');
  const income  = txns.filter(t => t.type === 'Entrée').reduce((s, t) => s + t.montant, 0);
  const expense = txns.filter(t => t.type === 'Dépense').reduce((s, t) => s + t.montant, 0);
  const saved   = Math.max(0, income - expense);
  const pct     = income > 0 ? Math.round((saved / income) * 100) : 0;

  $('donutPct').textContent = pct + '%';

  const expCats = {};
  txns.filter(t => t.type === 'Dépense').forEach(t => { expCats[t.categorie] = (expCats[t.categorie] || 0) + t.montant; });
  const cats = Object.entries(expCats).sort((a, b) => b[1] - a[1]);
  if (saved > 0) cats.push(['Épargne', saved]);

  if (state.charts.donut) state.charts.donut.destroy();

  if (!cats.length) {
    $('donutLegend').innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted)">Aucune donnée</span>';
    return;
  }

  state.charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: cats.map(c => c[0]),
      datasets: [{ data: cats.map(c => c[1]), backgroundColor: cats.map((_, i) => CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length]), borderWidth: 2, borderColor: '#13172E', hoverOffset: 6 }],
    },
    options: {
      cutout: '74%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ' ' + fmt(ctx.raw) }, bodyFont: { family: 'Plus Jakarta Sans' }, backgroundColor: '#1E2340', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1 } },
      animation: { animateRotate: true, duration: 700 },
    },
  });

  $('donutLegend').innerHTML = cats.map((c, i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length]}"></div>
      <span class="legend-name">${escHtml(c[0])}</span>
      <span class="legend-val">${fmt(c[1])}</span>
    </div>
  `).join('');
}

function renderBarChart() {
  const ctx    = $('barChart').getContext('2d');
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(state.currentYear, state.currentMonth - i, 1);
    months.push({ key: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'), label: d.toLocaleDateString('fr-FR', { month: 'short' }) });
  }

  const incomes  = months.map(m => state.transactions.filter(t => monthKey(t.date) === m.key && t.type === 'Entrée').reduce((s, t) => s + t.montant, 0));
  const expenses = months.map(m => state.transactions.filter(t => monthKey(t.date) === m.key && t.type === 'Dépense').reduce((s, t) => s + t.montant, 0));

  if (state.charts.bar) state.charts.bar.destroy();
  state.charts.bar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Entrées',  data: incomes,  backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6, borderSkipped: false },
        { label: 'Dépenses', data: expenses, backgroundColor: 'rgba(76,111,255,0.7)',  borderRadius: 6, borderSkipped: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { font: { family: 'Plus Jakarta Sans', size: 11 }, color: '#8892B0', boxWidth: 10, boxHeight: 10, borderRadius: 3 } },
        tooltip: { backgroundColor: '#1E2340', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1, bodyFont: { family: 'Plus Jakarta Sans' }, callbacks: { label: (c) => ' ' + c.dataset.label + ' : ' + fmt(c.raw) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Plus Jakarta Sans', size: 11 }, color: '#4A5280' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { family: 'Plus Jakarta Sans', size: 11 }, color: '#4A5280', callback: (v) => fmt(v).replace(' FCFA','') } },
      },
    },
  });
}

// ============ HISTORIQUE ============
function getHistoryCategoriesByType(selectedType) {
  const configuredByType = {
    'Entrée': new Set((CONFIG.CATEGORIES['Entrée'] || []).map(c => c.value)),
    'Dépense': new Set((CONFIG.CATEGORIES['Dépense'] || []).map(c => c.value)),
  };

  const customByType = { 'Entrée': new Set(), 'Dépense': new Set() };
  state.transactions.forEach(t => {
    const type = t.type;
    const cat  = String(t.categorie || '').trim();
    if (!cat) return;
    if (type === 'Entrée' || type === 'Dépense') customByType[type].add(cat);
  });

  const mergedByType = {
    'Entrée': new Set([...configuredByType['Entrée'], ...customByType['Entrée']]),
    'Dépense': new Set([...configuredByType['Dépense'], ...customByType['Dépense']]),
  };

  const categories = (selectedType === 'Entrée' || selectedType === 'Dépense')
    ? [...mergedByType[selectedType]]
    : [...new Set([...mergedByType['Entrée'], ...mergedByType['Dépense']])];

  return categories.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

function refreshCategoryFilterOptions() {
  const typeSel      = $('filterType');
  const catSel       = $('filterCat');
  const selectedType = typeSel.value;
  const previousCat  = catSel.value;
  const categories   = getHistoryCategoriesByType(selectedType);

  catSel.innerHTML = '<option value="">Toutes catégories</option>';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    catSel.appendChild(opt);
  });

  if (previousCat && categories.includes(previousCat)) {
    catSel.value = previousCat;
    return false;
  }

  catSel.value = '';
  return previousCat !== '';
}

function initHistory() {
  ['filterSearch','filterCat','filterMonth'].forEach(id => {
    $(id).addEventListener('input',  applyFilters);
    $(id).addEventListener('change', applyFilters);
  });

  const typeSel = $('filterType');
  let lastTypeValue = typeSel.value;
  const handleTypeChange = () => {
    const nextTypeValue = typeSel.value;
    if (nextTypeValue === lastTypeValue) return;
    lastTypeValue = nextTypeValue;
    refreshCategoryFilterOptions();
    applyFilters();
  };
  typeSel.addEventListener('input', handleTypeChange);
  typeSel.addEventListener('change', handleTypeChange);

  document.querySelectorAll('.txn-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      if (state.sortField === field) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortField = field; state.sortDir = 'desc'; }
      applyFilters();
    });
  });

  // Bouton rafraîchir
  $('btnRefresh').addEventListener('click', async () => {
    $('btnRefresh').disabled = true;
    try {
      await loadAndRender();
      showToast('success', '✅ Données synchronisées avec Google Sheets !');
    } catch (err) {
      showToast('error', '❌ Échec de la synchronisation : ' + err.message);
    } finally {
      $('btnRefresh').disabled = false;
    }
  });
}

function refreshHistory() {
  const months  = [...new Set(state.transactions.map(t => monthKey(t.date)).filter(Boolean))].sort().reverse();
  const monthSel = $('filterMonth');
  const curMonth = monthSel.value;
  monthSel.innerHTML = '<option value="">Tous les mois</option>';
  months.forEach(m => {
    const [y, mo] = m.split('-');
    const opt = document.createElement('option');
    opt.value       = m;
    opt.textContent = new Date(parseInt(y), parseInt(mo)-1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    monthSel.appendChild(opt);
  });
  monthSel.value = curMonth;

  refreshCategoryFilterOptions();

  applyFilters();
}

function applyFilters() {
  const search = $('filterSearch').value.toLowerCase().trim();
  const type   = $('filterType').value;
  const cat    = $('filterCat').value;
  const month  = $('filterMonth').value;

  let txns = [...state.transactions];
  if (search) txns = txns.filter(t => t.intitule.toLowerCase().includes(search) || (t.note||'').toLowerCase().includes(search) || t.categorie.toLowerCase().includes(search));
  if (type)   txns = txns.filter(t => t.type === type);
  if (cat)    txns = txns.filter(t => t.categorie === cat);
  if (month)  txns = txns.filter(t => monthKey(t.date) === month);

  txns.sort((a, b) => {
    let va = a[state.sortField], vb = b[state.sortField];
    if (state.sortField === 'montant') { va = a.montant; vb = b.montant; }
    if (va < vb) return state.sortDir === 'asc' ? -1 : 1;
    if (va > vb) return state.sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const income  = txns.filter(t => t.type === 'Entrée').reduce((s, t) => s + t.montant, 0);
  const expense = txns.filter(t => t.type === 'Dépense').reduce((s, t) => s + t.montant, 0);
  $('filterResultCount').textContent = txns.length + ' résultat' + (txns.length > 1 ? 's' : '');
  $('filterIncomeSum').textContent   = 'Entrées : ' + fmt(income);
  $('filterExpenseSum').textContent  = 'Dépenses : ' + fmt(expense);
  $('filterBalance').textContent     = 'Solde : ' + (income - expense >= 0 ? '+' : '−') + fmt(Math.abs(income - expense));

  const tbody = $('txnTableBody');
  if (!txns.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row"><div class="empty-state"><div class="empty-icon">🔍</div><p>Aucun résultat</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = txns.map(t => `
    <tr>
      <td style="color:var(--text-secondary);font-size:0.8rem">${fmtDate(t.date)}</td>
      <td>
        <div style="font-weight:600">${escHtml(t.intitule)}</div>
        ${t.note ? '<div style="font-size:0.72rem;color:var(--text-muted)">' + escHtml(t.note) + '</div>' : ''}
      </td>
      <td><span class="cat-pill">${getCatIcon(t.categorie, t.type)} ${escHtml(t.categorie)}</span></td>
      <td><span class="type-badge ${t.type === 'Dépense' ? 'depense' : 'entree'}">${t.type}</span></td>
      <td class="amount-cell ${t.type === 'Dépense' ? 'depense' : 'entree'}">
        ${t.type === 'Dépense' ? '−' : '+'} ${fmt(t.montant)}
      </td>
      <td class="action-cell">
        <button class="btn-delete" data-id="${escHtml(t.id)}" title="Supprimer">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-trash-2"></use></svg>
        </button>
      </td>
    </tr>
  `).join('');

  // Attacher les events de suppression
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id));
  });
}

async function handleDelete(id) {
  if (!confirm('Supprimer cette transaction ? Cette action est irréversible.')) return;

  try {
    await apiDeleteTransaction(id);
    // Retirer du cache mémoire
    state.transactions = state.transactions.filter(t => t.id !== id);
    updateTxnBadge();
    applyFilters();
    refreshDashboard();
    OfflineSync.saveCache(state.transactions);
    showGlobalToast('success', '✅ Transaction supprimée.');
  } catch (err) {
    // Hors ligne : sauvegarder en file d'attente
    if (window.OfflineSync) {
      OfflineSync.enqueue('delete', id);
      
      // Retirer du cache mémoire quand même (offline-first)
      state.transactions = state.transactions.filter(t => t.id !== id);
      updateTxnBadge();
      applyFilters();
      refreshDashboard();
      OfflineSync.saveCache(state.transactions);
      
      showGlobalToast('success', '💾 Supprimé hors ligne, sera synchronisé à la reconnexion');
    } else {
      showGlobalToast('error', '❌ Suppression impossible : ' + err.message);
    }
  }
}

function showGlobalToast(type, msg) {
  // Réutilise le toast du formulaire si on est dessus, sinon affiche l'erreur globale
  showToast(type, msg);
}

// ============ ANALYTIQUES ============
function refreshAnalytics() {
  const txns   = state.transactions;
  const income  = txns.filter(t => t.type === 'Entrée').reduce((s, t) => s + t.montant, 0);
  const expense = txns.filter(t => t.type === 'Dépense').reduce((s, t) => s + t.montant, 0);
  const saved   = Math.max(0, income - expense);
  const rate    = income > 0 ? Math.round((saved / income) * 100) : 0;

  $('savingsRate').textContent = rate + '%';

  // Calculs dîmes et épargnes (10% et 30% des entrées)
  const totalEntrees   = txns.filter(t => t.type === 'Entrée').reduce((s, t) => s + t.montant, 0);
  const dimesAuto      = Math.round(totalEntrees * 0.10);
  const epargneAuto    = Math.round(totalEntrees * 0.30);
  const depensesMax    = Math.round(totalEntrees * 0.60);
  const depensesRatio  = totalEntrees > 0 ? Math.round((expense / totalEntrees) * 100) : 0;
  const depensesOk     = expense <= depensesMax;

  $('savingsBreakdown').innerHTML = `
    <div class="savings-row"><span class="savings-row-label">Total entrées</span><span class="savings-row-val amount-green">${fmt(income)}</span></div>
    <div class="savings-row"><span class="savings-row-label">Total dépenses</span><span class="savings-row-val amount-red">${fmt(expense)}</span></div>
    <div class="savings-row"><span class="savings-row-label">Solde net</span><span class="savings-row-val" style="color:var(--accent-2)">${fmt(saved)}</span></div>
    <div class="savings-row"><span class="savings-row-label">Transactions</span><span class="savings-row-val">${txns.length}</span></div>
  `;

  // Encadré discret dîmes / épargnes (visible uniquement ici)
  const diBlock = $('dimesEpargnesBlock');
  if (diBlock) {
    diBlock.innerHTML = `
      <div class="de-row">
        <span class="de-label">🙏 Dîmes recommandées <small>(10%)</small></span>
        <span class="de-val">${fmt(dimesAuto)}</span>
      </div>
      <div class="de-row">
        <span class="de-label">🏦 Épargne recommandée <small>(30%)</small></span>
        <span class="de-val">${fmt(epargneAuto)}</span>
      </div>
      <div class="de-row">
        <span class="de-label">💸 Budget dépenses <small>(60% max)</small></span>
        <span class="de-val ${depensesOk ? 'de-ok' : 'de-warn'}">${fmt(depensesMax)} <small>${depensesOk ? '✅ ' + depensesRatio + '%' : '⚠️ ' + depensesRatio + '%'}</small></span>
      </div>
    `;
  }

  const sCtx = $('savingsChart').getContext('2d');
  if (state.charts.savings) state.charts.savings.destroy();
  state.charts.savings = new Chart(sCtx, {
    type: 'doughnut',
    data: { datasets: [{ data: [saved||0.001, expense||0.001], backgroundColor: ['#4C6FFF','rgba(255,255,255,0.05)'], borderWidth: 0 }] },
    options: { cutout: '82%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 700 } },
  });

  const expCats = {};
  txns.filter(t => t.type === 'Dépense').forEach(t => { expCats[t.categorie] = (expCats[t.categorie]||0) + t.montant; });
  const topExp = Object.entries(expCats).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxExp = topExp[0]?.[1] || 1;

  $('topExpenses').innerHTML = topExp.length ? topExp.map(([cat,val],i) => `
    <div class="top-item">
      <div class="top-rank">#${i+1}</div>
      <div class="top-bar-wrap">
        <div class="top-bar-label">${getCatIcon(cat,'Dépense')} ${escHtml(cat)}</div>
        <div class="top-bar-track"><div class="top-bar-fill expense" style="width:${(val/maxExp*100).toFixed(1)}%"></div></div>
      </div>
      <div class="top-val amount-red">−${fmt(val)}</div>
    </div>
  `).join('') : '<p style="font-size:0.8rem;color:var(--text-muted)">Aucune dépense</p>';

  const incCats = {};
  txns.filter(t => t.type === 'Entrée').forEach(t => { incCats[t.categorie] = (incCats[t.categorie]||0) + t.montant; });
  const topInc = Object.entries(incCats).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxInc = topInc[0]?.[1] || 1;

  $('topIncomes').innerHTML = topInc.length ? topInc.map(([cat,val],i) => `
    <div class="top-item">
      <div class="top-rank">#${i+1}</div>
      <div class="top-bar-wrap">
        <div class="top-bar-label">${getCatIcon(cat,'Entrée')} ${escHtml(cat)}</div>
        <div class="top-bar-track"><div class="top-bar-fill income" style="width:${(val/maxInc*100).toFixed(1)}%"></div></div>
      </div>
      <div class="top-val amount-green">+${fmt(val)}</div>
    </div>
  `).join('') : '<p style="font-size:0.8rem;color:var(--text-muted)">Aucune recette</p>';

  renderLineChart();
}

function renderLineChart() {
  const ctx    = $('lineChart').getContext('2d');
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(state.currentYear, state.currentMonth - i, 1);
    months.push({ key: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'), label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) });
  }

  const incomes  = months.map(m => state.transactions.filter(t => monthKey(t.date) === m.key && t.type === 'Entrée').reduce((s,t) => s+t.montant, 0));
  const expenses = months.map(m => state.transactions.filter(t => monthKey(t.date) === m.key && t.type === 'Dépense').reduce((s,t) => s+t.montant, 0));

  if (state.charts.line) state.charts.line.destroy();
  state.charts.line = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Entrées', data: incomes,  backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 5, borderSkipped: false, order: 2 },
        { label: 'Dépenses', data: expenses, backgroundColor: 'rgba(76,111,255,0.6)',   borderRadius: 5, borderSkipped: false, order: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'top', labels: { font: { family: 'Plus Jakarta Sans', size: 11 }, color: '#8892B0', boxWidth: 10, boxHeight: 10, borderRadius: 3 } },
        tooltip: { backgroundColor: '#1E2340', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1, bodyFont: { family: 'Plus Jakarta Sans' }, callbacks: { label: (c) => ' ' + c.dataset.label + ' : ' + fmt(c.raw) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: '#4A5280' } },
        y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: '#4A5280', callback: (v) => fmt(v).replace(' FCFA','') } },
      },
    },
  });
}

// ============ CONFIGURATION FINANCIÈRE ============
const CONFIG_ICONS = ['📊','📈','📉','💰','💳','💵','💸','🏦','🏪','💼','🎁','🤝','📱','🛒','🏠','💡','🚗','🚌','⛽','🍔','👕','💊','📚','🎬','🎮','✈️','🏥','🎓','⚡','📞'];

function updateFinanceConfigSubtitles() {
  if (!state.config) return;
  
  // Types subtitle
  const typesCount = state.config.types.length;
  const activeCount = state.config.types.filter(t => t.active).length;
  $('typesSubtitle').textContent = activeCount + '/' + typesCount + ' actifs';
  
  // Categories subtitle
  let catCount = 0;
  Object.values(state.config.categories || {}).forEach(list => {
    catCount += (list || []).length;
  });
  $('categoriesSubtitle').textContent = catCount + ' catégories';
}

function renderTypesList() {
  const container = $('typesList');
  if (!container || !state.config) return;
  
  container.innerHTML = state.config.types.map(type => `
    <div class="config-list-item">
      <div class="config-item-icon" style="background:${type.system ? 'rgba(76,111,255,0.12)' : 'rgba(255,184,48,0.12)'}">
        ${type.icon}
      </div>
      <div class="config-item-texts">
        <div class="config-item-title-row">
          <span class="config-item-title">${escHtml(type.label)}</span>
          <span class="config-item-badge ${type.system ? 'system' : 'perso'}">${type.system ? 'SYSTÈME' : 'PERSO'}</span>
        </div>
        <div class="config-item-description">${escHtml(type.description || 'Pas de description')}</div>
      </div>
      <div class="config-item-actions">
        ${!type.system ? `
          <button class="btn-icon-action" onclick="editType('${type.id}')" title="Modifier">
            <i data-lucide="pencil" class="lucide"></i>
          </button>
          <button class="btn-icon-action delete" onclick="deleteType('${type.id}')" title="Supprimer">
            <i data-lucide="trash-2" class="lucide"></i>
          </button>
        ` : ''}
        <button class="config-toggle ${type.active ? 'active' : ''}" onclick="toggleTypeActive('${type.id}')">
          <span class="config-toggle-thumb"></span>
        </button>
      </div>
    </div>
  `).join('');
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderCategoriesList() {
  const container = $('categoriesList');
  if (!container || !state.config) return;
  
  const html = [];
  Object.entries(state.config.categories).forEach(([typeName, cats]) => {
    if (!cats || !cats.length) return;
    
    html.push(`
      <div>
        <div class="config-group-label">${escHtml(typeName)}</div>
        <div class="config-list">
          ${cats.map(cat => `
            <div class="config-list-item">
              <div class="config-item-icon" style="background:rgba(0,214,143,0.12)">
                ${cat.icon}
              </div>
              <div class="config-item-texts">
                <div class="config-item-title">${escHtml(cat.value)}</div>
                <div class="config-item-description">${escHtml(cat.description || 'Pas de description')}</div>
              </div>
              <div class="config-item-actions">
                <button class="btn-icon-action" onclick="editCategory('${typeName}', '${cat.value}')" title="Modifier">
                  <i data-lucide="pencil" class="lucide"></i>
                </button>
                <button class="btn-icon-action delete" onclick="deleteCategory('${typeName}', '${cat.value}')" title="Supprimer">
                  <i data-lucide="trash-2" class="lucide"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `);
  });
  
  container.innerHTML = html.join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openTypeModal(typeId = null) {
  const modal = $('typeModalOverlay');
  const title = $('typeModalTitle');
  const editId = $('typeEditId');
  const nameInput = $('typeName');
  const descInput = $('typeDescription');
  const inReports = $('typeInReports');
  const inReportsGroup = $('typeInReportsGroup');
  const iconGrid = $('typeIconGrid');
  
  // Build icon grid
  iconGrid.innerHTML = CONFIG_ICONS.map(icon => 
    `<div class="config-icon-option" data-icon="${icon}">${icon}</div>`
  ).join('');
  
  let selectedIcon = CONFIG_ICONS[0];
  iconGrid.querySelectorAll('.config-icon-option').forEach(opt => {
    opt.addEventListener('click', () => {
      iconGrid.querySelectorAll('.config-icon-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedIcon = opt.dataset.icon;
    });
  });
  
  if (typeId) {
    // Edit mode
    const type = state.config.types.find(t => t.id === typeId);
    if (!type) return;
    
    title.textContent = 'Modifier le type';
    editId.value = typeId;
    nameInput.value = type.label;
    descInput.value = type.description || '';
    inReports.checked = type.inReports !== false;
    inReportsGroup.style.display = type.system ? 'none' : 'block';
    
    // Select icon
    const iconOpt = iconGrid.querySelector(`[data-icon="${type.icon}"]`);
    if (iconOpt) iconOpt.classList.add('selected');
  } else {
    // Create mode
    title.textContent = 'Créer un type';
    editId.value = '';
    nameInput.value = '';
    descInput.value = '';
    inReports.checked = true;
    inReportsGroup.style.display = 'block';
    iconGrid.querySelectorAll('.config-icon-option').forEach(o => o.classList.remove('selected'));
    iconGrid.firstElementChild?.classList.add('selected');
  }
  
  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeTypeModal() {
  $('typeModalOverlay').classList.add('hidden');
}

function saveTypeModal() {
  const editId = $('typeEditId').value;
  const name = $('typeName').value.trim();
  const desc = $('typeDescription').value.trim();
  const inReports = $('typeInReports').checked;
  const icon = $('typeIconGrid').querySelector('.config-icon-option.selected')?.dataset.icon || CONFIG_ICONS[0];
  
  if (!name) {
    showToast('error', 'Le nom est obligatoire');
    return;
  }
  
  if (editId) {
    // Update existing
    FinanceConfig.updateType(editId, { label: name, icon, description: desc, inReports });
  } else {
    // Create new
    FinanceConfig.addType(name, icon, desc, inReports);
  }
  
  FinanceConfig.saveToSheets();
  renderTypesList();
  updateFinanceConfigSubtitles();
  closeTypeModal();
  showToast('success', 'Type enregistré');
}

function openCategoryModal(typeName = null, catValue = null) {
  const modal = $('categoryModalOverlay');
  const title = $('categoryModalTitle');
  const editType = $('categoryEditType');
  const editValue = $('categoryEditValue');
  const typeSelect = $('categoryType');
  const nameInput = $('categoryName');
  const descInput = $('categoryDescription');
  const iconGrid = $('categoryIconGrid');
  
  // Build type select
  typeSelect.innerHTML = state.config.types.filter(t => t.active).map(t => 
    `<option value="${escHtml(t.label)}">${t.icon} ${escHtml(t.label)}</option>`
  ).join('');
  
  // Build icon grid
  iconGrid.innerHTML = CONFIG_ICONS.map(icon => 
    `<div class="config-icon-option" data-icon="${icon}">${icon}</div>`
  ).join('');
  
  let selectedIcon = CONFIG_ICONS[0];
  iconGrid.querySelectorAll('.config-icon-option').forEach(opt => {
    opt.addEventListener('click', () => {
      iconGrid.querySelectorAll('.config-icon-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedIcon = opt.dataset.icon;
    });
  });
  
  if (typeName && catValue) {
    // Edit mode
    const cat = state.config.categories[typeName]?.find(c => c.value === catValue);
    if (!cat) return;
    
    title.textContent = 'Modifier la catégorie';
    editType.value = typeName;
    editValue.value = catValue;
    typeSelect.value = typeName;
    typeSelect.disabled = true;
    nameInput.value = cat.value;
    descInput.value = cat.description || '';
    
    const iconOpt = iconGrid.querySelector(`[data-icon="${cat.icon}"]`);
    if (iconOpt) iconOpt.classList.add('selected');
  } else {
    // Create mode
    title.textContent = 'Ajouter une catégorie';
    editType.value = '';
    editValue.value = '';
    typeSelect.disabled = false;
    nameInput.value = '';
    descInput.value = '';
    iconGrid.querySelectorAll('.config-icon-option').forEach(o => o.classList.remove('selected'));
    iconGrid.firstElementChild?.classList.add('selected');
  }
  
  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeCategoryModal() {
  $('categoryModalOverlay').classList.add('hidden');
}

function saveCategoryModal() {
  const editType = $('categoryEditType').value;
  const editValue = $('categoryEditValue').value;
  const typeName = $('categoryType').value;
  const name = $('categoryName').value.trim();
  const desc = $('categoryDescription').value.trim();
  const icon = $('categoryIconGrid').querySelector('.config-icon-option.selected')?.dataset.icon || CONFIG_ICONS[0];
  
  if (!name) {
    showToast('error', 'Le nom est obligatoire');
    return;
  }
  
  if (editType && editValue) {
    // Update existing
    if (editType !== typeName) {
      // Type changed - delete from old, add to new
      FinanceConfig.deleteCategory(editType, editValue);
      FinanceConfig.addCategory(typeName, name, icon, desc);
    } else {
      FinanceConfig.updateCategory(typeName, editValue, { value: name, icon, description: desc });
    }
  } else {
    // Create new
    FinanceConfig.addCategory(typeName, name, icon, desc);
  }
  
  FinanceConfig.saveToSheets();
  renderCategoriesList();
  updateFinanceConfigSubtitles();
  closeCategoryModal();
  showToast('success', 'Catégorie enregistrée');
}

// Global functions for onclick handlers
window.editType = (id) => openTypeModal(id);
window.deleteType = (id) => {
  if (confirm('Supprimer ce type ? Les catégories associées seront aussi supprimées.')) {
    FinanceConfig.deleteType(id);
    FinanceConfig.saveToSheets();
    renderTypesList();
    updateFinanceConfigSubtitles();
    showToast('success', 'Type supprimé');
  }
};
window.toggleTypeActive = (id) => {
  const type = state.config.types.find(t => t.id === id);
  if (type) {
    type.active = !type.active;
    FinanceConfig.saveToStorage();
    FinanceConfig.saveToSheets();
    renderTypesList();
    updateFinanceConfigSubtitles();
  }
};
window.editCategory = (type, value) => openCategoryModal(type, value);
window.deleteCategory = (type, value) => {
  if (confirm('Supprimer cette catégorie ?')) {
    FinanceConfig.deleteCategory(type, value);
    FinanceConfig.saveToSheets();
    renderCategoriesList();
    updateFinanceConfigSubtitles();
    showToast('success', 'Catégorie supprimée');
  }
};

function initFinanceConfig() {
  // Navigation buttons
  $('btnGoTypes')?.addEventListener('click', () => navigateTo('types'));
  $('btnGoCategories')?.addEventListener('click', () => navigateTo('categories'));
  
  // Add buttons
  $('btnAddType')?.addEventListener('click', () => openTypeModal());
  $('btnAddCategory')?.addEventListener('click', () => openCategoryModal());
  
  // Type modal
  $('closeTypeModal')?.addEventListener('click', closeTypeModal);
  $('cancelTypeModal')?.addEventListener('click', closeTypeModal);
  $('saveTypeModal')?.addEventListener('click', saveTypeModal);
  
  // Category modal
  $('closeCategoryModal')?.addEventListener('click', closeCategoryModal);
  $('cancelCategoryModal')?.addEventListener('click', closeCategoryModal);
  $('saveCategoryModal')?.addEventListener('click', saveCategoryModal);
  
  // Close on overlay click
  $('typeModalOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('typeModalOverlay')) closeTypeModal();
  });
  $('categoryModalOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('categoryModalOverlay')) closeCategoryModal();
  });
  
  // Render lists
  renderTypesList();
  renderCategoriesList();
  updateFinanceConfigSubtitles();
}

// ============ EXPORT ============
function initExport() {
  const btn     = $('exportBtn');
  const dropdown = $('exportDropdown');

  // Ouvrir/fermer le menu
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Fermer si clic ailleurs
  document.addEventListener('click', () => dropdown.classList.remove('open'));

  $('exportOptCsv').addEventListener('click',   () => { exportCSV();   dropdown.classList.remove('open'); });
  $('exportOptExcel').addEventListener('click',  () => { exportExcel(); dropdown.classList.remove('open'); });
  $('exportOptPrint').addEventListener('click',  () => { exportPrint(); dropdown.classList.remove('open'); });

  // Bouton export en bas de la page Statistiques
  const btn2 = $('exportBtnStats');
  if (btn2) {
    const dropdown2 = $('exportDropdownStats');
    btn2.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown2.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown2.classList.remove('open'));
    $('exportOptCsvStats').addEventListener('click',   () => { exportCSV();   dropdown2.classList.remove('open'); });
    $('exportOptExcelStats').addEventListener('click',  () => { exportExcel(); dropdown2.classList.remove('open'); });
    $('exportOptPrintStats').addEventListener('click',  () => { exportPrint(); dropdown2.classList.remove('open'); });
  }
}

function exportCSV() {
  const headers = ['Date','Intitulé','Catégorie','Type','Montant (FCFA)','Note'];
  const rows    = state.transactions.map(t => [t.date, t.intitule, t.categorie, t.type, t.montant, t.note||'']);
  const csv     = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob    = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = 'mes-finances-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel() {
  // Export Excel via SheetJS (chargé dynamiquement)
  function doExport() {
    const wb   = XLSX.utils.book_new();
    const data = [
      ['Date','Intitulé','Catégorie','Type','Montant (FCFA)','Note','Dîmes (10%)','Épargne (30%)'],
      ...state.transactions.map(t => {
        const dime   = t.type === 'Entrée' ? Math.round(t.montant * 0.10) : '';
        const epargne = t.type === 'Entrée' ? Math.round(t.montant * 0.30) : '';
        return [t.date, t.intitule, t.categorie, t.type, t.montant, t.note||'', dime, epargne];
      })
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, 'mes-finances-' + new Date().toISOString().slice(0,10) + '.xlsx');
  }

  if (typeof XLSX !== 'undefined') {
    doExport();
  } else {
    const script  = document.createElement('script');
    script.src    = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = doExport;
    document.head.appendChild(script);
  }
}

function exportPrint() {
  // Préparer la vue impression de la page Statistiques
  navigateTo('analytics');
  setTimeout(() => window.print(), 400);
}

// ============ BOOT ============
async function init() {
  initAppearance();
  applyUserProfile(loadDisplayName(), false);
  initSetup();
  initNavigation();
  initForm();
  initHistory();
  initSettings();
  initFinanceConfig();
  initExport();
  updateMonthLabel();

  // Initialiser Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Initialiser Offline Sync
  if (window.OfflineSync) {
    OfflineSync.init(() => {
      // Callback appelé après sync réussie
      showToast('success', '✅ Données synchronisées avec Google Sheets !');
      // Rafraîchir les données après sync
      loadAndRender();
    });
  }

  // Vérifier si URL déjà configurée
  const savedUrl = loadUrl();
  if (savedUrl) {
    state.scriptUrl = savedUrl;
    hideSetupScreen();
    await refreshSheetMeta();
    await loadAndRender();
  } else {
    setSheetMeta();
    updateSheetOpenUi();
    showSetupScreen();
  }
}

document.addEventListener('DOMContentLoaded', init);
