import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
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
import GenomeSearch from './components/GenomeSearch'
import { SnpFullPage } from './components/SnpFullPage'

const TABS = {
  DASHBOARD: 'dashboard',
  SEARCH: 'search',
  BROWSE: 'browse',
  DATA: 'data',
  FAVORITES: 'favorites',
}

export default function App() {
  const [activeTab, setActiveTab] = useState(TABS.DASHBOARD)
  const [search, setSearch] = useState('')
  const [selectedCategories, setSelectedCategories] = useState([])
  const [selectedChromosome, setSelectedChromosome] = useState(null)
  const [selectedSnp, setSelectedSnp] = useState(null)
  const [offset, setOffset] = useState(0)
  const [allResults, setAllResults] = useState([])

  // GenomeSearch state (persists across tab switches)
  const [genomeSearchQuery, setGenomeSearchQuery] = useState('')
  const [genomeSearchLoading, setGenomeSearchLoading] = useState(false)
  const [genomeSearchResults, setGenomeSearchResults] = useState(null)
  const [genomeSearchError, setGenomeSearchError] = useState(null)

  // Full page SNP view
  const [fullPageSnp, setFullPageSnp] = useState(null)

  const { toggleFavorite } = useFavorites()
  const chat = useChat()

  // Check if Claude is configured
  const { data: chatStatus } = useQuery({
    queryKey: ['chatStatus'],
    queryFn: api.getChatStatus,
    staleTime: Infinity,
  })

  // Build search params for traditional browse
  const searchParams = {
    search: search || undefined,
    category: selectedCategories[0] || undefined,
    chromosome: selectedChromosome || undefined,
    limit: 50,
    offset,
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['snps', searchParams],
    queryFn: () => api.searchSnps(searchParams),
    enabled: activeTab === TABS.BROWSE,
  })

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
  }, [search, selectedCategories, selectedChromosome])

  const handleLoadMore = useCallback(() => {
    if (data?.has_more && !isFetching) {
      setOffset((prev) => prev + 50)
    }
  }, [data?.has_more, isFetching])

  const handleSnpClick = useCallback((snp) => {
    setSelectedSnp(snp.rsid)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedSnp(null)
  }, [])

  const handleChatSnpClick = useCallback((rsid) => {
    setSelectedSnp(rsid)
  }, [])

  const handleViewFullPage = useCallback((rsid) => {
    setFullPageSnp(rsid)
    setSelectedSnp(null) // Close sidebar when opening full page
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedSnp) {
        setSelectedSnp(null)
      }
      if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        if (e.key === '1') setActiveTab(TABS.DASHBOARD)
        if (e.key === '2') setActiveTab(TABS.SEARCH)
        if (e.key === '3') setActiveTab(TABS.BROWSE)
        if (e.key === '4') setActiveTab(TABS.DATA)
        if (e.key === '5') setActiveTab(TABS.FAVORITES)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSnp])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
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
            onClick={() => setActiveTab(TABS.SEARCH)}
            className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === TABS.SEARCH
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Search
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
              <CategoryFilter
                selected={selectedCategories}
                onChange={setSelectedCategories}
              />
              <ChromosomeBrowser
                selected={selectedChromosome}
                onChange={setSelectedChromosome}
              />
            </aside>
          )}

          {/* Main Content Area */}
          <main className="flex-1 min-w-0">
            {activeTab === TABS.DASHBOARD && (
              <RiskDashboard onSnpClick={handleSnpClick} />
            )}

            {activeTab === TABS.SEARCH && (
              <div className="space-y-6">
                <GenomeSearch
                  onSnpClick={handleSnpClick}
                  query={genomeSearchQuery}
                  setQuery={setGenomeSearchQuery}
                  loading={genomeSearchLoading}
                  setLoading={setGenomeSearchLoading}
                  results={genomeSearchResults}
                  setResults={setGenomeSearchResults}
                  error={genomeSearchError}
                  setError={setGenomeSearchError}
                />
              </div>
            )}

            {activeTab === TABS.BROWSE && (
              <>
                <div className="mb-6">
                  <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Filter by rsid, gene, or keyword..."
                  />
                </div>
                {data && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {data.total.toLocaleString()} results
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
              <DataLogViewer />
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

      {/* Full Page SNP View */}
      {fullPageSnp && (
        <SnpFullPage
          rsid={fullPageSnp}
          onClose={() => setFullPageSnp(null)}
          onSnpClick={handleSnpClick}
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
