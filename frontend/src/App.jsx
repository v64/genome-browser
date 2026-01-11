import { useState, useCallback, useEffect, useMemo } from 'react'
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
import { SnpFullPage } from './components/SnpFullPage'
import { LabelFilterPanel } from './components/LabelFilterPanel'

const TABS = {
  DASHBOARD: 'dashboard',
  QUERY: 'query',
  BROWSE: 'browse',
  DATA: 'data',
  FAVORITES: 'favorites',
}

// Map URL paths to tab names
const pathToTab = {
  '/': TABS.DASHBOARD,
  '/dashboard': TABS.DASHBOARD,
  '/query': TABS.QUERY,
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

  const [search, setSearch] = useState('')
  const [selectedCategories, setSelectedCategories] = useState([])
  const [selectedChromosome, setSelectedChromosome] = useState(null)
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [offset, setOffset] = useState(0)
  const [allResults, setAllResults] = useState([])

  // GenomeQuery state (persists across tab switches)
  const [genomeQueryText, setGenomeQueryText] = useState('')
  const [genomeQueryLoading, setGenomeQueryLoading] = useState(false)
  const [genomeQueryResults, setGenomeQueryResults] = useState(null)
  const [genomeQueryError, setGenomeQueryError] = useState(null)

  const { toggleFavorite } = useFavorites()
  const chat = useChat()

  // Check if Claude is configured
  const { data: chatStatus } = useQuery({
    queryKey: ['chatStatus'],
    queryFn: api.getChatStatus,
    staleTime: Infinity,
  })

  // Build search params for traditional browse
  const browseSearchParams = {
    search: search || undefined,
    category: selectedCategories[0] || undefined,
    chromosome: selectedChromosome || undefined,
    limit: 50,
    offset,
  }

  // Regular SNP search (when no label filter)
  const { data: regularData, isLoading: regularLoading, isFetching: regularFetching } = useQuery({
    queryKey: ['snps', browseSearchParams],
    queryFn: () => api.searchSnps(browseSearchParams),
    enabled: activeTab === TABS.BROWSE && !selectedLabel,
  })

  // Label-filtered search
  const { data: labelData, isLoading: labelLoading, isFetching: labelFetching } = useQuery({
    queryKey: ['snps-by-label', selectedLabel, offset],
    queryFn: () => api.searchByLabel(selectedLabel, 50, offset),
    enabled: activeTab === TABS.BROWSE && !!selectedLabel,
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
    }
  }, [data, offset])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
    setAllResults([])
  }, [search, selectedCategories, selectedChromosome, selectedLabel])

  const handleLoadMore = useCallback(() => {
    if (data?.has_more && !isFetching) {
      setOffset((prev) => prev + 50)
    }
  }, [data?.has_more, isFetching])

  // When selecting a label, clear other filters since they use different queries
  const handleLabelChange = useCallback((label) => {
    setSelectedLabel(label)
    if (label) {
      setSearch('')
      setSelectedCategories([])
      setSelectedChromosome(null)
    }
  }, [])

  // Clear label when other filters are used
  const handleCategoryChange = useCallback((categories) => {
    setSelectedCategories(categories)
    if (categories.length > 0) setSelectedLabel(null)
  }, [])

  const handleChromosomeChange = useCallback((chromosome) => {
    setSelectedChromosome(chromosome)
    if (chromosome) setSelectedLabel(null)
  }, [])

  const handleSearchChange = useCallback((searchText) => {
    setSearch(searchText)
    if (searchText) setSelectedLabel(null)
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedSnp) {
        handleCloseDetail()
      }
      if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        if (e.key === '1') setActiveTab(TABS.DASHBOARD)
        if (e.key === '2') setActiveTab(TABS.QUERY)
        if (e.key === '3') setActiveTab(TABS.BROWSE)
        if (e.key === '4') setActiveTab(TABS.DATA)
        if (e.key === '5') setActiveTab(TABS.FAVORITES)
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
            onClick={() => setActiveTab(TABS.BROWSE)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeTab === TABS.BROWSE
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Browse
            <span className="ml-1 text-xs text-gray-400">[3]</span>
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
            <span className="ml-1 text-xs text-gray-400">[4]</span>
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
            <span className="ml-1 text-xs text-gray-400">[5]</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex gap-6">
          {/* Sidebar (for Browse tab) */}
          {activeTab === TABS.BROWSE && (
            <aside className="w-64 flex-shrink-0 space-y-6">
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

            {activeTab === TABS.BROWSE && (
              <>
                <div className="mb-6">
                  <SearchBar
                    value={search}
                    onChange={handleSearchChange}
                    placeholder="Filter by rsid, gene, or keyword..."
                  />
                </div>
                {data && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {data.total.toLocaleString()} results
                    {selectedLabel && ` labeled "${selectedLabel}"`}
                    {search && ` for "${search}"`}
                    {selectedChromosome && ` on chromosome ${selectedChromosome}`}
                  </p>
                )}
                <SnpList
                  snps={allResults}
                  isLoading={isLoading || isFetching}
                  hasMore={data?.has_more || false}
                  onLoadMore={handleLoadMore}
                  onSnpClick={handleSnpClick}
                  onToggleFavorite={toggleFavorite}
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
              <FavoritesList onSnpClick={handleSnpClick} />
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

  if (!rsid) {
    return <Navigate to="/" replace />
  }

  return (
    <SnpFullPage
      rsid={rsid}
      onClose={handleClose}
      onSnpClick={handleSnpClick}
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
