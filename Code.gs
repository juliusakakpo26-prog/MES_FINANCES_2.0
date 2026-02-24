/**
 * FLUX — Budget App | Google Apps Script Backend
 * ================================================
 * Version : 2.0 — Multi-appareil, Source unique Google Sheets
 *
 * INSTRUCTIONS DE DÉPLOIEMENT (5 minutes) :
 * 1. Ouvrir script.google.com
 * 2. Créer un nouveau projet → nommer "Mes Finances"
 * 3. Coller ce code dans Code.gs (remplacer tout le contenu)
 * 4. Cliquer sur "Déployer" → "Nouvelle application Web"
 *    - Description      : Mes Finances v2
 *    - Exécuter en tant que : Moi
 *    - Accès            : Tout le monde
 * 5. Autoriser les permissions demandées
 * 6. Copier l'URL générée → la coller dans l'écran de connexion Mes Finances
 */

const SHEET_NAME     = 'Transactions';
const SPREADSHEET_ID = ''; // Vide = spreadsheet lié au script

const COL = { ID:1, DATE:2, INTITULE:3, MONTANT:4, TYPE:5, CATEGORIE:6, NOTE:7, TIMESTAMP:8, DIMES:9, EPARGNE:10 };
const DEFAULT_BUDGET_RULE = { dimesPct: 10, savingsPct: 30, expensesPct: 60 };

// ============ GET — Point d'entrée unique (contourne CORS) ============
// Toutes les actions passent par GET pour éviter les problèmes CORS liés
// aux redirections 302 de Apps Script sur les requêtes POST cross-origin.
// Les actions d'écriture reçoivent leurs données via le paramètre `payload`.
function doGet(e) {
  try {
    const params  = e.parameter || {};
    const action  = params.action || 'getAll';
    const payload = params.payload ? JSON.parse(decodeURIComponent(params.payload)) : {};
    let result;

    switch (action) {
      case 'getAll'    : result = getAllTransactions(params); break;
      case 'getSummary': result = getSummary(params); break;
      case 'getSheetMeta': result = getSheetMeta(); break;
      case 'ping'      : result = { status: 'ok', timestamp: new Date().toISOString(), version: '2.0' }; break;
      case 'add'       : result = addTransaction(payload); break;
      case 'delete'    : result = deleteTransaction(params.id); break;
      case 'update'    : result = updateTransaction(payload); break;
      case 'bulkImport': result = bulkImport(payload.transactions || []); break;
      case 'saveConfig': result = saveConfig(payload); break;
      case 'getConfig' : result = getConfig(); break;
      default          : result = { result: 'error', message: 'Action inconnue : ' + action };
    }
    return buildResponse(result);
  } catch(err) { return buildErrorResponse(err); }
}

// ============ POST ============
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || 'add';
    let result;
    switch (action) {
      case 'add'       : result = addTransaction(body); break;
      case 'delete'    : result = deleteTransaction(body.id); break;
      case 'update'    : result = updateTransaction(body); break;
      case 'bulkImport': result = bulkImport(body.transactions || []); break;
      default           : result = { result: 'error', message: 'Action inconnue : ' + action };
    }
    return buildResponse(result);
  } catch(err) { return buildErrorResponse(err); }
}

// ============ CRUD ============
function addTransaction(data) {
  const sheet = getOrCreateSheet();
  const v     = validateTransaction(data);
  if (!v.valid) return { result: 'error', message: v.message };

  const id        = data.id || generateId();
  const timestamp = data.timestamp || new Date().toISOString();

  const montant_ = parseFloat(data.montant);
  const rule     = getBudgetRuleFromConfig();
  const budget   = computeBudgetColumns(montant_, data.type, rule);
  const dimes_   = budget.dimes;
  const epargne_ = budget.epargne;
  sheet.appendRow([id, data.date, data.intitule, montant_, data.type, data.categorie, data.note || '', timestamp, dimes_, epargne_]);
  formatRow(sheet, sheet.getLastRow(), data.type);

  return { result: 'success', message: 'Transaction ajoutée', id: id };
}

function getAllTransactions(params) {
  const sheet = getOrCreateSheet();
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return { result: 'success', transactions: [], total: 0 };

  let transactions = data.slice(1).map(row => ({
    id        : String(row[COL.ID - 1]),
    date      : row[COL.DATE - 1] instanceof Date
                  ? Utilities.formatDate(row[COL.DATE - 1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
                  : String(row[COL.DATE - 1]),
    intitule  : row[COL.INTITULE  - 1],
    montant   : parseFloat(row[COL.MONTANT   - 1]) || 0,
    type      : row[COL.TYPE      - 1],
    categorie : row[COL.CATEGORIE - 1],
    note      : row[COL.NOTE      - 1] || '',
    timestamp : row[COL.TIMESTAMP - 1],
  })).filter(t => t.id && t.intitule);

  if (params.type)      transactions = transactions.filter(t => t.type === params.type);
  if (params.categorie) transactions = transactions.filter(t => t.categorie === params.categorie);
  if (params.month)     transactions = transactions.filter(t => String(t.date).startsWith(params.month));
  if (params.from)      transactions = transactions.filter(t => t.date >= params.from);
  if (params.to)        transactions = transactions.filter(t => t.date <= params.to);

  transactions.sort((a, b) => (b.date > a.date ? 1 : -1));
  return { result: 'success', transactions: transactions, total: transactions.length };
}

function getSummary(params) {
  const txns    = getAllTransactions(params).transactions;
  const income  = txns.filter(t => t.type === 'Entrée').reduce((s, t) => s + t.montant, 0);
  const expense = txns.filter(t => t.type === 'Dépense').reduce((s, t) => s + t.montant, 0);
  const byCategory = {};
  txns.forEach(t => {
    if (!byCategory[t.categorie]) byCategory[t.categorie] = { type: t.type, total: 0, count: 0 };
    byCategory[t.categorie].total += t.montant;
    byCategory[t.categorie].count++;
  });
  return { result: 'success', summary: { income, expense, balance: income - expense, savingsRate: income > 0 ? Math.round(((income-expense)/income)*100) : 0, count: txns.length, byCategory } };
}


function getSheetMeta() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  return {
    result: 'success',
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    sheetName: SHEET_NAME,
  };
}
function deleteTransaction(id) {
  if (!id) return { result: 'error', message: 'ID requis' };
  const sheet = getOrCreateSheet();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL.ID - 1]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { result: 'success', message: 'Transaction supprimée', id: id };
    }
  }
  return { result: 'error', message: 'Transaction non trouvée : ' + id };
}

function updateTransaction(data) {
  if (!data.id) return { result: 'error', message: 'ID requis' };
  const v = validateTransaction(data);
  if (!v.valid) return { result: 'error', message: v.message };
  const sheet     = getOrCreateSheet();
  const sheetData = sheet.getDataRange().getValues();
  const rule      = getBudgetRuleFromConfig();

  for (let i = 1; i < sheetData.length; i++) {
    if (String(sheetData[i][COL.ID - 1]) === String(data.id)) {
      const montant = parseFloat(data.montant);
      const budget  = computeBudgetColumns(montant, data.type, rule);
      sheet.getRange(i + 1, 1, 1, 10).setValues([[
        data.id,
        data.date,
        data.intitule,
        montant,
        data.type,
        data.categorie,
        data.note || '',
        new Date().toISOString(),
        budget.dimes,
        budget.epargne
      ]]);
      formatRow(sheet, i + 1, data.type);
      return { result: 'success', message: 'Transaction mise à jour', id: data.id };
    }
  }

  return { result: 'error', message: 'Transaction non trouvée' };
}
function bulkImport(transactions) {
  if (!Array.isArray(transactions) || !transactions.length) return { result: 'error', message: 'Tableau requis' };
  const sheet = getOrCreateSheet();
  const rule  = getBudgetRuleFromConfig();
  let added = 0, errors = 0;

  transactions.forEach(t => {
    try {
      const v = validateTransaction(t);
      if (v.valid) {
        const montant = parseFloat(t.montant);
        const budget  = computeBudgetColumns(montant, t.type, rule);
        sheet.appendRow([
          t.id || generateId(),
          t.date,
          t.intitule,
          montant,
          t.type,
          t.categorie,
          t.note || '',
          t.timestamp || new Date().toISOString(),
          budget.dimes,
          budget.epargne
        ]);
        added++;
      } else {
        errors++;
      }
    } catch(e) {
      errors++;
    }
  });

  return { result: 'success', message: added + ' importée(s), ' + errors + ' erreur(s)', added, errors };
}
// ============ HELPERS ============
function getOrCreateSheet() {
  const ss    = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NAME); initSheetHeaders(sheet); }
  return sheet;
}

function initSheetHeaders(sheet) {
  const headers = ['ID','Date','Intitulé','Montant','Type','Catégorie','Note','Timestamp','Dîmes (10%)','àÉpargne (30%)'];
  const range   = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]).setBackground('#4F46E5').setFontColor('#FFFFFF').setFontWeight('bold').setFontFamily('Google Sans');
  sheet.setFrozenRows(1);
  [120,110,200,120,90,150,200,180,120,120].forEach((w,i) => sheet.setColumnWidth(i+1, w));
  range.setBorder(null, null, true, null, null, null, '#E4E7EC', SpreadsheetApp.BorderStyle.SOLID);
}

function formatRow(sheet, rowNum, type) {
  sheet.getRange(rowNum, 1, 1, 8).setBackground(rowNum % 2 === 0 ? '#F8F9FE' : '#FFFFFF');
  sheet.getRange(rowNum, COL.MONTANT).setNumberFormat('#,##0');
  const cell = sheet.getRange(rowNum, COL.MONTANT);
  if (type === 'Dépense')      cell.setFontColor('#DC2626');
  else if (type === 'Entrée') cell.setFontColor('#059669');
}

function validateTransaction(data) {
  if (!data.date)                                      return { valid: false, message: 'Date requise' };
  if (!data.intitule || !String(data.intitule).trim()) return { valid: false, message: 'Intitulé requis' };
  if (!data.montant || parseFloat(data.montant) <= 0)  return { valid: false, message: 'Montant invalide' };
  if (!['Dépense','Entrée'].includes(data.type))      return { valid: false, message: 'Type invalide' };
  if (!data.categorie)                                 return { valid: false, message: 'Catégorie requise' };
  return { valid: true };
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

function buildResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function buildErrorResponse(err) {
  return ContentService.createTextOutput(JSON.stringify({ result: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
}

// ============ UTILITAIRES OPTIONNELS ============
function createDashboardSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dash = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard');
  dash.clear();
  dash.getRange('A1').setValue('📊 Mes Finances — Tableau de bord').setFontSize(16).setFontWeight('bold').setFontColor('#4F46E5');
  const formulas = [['Total Recettes','=SUMIF(Transactions!E:E,"Entrée",Transactions!D:D)'],['Total Dépenses','=SUMIF(Transactions!E:E,"Dépense",Transactions!D:D)'],['Solde Net','=B5-B6'],['Nb. Transactions','=COUNTA(Transactions!A:A)-1'],['Taux d\'épargne','=IF(B5>0,ROUND((B7/B5)*100,1)&"%","N/A")']];
  formulas.forEach((f,i) => { dash.getRange(4+i,1).setValue(f[0]); dash.getRange(4+i,2).setFormula(f[1]); });
  SpreadsheetApp.getUi().alert('ào. Dashboard créé !');
}

// ============ CONFIGURATION FINANCIÈRE ============
const CONFIG_SHEET_NAME = '_config';

function normalizeBudgetRule(rule) {
  const fallback = DEFAULT_BUDGET_RULE;
  if (!rule || typeof rule !== 'object') return { dimesPct: fallback.dimesPct, savingsPct: fallback.savingsPct, expensesPct: fallback.expensesPct };

  const d = parseInt(rule.dimesPct, 10);
  const s = parseInt(rule.savingsPct, 10);
  const e = parseInt(rule.expensesPct, 10);
  const valid = [d, s, e].every(v => !isNaN(v) && v >= 0 && v <= 100) && (d + s + e === 100);

  if (!valid) return { dimesPct: fallback.dimesPct, savingsPct: fallback.savingsPct, expensesPct: fallback.expensesPct };
  return { dimesPct: d, savingsPct: s, expensesPct: e };
}

function computeBudgetColumns(montant, type, rule) {
  const amount = parseFloat(montant) || 0;
  if (type !== 'Entrée') return { dimes: '', epargne: '' };

  const safeRule = normalizeBudgetRule(rule);
  return {
    dimes: Math.round(amount * (safeRule.dimesPct / 100)),
    epargne: Math.round(amount * (safeRule.savingsPct / 100)),
  };
}

function getConfigSheet_(ss, createIfMissing) {
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    sheet.hideSheet();
  }
  return sheet;
}

function readStoredConfig_(ss) {
  const sheet = getConfigSheet_(ss, false);
  if (!sheet) return null;

  const value = sheet.getRange('A1').getValue();
  if (!value || String(value).trim() === '') return null;

  try {
    return JSON.parse(String(value));
  } catch (err) {
    return null;
  }
}

function getBudgetRuleFromConfig() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const config = readStoredConfig_(ss);
  return normalizeBudgetRule(config ? config.budgetRule : null);
}

function recalculateBudgetColumns(rule) {
  const safeRule = normalizeBudgetRule(rule);
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { recalculatedRows: 0 };

  const rows = lastRow - 1;
  const data = sheet.getRange(2, 1, rows, 10).getValues();
  const values = data.map(row => {
    const type = String(row[COL.TYPE - 1] || '');
    const montant = parseFloat(row[COL.MONTANT - 1]) || 0;
    const budget = computeBudgetColumns(montant, type, safeRule);
    return [budget.dimes, budget.epargne];
  });

  sheet.getRange(2, COL.DIMES, rows, 2).setValues(values);
  return { recalculatedRows: rows };
}

function saveConfig(data) {
  try {
    const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getConfigSheet_(ss, true);

    const previousConfig = readStoredConfig_(ss) || {};
    const previousRule = normalizeBudgetRule(previousConfig.budgetRule);
    const nextRule = normalizeBudgetRule(data.budgetRule);

    const configData = {
      types: data.types || [],
      categories: data.categories || {},
      budgetRule: nextRule,
      updatedAt: new Date().toISOString()
    };

    sheet.getRange('A1').setValue(JSON.stringify(configData));

    const ruleChanged =
      previousRule.dimesPct !== nextRule.dimesPct ||
      previousRule.savingsPct !== nextRule.savingsPct ||
      previousRule.expensesPct !== nextRule.expensesPct;

    let recalculatedRows = 0;
    if (ruleChanged) {
      recalculatedRows = recalculateBudgetColumns(nextRule).recalculatedRows || 0;
    }

    return {
      result: 'success',
      message: 'Configuration sauvegardée',
      timestamp: configData.updatedAt,
      budgetRule: nextRule,
      ruleChanged: ruleChanged,
      recalculatedRows: recalculatedRows
    };
  } catch (err) {
    return { result: 'error', message: 'Erreur saveConfig: ' + err.toString() };
  }
}

function getConfig() {
  try {
    const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    const config = readStoredConfig_(ss);

    if (!config) {
      return { result: 'empty', message: 'Aucune configuration' };
    }

    config.budgetRule = normalizeBudgetRule(config.budgetRule);

    return {
      result: 'success',
      config: config,
      message: 'Configuration chargée'
    };
  } catch (err) {
    return { result: 'error', message: 'Erreur getConfig: ' + err.toString() };
  }
}
