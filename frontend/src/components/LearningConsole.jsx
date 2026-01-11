import { useState, useEffect, useRef } from 'react';

export default function LearningConsole({ onSnpClick }) {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [processing, setProcessing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const logsContainerRef = useRef(null);

  // Poll for status and logs
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/agent/status');
        const data = await res.json();
        setStatus(data);
        setLogs(data.logs || []);
      } catch (err) {
        console.error('Failed to fetch agent status:', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom of logs (within container only)
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const toggleAgent = async () => {
    const endpoint = status?.running ? 'stop' : 'start';
    try {
      await fetch(`http://localhost:8000/api/agent/${endpoint}`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const submitQuery = async (e) => {
    e.preventDefault();
    if (!query.trim() || processing) return;

    setProcessing(true);
    try {
      const res = await fetch('http://localhost:8000/api/agent/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() })
      });
      const data = await res.json();
      console.log('Query result:', data);
      setQuery('');
    } catch (err) {
      console.error('Query failed:', err);
    } finally {
      setProcessing(false);
    }
  };

  const clearLogs = async () => {
    try {
      await fetch('http://localhost:8000/api/agent/logs', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  // Extract rsIDs from log messages and make them clickable
  const renderLogMessage = (message) => {
    const rsidPattern = /\b(rs\d+)\b/gi;
    const parts = message.split(rsidPattern);

    return parts.map((part, i) => {
      if (part.match(rsidPattern)) {
        return (
          <button
            key={i}
            onClick={() => onSnpClick?.(part.toLowerCase())}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {part}
          </button>
        );
      }
      return part;
    });
  };

  const getLogStyle = (type) => {
    switch (type) {
      case 'user':
        return 'bg-blue-900/30 border-l-2 border-blue-500 text-blue-200';
      case 'claude':
        return 'bg-purple-900/30 border-l-2 border-purple-500 text-purple-200';
      case 'system':
        return 'bg-gray-800/50 border-l-2 border-gray-500 text-gray-300';
      case 'error':
        return 'bg-red-900/30 border-l-2 border-red-500 text-red-200';
      default:
        return 'bg-gray-800/50 text-gray-300';
    }
  };

  const getLogIcon = (type) => {
    switch (type) {
      case 'user':
        return '>';
      case 'claude':
        return '<';
      case 'system':
        return '*';
      case 'error':
        return '!';
      default:
        return '-';
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-white"
          >
            {expanded ? '[-]' : '[+]'}
          </button>
          <h3 className="font-mono text-sm text-gray-200">Learning Agent Console</h3>
          <span className={`px-2 py-0.5 rounded text-xs font-mono ${
            status?.running
              ? 'bg-green-900/50 text-green-400'
              : 'bg-gray-700 text-gray-400'
          }`}>
            {status?.running ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {status && (
            <span className="text-xs text-gray-500 font-mono">
              {status.stats?.queries_processed || 0}Q | {status.stats?.snps_enriched || 0}S | {status.stats?.knowledge_added || 0}K
            </span>
          )}
          <button
            onClick={clearLogs}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
          >
            Clear
          </button>
          <button
            onClick={toggleAgent}
            className={`px-3 py-1 text-xs rounded font-medium ${
              status?.running
                ? 'bg-red-900/50 hover:bg-red-800 text-red-300'
                : 'bg-green-900/50 hover:bg-green-800 text-green-300'
            }`}
          >
            {status?.running ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Current task indicator */}
          {status?.current_task && (
            <div className="px-3 py-2 bg-yellow-900/20 border-b border-yellow-900/50 text-yellow-300 text-xs font-mono">
              {status.current_task}
            </div>
          )}

          {/* Log output */}
          <div
            ref={logsContainerRef}
            className="h-64 overflow-y-auto bg-gray-950 font-mono text-xs p-2 space-y-1"
          >
            {logs.length === 0 ? (
              <div className="text-gray-600 text-center py-8">
                No activity yet. Start the agent or submit a query.
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`px-2 py-1 rounded ${getLogStyle(log.type)}`}
                >
                  <span className="text-gray-500 mr-2">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-gray-400 mr-2">{getLogIcon(log.type)}</span>
                  <span className="whitespace-pre-wrap break-words">
                    {renderLogMessage(log.message)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Query input */}
          <form onSubmit={submitQuery} className="p-2 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about your genes... (e.g., 'what genes are related to alcohol?')"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                disabled={processing}
              />
              <button
                type="submit"
                disabled={processing || !query.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
              >
                {processing ? '...' : 'Ask'}
              </button>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Try: "What genes affect intelligence?" or "Show me SNPs related to caffeine metabolism"
            </div>
          </form>
        </>
      )}
    </div>
  );
}
