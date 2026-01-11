import { useState, useEffect, useRef } from 'react';

export default function DataLogViewer() {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    source: '',
    data_type: '',
    search: '',
  });
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastCount, setLastCount] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [showChat, setShowChat] = useState(true);
  const listRef = useRef(null);
  const chatEndRef = useRef(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/agent/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchChatMessages = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/chat/history');
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
    }
  };

  const fetchEntries = async (isAutoRefresh = false) => {
    if (!isAutoRefresh) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.source) params.append('source', filters.source);
      if (filters.data_type) params.append('data_type', filters.data_type);
      params.append('limit', '200');

      const res = await fetch(`http://localhost:8000/api/agent/data-log?${params}`);
      const data = await res.json();

      let filtered = data.entries || [];
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(e =>
          e.content?.toLowerCase().includes(searchLower) ||
          e.reference_id?.toLowerCase().includes(searchLower)
        );
      }

      // Check if we have new entries
      if (filtered.length > lastCount && lastCount > 0) {
        // Flash or indicate new entries somehow
      }
      setLastCount(filtered.length);
      setEntries(filtered);
    } catch (err) {
      console.error('Failed to fetch data log:', err);
    } finally {
      if (!isAutoRefresh) setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchStats();
    fetchEntries();
    fetchChatMessages();
  }, []);

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatEndRef.current && showChat) {
      chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
    }
  }, [chatMessages, showChat]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchStats();
      fetchEntries(true);
      fetchChatMessages();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, filters.source, filters.data_type, filters.search]);

  // Fetch when filters change
  useEffect(() => {
    fetchEntries();
  }, [filters.source, filters.data_type]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchEntries();
  };

  const getSourceColor = (source) => {
    switch (source) {
      case 'snpedia': return 'bg-green-900/50 text-green-300';
      case 'claude': return 'bg-purple-900/50 text-purple-300';
      case 'user': return 'bg-blue-900/50 text-blue-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'main_page': return 'bg-emerald-900/50 text-emerald-300';
      case 'genotype_page': return 'bg-teal-900/50 text-teal-300';
      case 'conversation': return 'bg-violet-900/50 text-violet-300';
      case 'interpretation': return 'bg-fuchsia-900/50 text-fuchsia-300';
      case 'search_query': return 'bg-blue-900/50 text-blue-300';
      case 'search_summary': return 'bg-indigo-900/50 text-indigo-300';
      case 'gene_interpretation': return 'bg-pink-900/50 text-pink-300';
      case 'search_results_full': return 'bg-cyan-900/50 text-cyan-300';
      case 'annotation_improvement': return 'bg-amber-900/50 text-amber-300';
      case 'annotation_edit': return 'bg-orange-900/50 text-orange-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  const truncate = (text, length = 150) => {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-white">{stats.data_log?.total || 0}</div>
            <div className="text-sm text-gray-400">Total Entries</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-green-400">{stats.data_log?.by_source?.snpedia || 0}</div>
            <div className="text-sm text-gray-400">From SNPedia</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-purple-400">{stats.data_log?.by_source?.claude || 0}</div>
            <div className="text-sm text-gray-400">From Claude</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-blue-400">{stats.database?.annotations || 0}</div>
            <div className="text-sm text-gray-400">Annotations</div>
          </div>
        </div>
      )}

      {/* Live Claude Conversation */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <button
          onClick={() => setShowChat(!showChat)}
          className="w-full px-4 py-3 bg-gray-900 border-b border-gray-700 flex justify-between items-center hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="font-medium text-white">Live Claude Conversation</h3>
            {autoRefresh && chatMessages.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Live
              </span>
            )}
            <span className="text-sm text-gray-400">({chatMessages.length} messages)</span>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${showChat ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showChat && (
          <div
            ref={chatEndRef}
            className="max-h-[400px] overflow-y-auto p-4 space-y-4"
          >
            {chatMessages.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No conversations yet.</p>
                <p className="text-sm mt-1">Claude conversations will appear here in real-time.</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-200'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs opacity-60">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                      {msg.snps_extracted && msg.snps_extracted.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {msg.snps_extracted.slice(0, 5).map((snp) => (
                            <span
                              key={snp}
                              className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs font-mono"
                            >
                              {snp}
                            </span>
                          ))}
                          {msg.snps_extracted.length > 5 && (
                            <span className="text-xs opacity-60">
                              +{msg.snps_extracted.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Source</label>
            <select
              value={filters.source}
              onChange={(e) => setFilters({ ...filters, source: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-white"
            >
              <option value="">All Sources</option>
              <option value="snpedia">SNPedia</option>
              <option value="claude">Claude</option>
              <option value="user">User</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select
              value={filters.data_type}
              onChange={(e) => setFilters({ ...filters, data_type: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-white"
            >
              <option value="">All Types</option>
              <option value="main_page">Main Page</option>
              <option value="genotype_page">Genotype Page</option>
              <option value="conversation">Conversation</option>
              <option value="interpretation">Interpretation</option>
              <option value="annotation_improvement">Annotation Improvement</option>
              <option value="annotation_edit">User Edit</option>
              <option value="search_query">Search Query</option>
              <option value="search_summary">Search Summary</option>
              <option value="gene_interpretation">Gene Interpretation</option>
              <option value="search_results_full">Full Search Results</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-400 mb-1">Search Content</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search in content or reference ID..."
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-white placeholder-gray-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
              >
                Search
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Results */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-white">Data Log ({entries.length} entries)</h3>
            {autoRefresh && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <button
              onClick={() => { fetchStats(); fetchEntries(); }}
              className="text-sm text-gray-400 hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No entries found</div>
        ) : (
          <div className="divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="p-4 hover:bg-gray-700/50 cursor-pointer"
                onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSourceColor(entry.source)}`}>
                      {entry.source}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(entry.data_type)}`}>
                      {entry.data_type}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {entry.reference_id && (
                        <span className="text-sm font-mono text-blue-400">{entry.reference_id}</span>
                      )}
                      <span className="text-xs text-gray-500">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-sm text-gray-300 font-mono">
                      {selectedEntry?.id === entry.id ? entry.content : truncate(entry.content)}
                    </p>

                    {selectedEntry?.id === entry.id && entry.metadata && (
                      <div className="mt-2 p-2 bg-gray-900 rounded text-xs">
                        <div className="text-gray-400 mb-1">Metadata:</div>
                        <pre className="text-gray-300 whitespace-pre-wrap">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  <div className="text-gray-500">
                    {selectedEntry?.id === entry.id ? '[-]' : '[+]'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
