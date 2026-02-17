/**
 * FLUX — Offline Sync Manager
 * ============================
 * Permet à l'application de fonctionner hors ligne
 * et de se synchroniser automatiquement à la reconnexion
 */

'use strict';

const OfflineSync = {
  QUEUE_KEY: 'flux_offline_queue',
  CACHE_KEY: 'flux_txn_cache',
  isOnline: navigator.onLine,
  syncCallback: null,

  /**
   * Initialiser le gestionnaire offline
   * @param {Function} onSync - Callback appelé après sync réussie
   */
  init(onSync) {
    this.syncCallback = onSync;
    this.listenNetwork();
    
    // Si en ligne au démarrage, essayer de synchroniser
    if (this.isOnline) {
      console.log('[OfflineSync] Démarrage en ligne');
    } else {
      console.log('[OfflineSync] Démarrage hors ligne - ' + this.getQueueLength() + ' opérations en attente');
    }
  },

  /**
   * Écouter les changements de réseau
   */
  listenNetwork() {
    window.addEventListener('online', () => {
      console.log('[OfflineSync] Connexion rétablie');
      this.isOnline = true;
      this.flushQueue();
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineSync] Connexion perdue');
      this.isOnline = false;
    });
  },

  /**
   * Ajouter une opération à la file d'attente
   * @param {string} type - 'add' ou 'delete'
   * @param {any} payload - Données de l'opération
   */
  enqueue(type, payload) {
    const queue = this.getQueue();
    queue.push({
      type,
      payload,
      _id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      _at: new Date().toISOString()
    });
    this.saveQueue(queue);
    console.log('[OfflineSync] Opération ajoutée à la file:', type);
  },

  /**
   * Exécuter toutes les opérations en file d'attente
   */
  async flushQueue() {
    const queue = this.getQueue();
    if (!queue.length) {
      console.log('[OfflineSync] File vide, rien à synchroniser');
      return;
    }

    console.log('[OfflineSync] Synchronisation de ' + queue.length + ' opérations...');

    // Traiter dans l'ordre FIFO
    const failed = [];
    for (const op of queue) {
      try {
        await this.executeOperation(op);
        console.log('[OfflineSync] ✓ Opération synchronisée:', op.type);
      } catch (err) {
        console.error('[OfflineSync] ✗ Échec synchronisation:', op, err);
        failed.push(op);
        // En cas d'échec, on arrête (le réseau est probablement retombé)
        break;
      }
    }

    // Sauvegarder seulement les opérations qui ont échoué
    this.saveQueue(failed);

    if (failed.length === 0) {
      console.log('[OfflineSync] ✓ Synchronisation terminée avec succès');
      if (this.syncCallback) this.syncCallback();
      // Mettre à jour le cache avec les dernières données
      await this.updateCache();
    } else {
      console.log('[OfflineSync] ⚠ ' + failed.length + ' opération(s) en attente');
    }
  },

  /**
   * Exécuter une opération individuelle
   */
  async executeOperation(op) {
    if (!window.apiCall) throw new Error('apiCall non disponible');
    
    if (op.type === 'add') {
      await window.apiCall({ 
        action: 'add', 
        payload: encodeURIComponent(JSON.stringify(op.payload)) 
      });
    } else if (op.type === 'delete') {
      await window.apiCall({ 
        action: 'delete', 
        id: op.payload 
      });
    } else {
      throw new Error('Type d\'opération inconnu: ' + op.type);
    }
  },

  /**
   * Mettre à jour le cache local avec les données du serveur
   */
  async updateCache() {
    try {
      if (!window.apiCall) return;
      const data = await window.apiCall({ action: 'getAll' });
      if (data.result === 'success' && data.transactions) {
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(data.transactions));
        console.log('[OfflineSync] Cache mis à jour: ' + data.transactions.length + ' transactions');
      }
    } catch (err) {
      console.error('[OfflineSync] Échec mise à jour cache:', err);
    }
  },

  /**
   * Obtenir le cache local
   * @returns {Array} Transactions en cache
   */
  getCache() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Sauvegarder dans le cache
   * @param {Array} transactions - Transactions à cacher
   */
  saveCache(transactions) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(transactions));
    } catch (e) {
      console.error('[OfflineSync] Échec sauvegarde cache:', e);
    }
  },

  /**
   * Obtenir la file d'attente
   * @returns {Array} Opérations en attente
   */
  getQueue() {
    try {
      const queued = localStorage.getItem(this.QUEUE_KEY);
      return queued ? JSON.parse(queued) : [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Sauvegarder la file d'attente
   * @param {Array} queue - Opérations à sauvegarder
   */
  saveQueue(queue) {
    try {
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('[OfflineSync] Échec sauvegarde file:', e);
    }
  },

  /**
   * Obtenir le nombre d'opérations en attente
   * @returns {number}
   */
  getQueueLength() {
    return this.getQueue().length;
  },

  /**
   * Vérifier si l'application est en ligne
   * @returns {boolean}
   */
  isOnlineNow() {
    return navigator.onLine;
  }
};

// Export pour app.js
window.OfflineSync = OfflineSync;
