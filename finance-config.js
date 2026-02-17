/**
 * FLUX — Finance Configuration Manager
 * =====================================
 * Gère les types et catégories de transactions
 * Synchronisation avec Google Sheets + localStorage
 */

'use strict';

const FinanceConfig = {
  STORAGE_KEY: 'flux_finance_config',
  
  // Configuration par défaut
  defaultConfig: {
    types: [
      { id: 'depense', label: 'Dépense', icon: '📉', system: true, active: true, inReports: true, description: 'Argent sorti' },
      { id: 'entree', label: 'Entrée', icon: '📈', system: true, active: true, inReports: true, description: 'Argent rentré' },
    ],
    categories: {
      Dépense: [
        { value: 'Transport', icon: '🚌', description: 'Bus, taxi, carburant' },
        { value: 'Toilettes', icon: '🧴', description: 'Produits d\'hygiène' },
        { value: 'Électricité', icon: '💡', description: 'Factures électricité' },
        { value: 'Loyer', icon: '🏠', description: 'Loyer et charges' },
        { value: 'Dettes', icon: '💳', description: 'Remboursements' },
        { value: 'Crédit de communication', icon: '📱', description: 'Forfaits téléphone' },
        { value: 'Dépenses courantes', icon: '🛒', description: 'Courses, alimentation' },
        { value: 'Urgences', icon: '🚨', description: 'Dépenses imprévues' },
        { value: 'Loisirs', icon: '🎭', description: 'Sorties, divertissements' },
        { value: 'Bonnes œuvres', icon: '🤝', description: 'Dons, charité' },
        { value: 'Autres', icon: '📦', description: 'Autres dépenses' },
      ],
      Entrée: [
        { value: 'Salaire', icon: '💼', description: 'Revenus du travail' },
        { value: 'Vente / Prestation de service', icon: '🏪', description: 'Revenus commerciaux' },
        { value: 'Dons', icon: '🎁', description: 'Cadeaux reçus' },
        { value: 'Prêt', icon: '🤝', description: 'Argent prêté' },
        { value: 'Autres', icon: '💰', description: 'Autres revenus' },
      ],
    }
  },

  // Initialisation
  init() {
    this.loadFromStorage();
  },

  // Charger depuis localStorage
  loadFromStorage() {
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      if (cached) {
        state.config = JSON.parse(cached);
        console.log('[FinanceConfig] Chargé depuis localStorage');
      } else {
        state.config = JSON.parse(JSON.stringify(this.defaultConfig));
        console.log('[FinanceConfig] Configuration par défaut utilisée');
      }
    } catch (e) {
      state.config = JSON.parse(JSON.stringify(this.defaultConfig));
      console.error('[FinanceConfig] Erreur chargement:', e);
    }
  },

  // Sauvegarder dans localStorage
  saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state.config));
      console.log('[FinanceConfig] Sauvegardé dans localStorage');
    } catch (e) {
      console.error('[FinanceConfig] Erreur sauvegarde:', e);
    }
  },

  // Sauvegarder sur Google Sheets
  async saveToSheets() {
    try {
      if (!window.apiCall) throw new Error('apiCall non disponible');
      const result = await window.apiCall({
        action: 'saveConfig',
        payload: encodeURIComponent(JSON.stringify(state.config))
      });
      
      if (result.result === 'success') {
        this.saveToStorage();
        console.log('[FinanceConfig] Synchronisé avec Google Sheets');
        return true;
      } else {
        throw new Error(result.message || 'Erreur saveConfig');
      }
    } catch (err) {
      console.error('[FinanceConfig] Échec sync Sheets:', err);
      this.saveToStorage(); // Fallback localStorage
      return false;
    }
  },

  // Charger depuis Google Sheets
  async loadFromSheets() {
    try {
      if (!window.apiCall) throw new Error('apiCall non disponible');
      const result = await window.apiCall({ action: 'getConfig' });
      
      if (result.result === 'success' && result.config) {
        state.config = result.config;
        this.saveToStorage();
        console.log('[FinanceConfig] Chargé depuis Google Sheets');
        return true;
      } else {
        console.log('[FinanceConfig] Aucune config sur Sheets, fallback localStorage');
        return false;
      }
    } catch (err) {
      console.error('[FinanceConfig] Échec chargement Sheets:', err);
      return false;
    }
  },

  // Obtenir les types actifs
  getActiveTypes() {
    return state.config.types.filter(t => t.active);
  },

  // Obtenir les catégories pour un type
  getCategoriesForType(typeLabel) {
    return state.config.categories[typeLabel] || [];
  },

  // Obtenir une icône de catégorie
  getCatIcon(catName, type) {
    const list = this.getCategoriesForType(type);
    const found = list.find(c => c.value === catName);
    return found ? found.icon : (type === 'Entrée' ? '💰' : '📦');
  },

  // Ajouter un type custom
  addType(label, icon, description, inReports = true) {
    const newType = {
      id: label.toLowerCase().replace(/\s+/g, '_'),
      label,
      icon,
      system: false,
      active: true,
      inReports,
      description
    };
    state.config.types.push(newType);
    
    // Créer la liste de catégories vide pour ce type
    if (!state.config.categories[label]) {
      state.config.categories[label] = [];
    }
    
    this.saveToStorage();
    return newType;
  },

  // Modifier un type custom
  updateType(id, updates) {
    const type = state.config.types.find(t => t.id === id);
    if (type && !type.system) {
      Object.assign(type, updates);
      this.saveToStorage();
      return true;
    }
    return false;
  },

  // Supprimer un type custom
  deleteType(id) {
    const index = state.config.types.findIndex(t => t.id === id);
    if (index !== -1 && !state.config.types[index].system) {
      const label = state.config.types[index].label;
      state.config.types.splice(index, 1);
      
      // Supprimer aussi les catégories associées
      delete state.config.categories[label];
      
      this.saveToStorage();
      return true;
    }
    return false;
  },

  // Ajouter une catégorie
  addCategory(typeLabel, value, icon, description) {
    if (!state.config.categories[typeLabel]) {
      state.config.categories[typeLabel] = [];
    }
    
    const newCat = { value, icon, description };
    state.config.categories[typeLabel].push(newCat);
    this.saveToStorage();
    return newCat;
  },

  // Modifier une catégorie
  updateCategory(typeLabel, oldValue, updates) {
    const list = state.config.categories[typeLabel];
    if (list) {
      const cat = list.find(c => c.value === oldValue);
      if (cat) {
        Object.assign(cat, updates);
        this.saveToStorage();
        return true;
      }
    }
    return false;
  },

  // Supprimer une catégorie
  deleteCategory(typeLabel, value) {
    const list = state.config.categories[typeLabel];
    if (list) {
      const index = list.findIndex(c => c.value === value);
      if (index !== -1) {
        list.splice(index, 1);
        this.saveToStorage();
        return true;
      }
    }
    return false;
  }
};

// Export global
window.FinanceConfig = FinanceConfig;
