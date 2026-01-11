import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Routes, Route, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import { useFavorites } from './hooks/useFavorites'
import { useChat } from './hooks/useChat'

import { SearchBar } from './components/SearchBar'
import { SnpList } from './components/SnpList'
import { SnpDetailPanel } from './components/SnpDetailPanel'
import { CategoryFilter } from './components/CategoryFilter'
import { ChromosomeBrowser } from './components/ChromosomeBrowser'
import { RiskDashboard } from './components/RiskDashboard'
import { FavoritesList } from './components/FavoritesList'
import { SyncStatus } from './components/SyncStatus'
import { DarkModeToggle } from './components/DarkModeToggle'
import { ExportButton } from './components/ExportButton'
import { ChatPanel } from './components/ChatPanel'
import DataLogViewer from './components/DataLogViewer'
import GenomeQuery from './components/GenomeQuery'
import QueryHistory from './components/QueryHistory'
import { SnpFullPage } from './components/SnpFullPage'
import { LabelFilterPanel } from './components/LabelFilterPanel'
import { TagFilter } from './components/TagFilter'

const TABS = {
  DASHBOARD: 'dashboard',
  QUERY: 'query',
  HISTORY: 'history',
  BROWSE: 'browse',
  DATA: 'data',
  FAVORITES: 'favorites',
}

// Map URL paths to tab names
const pathToTab = {
  '/': TABS.DASHBOARD,
  '/dashboard': TABS.DASHBOARD,
  '/query': TABS.QUERY,
  '/history': TABS.HISTORY,
  '/browse': TABS.BROWSE,
  '/data': TABS.DATA,
  '/favorites': TABS.FAVORITES,
}

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  // Get active tab from URL path
  const activeTab = useMemo(() => {
    const path = location.pathname
    // Check if we're on a SNP full page
    if (path.startsWith('/snp/')) return null
    return pathToTab[path] || TABS.DASHBOARD
  }, [location.pathname])

  // Get selected SNP from query param
  const selectedSnp = searchParams.get('snp')

  // Initialize search from URL query param if present, or restore from sessionStorage
  const urlTag = searchParams.get('tag')
  const [search, setSearch] = useState(() => {
    if (urlTag) return `tag:${urlTag}`
    return sessionStorage.getItem('browseSearch') || ''
  })
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const saved = sessionStorage.getItem('browseCategories')
    try {
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [selectedChromosome, setSelectedChromosome] = useState(() => {
    return sessionStorage.getItem('browseChromosome') || null
  })
  const [selectedLabel, setSelectedLabel] = useState(() => {
    return sessionStorage.getItem('browseLabel') || null
  })
  const [offset, setOffset] = useState(() => {
    // If URL has a tag param, start fresh
    if (urlTag) return 0
    const saved = sessionStorage.getItem('browseOffset')
    return saved ? parseInt(saved, 10) : 0
  })
  const [allResults, setAllResults] = useState(() => {
    // If URL has a tag param, start fresh - don't restore old results
    if (urlTag) return []
    const saved = sessionStorage.getItem('browseResults')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return []
      }
    }
    return []
  })
  const [savedHasMore, setSavedHasMore] = useState(() => {
    const saved = sessionStorage.getItem('browseHasMore')
    return saved === 'true'
  })
  const [savedTotal, setSavedTotal] = useState(() => {
    const saved = sessionStorage.getItem('browseTotal')
    return saved ? parseInt(saved, 10) : 0
  })

  // Track if we restored browse state from sessionStorage (to prevent clearing/refetching on mount)
  // BUT if there's a tag param in URL, don't skip - we want to do a new search
  const [skipInitialFetch, setSkipInitialFetch] = useState(() => {
    // If URL has a tag param, always do a fresh search
    if (urlTag) {
      return false
    }
    const saved = sessionStorage.getItem('browseResults')
    try {
      return saved ? JSON.parse(saved).length > 0 : false
    } catch {
      return false
    }
  })

  // Persist browse state to sessionStorage
  // Only save results if we have actual data (to prevent clearing on unmount race conditions)
  useEffect(() => {
    sessionStorage.setItem('browseSearch', search)
    sessionStorage.setItem('browseCategories', JSON.stringify(selectedCategories))
    sessionStorage.setItem('browseOffset', offset.toString())
    sessionStorage.setItem('browseHasMore', savedHasMore.toString())
    sessionStorage.setItem('browseTotal', savedTotal.toString())

    if (selectedChromosome) {
      sessionStorage.setItem('browseChromosome', selectedChromosome)
    } else {
      sessionStorage.removeItem('browseChromosome')
    }

    if (selectedLabel) {
      sessionStorage.setItem('browseLabel', selectedLabel)
    } else {
      sessionStorage.removeItem('browseLabel')
    }

    // Only save results if we have data - prevents clearing on unmount
    if (allResults.length > 0) {
      sessionStorage.setItem('browseResults', JSON.stringify(allResults))
    }
  }, [search, selectedCategories, selectedChromosome, selectedLabel, offset, allResults, savedHasMore, savedTotal])

  // Update search when tag query param changes (e.g., navigating from full page)
  useEffect(() => {
    const tagParam = searchParams.get('tag')
    if (tagParam) {
      setSearch(`tag:${tagParam}`)
      setSelectedLabel(null)
      setSelectedCategories([])
      setSelectedChromosome(null)
      // Clear tag from URL to avoid stale state
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('tag')
      setSearchParams(newParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // GenomeQuery state (persists across tab switches and navigation)
  // Restore from sessionStorage on mount
  const [genomeQueryText, setGenomeQueryText] = useState(() => {
    return sessionStorage.getItem('genomeQueryText') || ''
  })
  const [genomeQueryLoading, setGenomeQueryLoading] = useState(() => {
    // Restore loading state, but with a timeout check
    const savedLoading = sessionStorage.getItem('genomeQueryLoading')
    const savedTimestamp = sessionStorage.getItem('genomeQueryStarted')
    if (savedLoading === 'true' && savedTimestamp) {
      // If query started more than 2 minutes ago, assume it failed
      const elapsed = Date.now() - parseInt(savedTimestamp, 10)
      if (elapsed < 120000) {
        return true
      }
    }
    return false
  })
  const [genomeQueryResults, setGenomeQueryResults] = useState(() => {
    const saved = sessionStorage.getItem('genomeQueryResults')
    return saved ? JSON.parse(saved) : null
  })
  const [genomeQueryError, setGenomeQueryError] = useState(null)

  // Persist query state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('genomeQueryText', genomeQueryText)
  }, [genomeQueryText])

  useEffect(() => {
    sessionStorage.setItem('genomeQueryLoading', genomeQueryLoading.toString())
    if (genomeQueryLoading) {
      sessionStorage.setItem('genomeQueryStarted', Date.now().toString())
    }
  }, [genomeQueryLoading])

  useEffect(() => {
    if (genomeQueryResults) {
      sessionStorage.setItem('genomeQueryResults', JSON.stringify(genomeQueryResults))
    } else {
      sessionStorage.removeItem('genomeQueryResults')
    }
  }, [genomeQueryResults])

  const { toggleFavorite } = useFavorites()
  const chat = useChat()

  // Check if Claude is configured
  const { data: chatStatus } = useQuery({
    queryKey: ['chatStatus'],
    queryFn: api.getChatStatus,
    staleTime: Infinity,
  })

  // Parse tag: prefix from search box
  const parsedSearch = useMemo(() => {
    if (search.toLowerCase().startsWith('tag:')) {
      return { searchText: undefined, tagFromSearch: search.slice(4).trim() }
    }
    return { searchText: search || undefined, tagFromSearch: undefined }
  }, [search])

  // Build search params for traditional browse
  // Tag from search box (tag:X syntax) is used for tag filtering
  const browseSearchParams = {
    search: parsedSearch.searchText,
    category: selectedCategories[0] || undefined,
    chromosome: selectedChromosome || undefined,
    tag: parsedSearch.tagFromSearch || undefined,
    limit: 50,
    offset,
  }

  // Regular SNP search (when no label filter)
  const { data: regularData, isLoading: regularLoading, isFetching: regularFetching } = useQuery({
    queryKey: ['snps', browseSearchParams],
    queryFn: () => api.searchSnps(browseSearchParams),
    enabled: activeTab === TABS.BROWSE && !selectedLabel && !skipInitialFetch,
  })

  // Label-filtered search
  const { data: labelData, isLoading: labelLoading, isFetching: labelFetching } = useQuery({
    queryKey: ['snps-by-label', selectedLabel, offset],
    queryFn: () => api.searchByLabel(selectedLabel, 50, offset),
    enabled: activeTab === TABS.BROWSE && !!selectedLabel && !skipInitialFetch,
  })

  // Use the appropriate data based on whether label is selected
  const data = selectedLabel ? labelData : regularData
  const isLoading = selectedLabel ? labelLoading : regularLoading
  const isFetching = selectedLabel ? labelFetching : regularFetching

  // Accumulate results for infinite scroll
  useEffect(() => {
    if (data?.results) {
      if (offset === 0) {
        setAllResults(data.results)
      } else {
        setAllResults((prev) => [...prev, ...data.results])
      }
      // Update hasMore and total state
      setSavedHasMore(!!data.has_more)
      setSavedTotal(data.total ?? 0)
    }
  }, [data, offset])

  // Track the last search/filter values to detect actual changes vs initial mount
  const lastFiltersRef = useRef({ search, selectedCategories, selectedChromosome, selectedLabel })

  // Reset offset and clear results when filters change
  useEffect(() => {
    const prev = lastFiltersRef.current
    const filtersChanged =
      prev.search !== search ||
      JSON.stringify(prev.selectedCategories) !== JSON.stringify(selectedCategories) ||
      prev.selectedChromosome !== selectedChromosome ||
      prev.selectedLabel !== selectedLabel

    // Update ref for next comparison
    lastFiltersRef.current = { search, selectedCategories, selectedChromosome, selectedLabel }

    // Skip if filters haven't actually changed (initial mount or same values)
    if (!filtersChanged) {
      return
    }

    setOffset(0)
    setAllResults([])
    setSavedHasMore(false)
    setSavedTotal(0)
    setSkipInitialFetch(false) // Allow queries to run when filters change
    // Clear stored results since filters changed
    sessionStorage.removeItem('browseResults')
  }, [search, selectedCategories, selectedChromosome, selectedLabel])

  const handleLoadMore = useCallback(() => {
    const hasMore = data?.has_more ?? savedHasMore
    if (hasMore && !isFetching) {
      setSkipInitialFetch(false) // Allow fetch when loading more
      setOffset((prev) => prev + 50)
    }
  }, [data?.has_more, savedHasMore, isFetching])

  // When selecting a label, clear other filters since they use different queries
  const handleLabelChange = useCallback((label) => {
    setSelectedLabel(label)
    if (label) {
      setSearch('')
      setSelectedCategories([])
      setSelectedChromosome(null)
    }
  }, [])

  // Clear label and tag search when other filters are used
  const handleCategoryChange = useCallback((categories) => {
    setSelectedCategories(categories)
    if (categories.length > 0) {
      setSelectedLabel(null)
      // Clear tag search if user selects a category
      if (search.toLowerCase().startsWith('tag:')) {
        setSearch('')
      }
    }
  }, [search])

  const handleChromosomeChange = useCallback((chromosome) => {
    setSelectedChromosome(chromosome)
    if (chromosome) {
      setSelectedLabel(null)
      // Clear tag search if user selects a chromosome
      if (search.toLowerCase().startsWith('tag:')) {
        setSearch('')
      }
    }
  }, [search])

  const handleSearchChange = useCallback((searchText) => {
    setSearch(searchText)
    if (searchText) {
      setSelectedLabel(null)
    }
  }, [])

  const handleTagChange = useCallback((tag) => {
    // Set the search text directly with tag: prefix
    if (tag) {
      setSearch(`tag:${tag}`)
      setSelectedLabel(null)
    } else {
      setSearch('')
    }
  }, [])

  // Navigation helpers
  const setActiveTab = useCallback((tab) => {
    const path = tab === TABS.DASHBOARD ? '/' : `/${tab}`
    // Preserve query params when switching tabs
    navigate(path + location.search)
  }, [navigate, location.search])

  const handleSnpClick = useCallback((snp) => {
    const rsid = typeof snp === 'string' ? snp : snp.rsid
    // Add snp to query params while preserving current path
    const newParams = new URLSearchParams(searchParams)
    newParams.set('snp', rsid)
    setSearchParams(newParams)
  }, [searchParams, setSearchParams])

  const handleCloseDetail = useCallback(() => {
    // Remove snp from query params
    const newParams = new URLSearchParams(searchParams)
    newParams.delete('snp')
    setSearchParams(newParams)
  }, [searchParams, setSearchParams])

  const handleChatSnpClick = useCallback((rsid) => {
    handleSnpClick(rsid)
  }, [handleSnpClick])

  const handleViewFullPage = useCallback((rsid) => {
    // Navigate to full page view, preserving the return path
    navigate(`/snp/${rsid}`, { state: { from: location.pathname + location.search } })
  }, [navigate, location])

  const handleTagClick = useCallback((tag) => {
    // Navigate to browse page and filter by the tag
    // Use handleSearchChange to ensure consistent behavior
    handleSearchChange(`tag:${tag}`)
    setSelectedCategories([])
    setSelectedChromosome(null)
    setOffset(0)
    setAllResults([])
    navigate('/browse')
  }, [navigate, handleSearchChange])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedSnp) {
        handleCloseDetail()
      }
      if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        if (e.key === '1') setActiveTab(TABS.DASHBOARD)
        if (e.key === '2') setActiveTab(TABS.QUERY)
        if (e.key === '3') setActiveTab(TABS.HISTORY)
        if (e.key === '4') setActiveTab(TABS.BROWSE)
        if (e.key === '5') setActiveTab(TABS.DATA)
        if (e.key === '6') setActiveTab(TABS.FAVORITES)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSnp, handleCloseDetail, setActiveTab])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <span className="text-2xl">🧬</span>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Genome Browser
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <SyncStatus />
              <ExportButton />
              <button
                onClick={chat.toggleChat}
                className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all shadow-sm"
                title="Ask Claude about your genome"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="text-sm font-medium">Chat</span>
              </button>
              <DarkModeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit mx-auto">
          <button
            onClick={() => setActiveTab(TABS.DASHBOARD)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeTab === TABS.DASHBOARD
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Dashboard
            <span className="ml-1 text-xs text-gray-400">[1]</span>
          </button>
          <button
            onClick={() => setActiveTab(TABS.QUERY)}
            className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === TABS.QUERY
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Query
            <span className="text-xs text-gray-400">[2]</span>
          </button>
          <button
            onClick={() => setActiveTab(TABS.HISTORY)}
            className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === TABS.HISTORY
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
            <span className="text-xs text-gray-400">[3]</span>
          </button>
          <button
            onClick={() => setActiveTab(TABS.BROWSE)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeTab === TABS.BROWSE
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Browse
            <span className="ml-1 text-xs text-gray-400">[4]</span>
          </button>
          <button
            onClick={() => setActiveTab(TABS.DATA)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeTab === TABS.DATA
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Data Log
            <span className="ml-1 text-xs text-gray-400">[5]</span>
          </button>
          <button
            onClick={() => setActiveTab(TABS.FAVORITES)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeTab === TABS.FAVORITES
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Favorites
            <span className="ml-1 text-xs text-gray-400">[6]</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex gap-6">
          {/* Sidebar (for Browse tab) */}
          {activeTab === TABS.BROWSE && (
            <aside className="w-64 flex-shrink-0 space-y-6">
              <TagFilter
                selected={parsedSearch.tagFromSearch}
                onChange={handleTagChange}
              />
              <LabelFilterPanel
                selected={selectedLabel}
                onChange={handleLabelChange}
              />
              <CategoryFilter
                selected={selectedCategories}
                onChange={handleCategoryChange}
              />
              <ChromosomeBrowser
                selected={selectedChromosome}
                onChange={handleChromosomeChange}
              />
            </aside>
          )}

          {/* Main Content Area */}
          <main className="flex-1 min-w-0">
            {activeTab === TABS.DASHBOARD && (
              <RiskDashboard onSnpClick={handleSnpClick} />
            )}

            {activeTab === TABS.QUERY && (
              <div className="space-y-6">
                <GenomeQuery
                  onSnpClick={handleSnpClick}
                  query={genomeQueryText}
                  setQuery={setGenomeQueryText}
                  loading={genomeQueryLoading}
                  setLoading={setGenomeQueryLoading}
                  results={genomeQueryResults}
                  setResults={setGenomeQueryResults}
                  error={genomeQueryError}
                  setError={setGenomeQueryError}
                />
              </div>
            )}

            {activeTab === TABS.HISTORY && (
              <QueryHistory
                onSnpClick={handleSnpClick}
                onRerunQuery={(query) => {
                  setGenomeQueryText(query);
                  setActiveTab(TABS.QUERY);
                }}
              />
            )}

            {activeTab === TABS.BROWSE && (
              <>
                <div className="mb-6">
                  <SearchBar
                    value={search}
                    onChange={handleSearchChange}
                    placeholder="Filter by rsid, gene, or keyword..."
                  />
                </div>
                {(data || allResults.length > 0) && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {((data?.total ?? savedTotal) || allResults.length).toLocaleString()} results
                    {selectedLabel && ` labeled "${selectedLabel}"`}
                    {parsedSearch.tagFromSearch && ` tagged "${parsedSearch.tagFromSearch}"`}
                    {parsedSearch.searchText && ` for "${parsedSearch.searchText}"`}
                    {selectedChromosome && ` on chromosome ${selectedChromosome}`}
                  </p>
                )}
                <SnpList
                  snps={allResults}
                  isLoading={isLoading && !skipInitialFetch}
                  hasMore={data?.has_more ?? savedHasMore}
                  onLoadMore={handleLoadMore}
                  onSnpClick={handleSnpClick}
                  onToggleFavorite={toggleFavorite}
                  onTagClick={handleTagClick}
                  emptyMessage={
                    search
                      ? `No results for "${search}"`
                      : 'Select a category or chromosome to browse SNPs'
                  }
                />
              </>
            )}

            {activeTab === TABS.DATA && (
              <DataLogViewer onSnpClick={handleSnpClick} />
            )}

            {activeTab === TABS.FAVORITES && (
              <FavoritesList onSnpClick={handleSnpClick} onTagClick={handleTagClick} />
            )}
          </main>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedSnp && (
        <SnpDetailPanel
          rsid={selectedSnp}
          onClose={handleCloseDetail}
          onToggleFavorite={toggleFavorite}
          onAskClaude={() => chat.setIsOpen(true)}
          onViewFullPage={handleViewFullPage}
          onTagClick={handleTagClick}
        />
      )}

      {/* Chat Panel */}
      <ChatPanel
        isOpen={chat.isOpen}
        onClose={() => chat.setIsOpen(false)}
        messages={chat.messages}
        isLoading={chat.isLoading}
        isSending={chat.isSending}
        isConfigured={chat.isConfigured}
        onSendMessage={chat.sendMessage}
        onClearHistory={chat.clearHistory}
        onSnpClick={handleChatSnpClick}
      />
    </div>
  )
}

function SnpFullPageWrapper() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  // Get rsid from URL path
  const rsid = location.pathname.split('/snp/')[1]

  const handleClose = useCallback(() => {
    // Go back to previous page if we have history, otherwise go to dashboard
    const from = location.state?.from
    if (from) {
      navigate(from)
    } else {
      navigate('/')
    }
  }, [navigate, location.state])

  const handleSnpClick = useCallback((clickedRsid) => {
    // Navigate to the clicked SNP's full page
    navigate(`/snp/${clickedRsid}`, { state: location.state })
  }, [navigate, location.state])

  const handleTagClick = useCallback((tag) => {
    // Navigate to browse page with tag filter
    // The AppLayout will pick up the tag param and set the search bar
    navigate(`/browse?tag=${encodeURIComponent(tag)}`)
  }, [navigate])

  if (!rsid) {
    return <Navigate to="/" replace />
  }

  return (
    <SnpFullPage
      rsid={rsid}
      onClose={handleClose}
      onSnpClick={handleSnpClick}
      onTagClick={handleTagClick}
    />
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/snp/:rsid" element={<SnpFullPageWrapper />} />
      <Route path="/*" element={<AppLayout />} />
    </Routes>
  )
}
