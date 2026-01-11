const API_BASE = '/api'

async function fetchApi(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

export const api = {
  // SNPs
  searchSnps: (params) => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value)
      }
    })
    return fetchApi(`/snps?${searchParams}`)
  },

  getSnp: (rsid) => fetchApi(`/snps/${rsid}`),
  getSnpFull: (rsid) => fetchApi(`/snps/${rsid}/full`),
  getTags: () => fetchApi('/snps/meta/tags'),

  // Categories
  getCategories: () => fetchApi('/categories'),
  getChromosomes: () => fetchApi('/chromosomes'),
  getDashboard: () => fetchApi('/dashboard'),

  // Favorites
  getFavorites: () => fetchApi('/favorites'),
  addFavorite: (rsid) => fetchApi(`/favorites/${rsid}`, { method: 'POST' }),
  removeFavorite: (rsid) => fetchApi(`/favorites/${rsid}`, { method: 'DELETE' }),

  // Sync
  getSyncStatus: () => fetchApi('/sync/status'),
  startSync: () => fetchApi('/sync/start', { method: 'POST' }),
  fetchSingle: (rsid) => fetchApi(`/sync/fetch/${rsid}`, { method: 'POST' }),

  // Export
  getExportUrl: (format = 'json', annotatedOnly = true, favoritesOnly = false) => {
    const params = new URLSearchParams({
      format,
      annotated_only: annotatedOnly,
      favorites_only: favoritesOnly,
    })
    return `${API_BASE}/export?${params}`
  },

  // Health
  getHealth: () => fetchApi('/health'),

  // Chat
  sendChatMessage: (message, saveToKnowledge = true) =>
    fetchApi('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, save_to_knowledge: saveToKnowledge }),
    }),
  getChatHistory: (limit = 50) => fetchApi(`/chat/history?limit=${limit}`),
  clearChatHistory: () => fetchApi('/chat/history', { method: 'DELETE' }),
  getChatStatus: () => fetchApi('/chat/status'),
  explainSnp: (rsid) => fetchApi(`/chat/explain/${rsid}`, { method: 'POST' }),

  // Knowledge
  getKnowledge: (params = {}) => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value)
      }
    })
    return fetchApi(`/knowledge?${searchParams}`)
  },
  getKnowledgeEntry: (id) => fetchApi(`/knowledge/${id}`),
  updateKnowledge: (id, data) =>
    fetchApi(`/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteKnowledge: (id) => fetchApi(`/knowledge/${id}`, { method: 'DELETE' }),

  // Annotations
  getAnnotation: (rsid) => fetchApi(`/annotations/${rsid}`),
  improveAnnotation: (rsid, apply = true, instructions = null) =>
    fetchApi(`/annotations/${rsid}/improve`, {
      method: 'POST',
      body: JSON.stringify({ apply, instructions }),
    }),
  editAnnotation: (rsid, data) =>
    fetchApi(`/annotations/${rsid}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  revertAnnotation: (rsid) =>
    fetchApi(`/annotations/${rsid}/revert`, { method: 'POST' }),
  batchImproveAnnotations: (category, minMagnitude, limit = 10) =>
    fetchApi(`/annotations/batch-improve?${new URLSearchParams({
      ...(category && { category }),
      ...(minMagnitude && { min_magnitude: minMagnitude }),
      limit,
    })}`, { method: 'POST' }),

  // Natural Language Search
  naturalSearch: (query, saveToKnowledge = true) =>
    fetchApi('/search/natural', {
      method: 'POST',
      body: JSON.stringify({ query, save_to_knowledge: saveToKnowledge }),
    }),
  getSearchSuggestions: () => fetchApi('/search/suggestions'),
  quickSearch: (category, limit = 20) =>
    fetchApi(`/search/quick/${category}?limit=${limit}`),

  // Genotype Labels
  getAllLabels: () => fetchApi('/labels'),
  getLabel: (rsid) => fetchApi(`/labels/${rsid}`),
  setLabel: (rsid, data) =>
    fetchApi(`/labels/${rsid}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteLabel: (rsid) => fetchApi(`/labels/${rsid}`, { method: 'DELETE' }),
  searchByLabel: (label, limit = 50, offset = 0) =>
    fetchApi(`/labels/snps?label=${encodeURIComponent(label)}&limit=${limit}&offset=${offset}`),
  getLabelsBatch: (rsids) =>
    fetchApi('/labels/batch', {
      method: 'POST',
      body: JSON.stringify(rsids),
    }),
}
