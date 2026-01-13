import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { useFavorites } from '../hooks/useFavorites';
import ReactMarkdown from 'react-markdown';
import { MagnitudeBadge } from './MagnitudeBadge';
import { ReputeBadge } from './ReputeBadge';
import { LabelBadge } from './LabelBadge';

// Parse text containing [cite:ID] citations and render as clickable links
function CitedText({ text, onCiteClick }) {
  if (!text) return null;

  // Split text by citation pattern [cite:...]
  const parts = text.split(/(\[cite:[^\]]+\])/g);

  return (
    <span>
      {parts.map((part, idx) => {
        const citeMatch = part.match(/\[cite:([^\]]+)\]/);
        if (citeMatch) {
          const citeId = citeMatch[1];
          return (
            <button
              key={idx}
              onClick={() => onCiteClick?.(citeId)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 hover:text-purple-200 rounded text-xs font-medium transition-colors cursor-pointer"
              title={`View source: ${citeId}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span>{citeId.replace(/_/g, ' ').replace(/^(knowledge|datalog|chat)/, '$1 ')}</span>
            </button>
          );
        }
        // For non-citation parts, render with ReactMarkdown
        return <ReactMarkdown key={idx} components={{ p: 'span' }}>{part}</ReactMarkdown>;
      })}
    </span>
  );
}

// Modal component for viewing full content
function ContentModal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-800 rounded-lg border border-gray-600 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

// Chat-style conversation display
function ConversationView({ messages }) {
  if (!messages || messages.length === 0) {
    return <p className="text-gray-500">No messages</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-200'
            }`}
          >
            <div className="text-xs text-gray-400 mb-1">
              {msg.role === 'user' ? 'You' : 'Claude'}
            </div>
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>{msg.content || ''}</ReactMarkdown>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Knowledge entry view with markdown - renders JSON conversations properly
function KnowledgeView({ entry }) {
  // Try to parse response - extract actual Claude response from JSON if needed
  const parseResponse = () => {
    if (!entry.response) return { text: '' };

    try {
      const parsed = JSON.parse(entry.response);

      // Check for claude_response field (search results format)
      if (parsed.claude_response) {
        return { text: parsed.claude_response };
      }

      // Check if it's an array of messages
      if (Array.isArray(parsed)) {
        return { messages: parsed };
      }

      // Check if it has conversation-like structure
      if (parsed.messages && Array.isArray(parsed.messages)) {
        return { messages: parsed.messages };
      }

      // Check for response/answer fields
      if (parsed.response || parsed.answer) {
        return { text: parsed.response || parsed.answer };
      }

      // If it's some other JSON, just stringify it nicely as fallback
      return { text: entry.response };
    } catch {
      // Not JSON, use as plain text
      return { text: entry.response };
    }
  };

  const convoData = parseResponse();

  return (
    <div className="space-y-4">
      {/* Query as user message */}
      <div className="flex justify-end">
        <div className="max-w-[85%] p-3 rounded-lg bg-blue-600 text-white">
          <div className="text-xs text-blue-200 mb-1">You</div>
          <p>{entry.query}</p>
        </div>
      </div>

      {/* Response - either as conversation or markdown */}
      {convoData?.messages ? (
        <div className="space-y-3">
          {convoData.messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-200'
                }`}
              >
                <div className="text-xs text-gray-400 mb-1">
                  {msg.role === 'user' ? 'You' : 'Claude'}
                </div>
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown>{msg.content || ''}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex justify-start">
          <div className="max-w-[85%] p-3 rounded-lg bg-gray-700 text-gray-200">
            <div className="text-xs text-gray-400 mb-1">Claude</div>
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>{convoData?.text || ''}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-700">
        <span>Source: {entry.source}</span>
        <span>{new Date(entry.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

// Data log entry view - interprets SNPedia wikitext and renders conversations
function DataLogView({ entry }) {
  const isSnpediaRaw = entry.data_type === 'main_page' || entry.data_type === 'genotype_page';
  const isConversationType = entry.data_type === 'conversation' || entry.data_type === 'interpretation' ||
                             entry.data_type === 'search_query' || entry.data_type === 'gene_interpretation';

  // Parse SNPedia wikitext to human readable
  const interpretWikitext = (wikitext) => {
    if (!wikitext) return 'No content';

    // Remove wiki markup
    let text = wikitext
      .replace(/\{\{[^}]+\}\}/g, '') // Remove templates
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[link|text]] -> text
      .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[link]] -> link
      .replace(/'''([^']+)'''/g, '$1') // bold
      .replace(/''([^']+)''/g, '$1') // italic
      .replace(/==+([^=]+)==+/g, '\n**$1**\n') // headers
      .replace(/<ref[^>]*>.*?<\/ref>/gs, '') // remove refs
      .replace(/<[^>]+>/g, '') // remove other HTML
      .trim();

    return text || 'No interpretable content';
  };

  // Try to parse JSON content for conversation display
  const parseConversationContent = () => {
    // Check if metadata has question/response
    if (entry.metadata?.question || entry.metadata?.response) {
      return {
        question: entry.metadata.question || entry.metadata.query,
        response: entry.metadata.response || entry.content
      };
    }

    // Try to parse content as JSON
    try {
      const parsed = JSON.parse(entry.content);
      if (parsed.question || parsed.query || parsed.response) {
        return {
          question: parsed.question || parsed.query,
          response: parsed.response || parsed.answer
        };
      }
      // If it's an array of messages
      if (Array.isArray(parsed)) {
        return { messages: parsed };
      }
    } catch {
      // Not JSON, use content as response
    }

    // For interpretation type, the content is the response
    if (entry.data_type === 'interpretation' || entry.data_type === 'gene_interpretation') {
      return {
        question: entry.metadata?.rsid ? `What does ${entry.metadata.rsid} mean?` : 'SNP Interpretation',
        response: entry.content
      };
    }

    return null;
  };

  const convoData = isConversationType ? parseConversationContent() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded">{entry.source}</span>
        <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded">{entry.data_type}</span>
        <span className="text-gray-500">{new Date(entry.created_at).toLocaleString()}</span>
      </div>

      {/* Conversation-style display */}
      {convoData && convoData.messages ? (
        <div className="space-y-3">
          {convoData.messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-200'
                }`}
              >
                <div className="text-xs text-gray-400 mb-1">
                  {msg.role === 'user' ? 'You' : 'Claude'}
                </div>
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown>{msg.content || ''}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : convoData && (convoData.question || convoData.response) ? (
        <div className="space-y-3">
          {convoData.question && (
            <div className="flex justify-end">
              <div className="max-w-[80%] p-3 rounded-lg bg-blue-600 text-white">
                <div className="text-xs text-blue-200 mb-1">You</div>
                <p>{convoData.question}</p>
              </div>
            </div>
          )}
          {convoData.response && (
            <div className="flex justify-start">
              <div className="max-w-[80%] p-3 rounded-lg bg-gray-700 text-gray-200">
                <div className="text-xs text-gray-400 mb-1">Claude</div>
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown>{convoData.response}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : isSnpediaRaw ? (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Interpreted Content</h4>
          <div className="prose prose-sm prose-invert max-w-none bg-gray-700/50 p-4 rounded">
            <ReactMarkdown>{interpretWikitext(entry.content)}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Content</h4>
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{entry.content || 'No content'}</ReactMarkdown>
          </div>
        </div>
      )}

      {entry.metadata && Object.keys(entry.metadata).length > 0 && !convoData && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-1">Metadata</h4>
          <pre className="text-xs text-gray-400 bg-gray-700/50 p-2 rounded overflow-x-auto">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function SnpFullPage({ rsid, onClose, onSnpClick, onTagClick }) {
  const queryClient = useQueryClient();
  const { toggleFavorite } = useFavorites();
  const [improving, setImproving] = useState(false);

  // Improve modal state
  const [showImproveModal, setShowImproveModal] = useState(false);
  const [improveInstructions, setImproveInstructions] = useState('');

  // Modal states
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState(null);
  const [selectedDataLog, setSelectedDataLog] = useState(null);

  // Editing states
  const [editingSummary, setEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [editingGenotype, setEditingGenotype] = useState(null); // which genotype is being edited
  const [editedGenotypeInfo, setEditedGenotypeInfo] = useState({});

  // Close on Escape key (only if no modals are open)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !selectedConvo && !selectedKnowledge && !selectedDataLog) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedConvo, selectedKnowledge, selectedDataLog]);

  // Handle citation clicks - find and open the referenced source
  const handleCiteClick = useCallback((citeId, data, conversations) => {
    if (!citeId || !data) return;

    // Handle chat_history citation
    if (citeId === 'chat_history' && conversations?.length > 0) {
      // Open the first conversation
      setSelectedConvo(conversations[0]);
      return;
    }

    // Handle knowledge_X citations
    if (citeId.startsWith('knowledge_')) {
      const dbId = parseInt(citeId.replace('knowledge_', ''), 10);
      const entry = data.knowledge_entries?.find(e => e.id === dbId);
      if (entry) {
        setSelectedKnowledge(entry);
        return;
      }
      // If not found by ID, try index
      const idx = dbId;
      if (data.knowledge_entries?.[idx]) {
        setSelectedKnowledge(data.knowledge_entries[idx]);
        return;
      }
    }

    // Handle datalog_X citations
    if (citeId.startsWith('datalog_')) {
      const dbId = parseInt(citeId.replace('datalog_', ''), 10);
      const entry = data.data_log_entries?.find(e => e.id === dbId);
      if (entry) {
        setSelectedDataLog(entry);
        return;
      }
      // If not found by ID, try index
      const idx = dbId;
      if (data.data_log_entries?.[idx]) {
        setSelectedDataLog(data.data_log_entries[idx]);
        return;
      }
    }

    // If citation not found, scroll to the relevant section
    const sectionId = citeId.startsWith('knowledge') ? 'knowledge-section' :
                     citeId.startsWith('chat') ? 'conversations-section' :
                     citeId.startsWith('datalog') ? 'datalog-section' : null;
    if (sectionId) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['snp-full', rsid],
    queryFn: async () => {
      try {
        const result = await api.getSnpFull(rsid);
        return result;
      } catch (e) {
        console.error('SnpFullPage API error:', e);
        throw e;
      }
    },
    enabled: !!rsid,
    retry: 1,
  });

  // Fetch genotype label
  const { data: labelData } = useQuery({
    queryKey: ['label', rsid],
    queryFn: () => api.getLabel(rsid),
    enabled: !!rsid,
  });

  const improveMutation = useMutation({
    mutationFn: ({ rsid, instructions }) => api.improveAnnotation(rsid, true, instructions || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snp-full', rsid] });
      queryClient.invalidateQueries({ queryKey: ['snp', rsid] });
      setImproving(false);
      setShowImproveModal(false);
      setImproveInstructions('');
    },
    onError: (err) => {
      console.error('Improve error:', err);
      setImproving(false);
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ rsid, data }) => api.editAnnotation(rsid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snp-full', rsid] });
      queryClient.invalidateQueries({ queryKey: ['snp', rsid] });
      setEditingSummary(false);
      setEditingGenotype(null);
    },
    onError: (err) => {
      console.error('Edit error:', err);
    },
  });

  const handleImprove = () => {
    setShowImproveModal(true);
  };

  const handleConfirmImprove = () => {
    setImproving(true);
    improveMutation.mutate({ rsid, instructions: improveInstructions.trim() || null });
  };

  const handleCancelImprove = () => {
    setShowImproveModal(false);
    setImproveInstructions('');
  };

  const handleStartEditSummary = () => {
    setEditedSummary(data?.annotation?.summary || '');
    setEditingSummary(true);
  };

  const handleSaveSummary = () => {
    editMutation.mutate({ rsid, data: { summary: editedSummary } });
  };

  const handleCancelEditSummary = () => {
    setEditingSummary(false);
    setEditedSummary('');
  };

  const handleStartEditGenotype = (gt, currentInfo) => {
    setEditedGenotypeInfo({ ...data?.annotation?.genotype_info, [gt]: currentInfo });
    setEditingGenotype(gt);
  };

  const handleSaveGenotype = (gt) => {
    editMutation.mutate({ rsid, data: { genotype_info: editedGenotypeInfo } });
  };

  const handleCancelEditGenotype = () => {
    setEditingGenotype(null);
    setEditedGenotypeInfo({});
  };

  if (!rsid) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center">
        <div className="text-white">No SNP selected</div>
      </div>
    );
  }

  const getSourceColor = (source) => {
    switch (source) {
      case 'snpedia': return 'bg-green-900/50 text-green-300';
      case 'claude': return 'bg-purple-900/50 text-purple-300';
      case 'user': return 'bg-blue-900/50 text-blue-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  // Group chat messages into conversations
  const groupConversations = (messages) => {
    if (!messages || messages.length === 0) return [];

    const convos = [];
    let currentConvo = [];
    let lastTime = null;

    messages.forEach((msg) => {
      const msgTime = new Date(msg.created_at).getTime();
      // New conversation if more than 30 min gap
      if (lastTime && (msgTime - lastTime) > 30 * 60 * 1000) {
        if (currentConvo.length > 0) convos.push(currentConvo);
        currentConvo = [];
      }
      currentConvo.push(msg);
      lastTime = msgTime;
    });

    if (currentConvo.length > 0) convos.push(currentConvo);
    return convos;
  };

  const conversations = groupConversations(data?.chat_messages);

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-purple-400 font-mono">{rsid}</h1>
            {data?.annotation?.title && (
              <p className="text-base font-medium text-gray-200">{data.annotation.title}</p>
            )}
            {data?.annotation?.gene && (
              <p className="text-xs text-gray-400">Gene: {data.annotation.gene}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <>
              {/* Favorite button */}
              <button
                onClick={() => toggleFavorite(rsid, data.is_favorite)}
                className={`p-2 rounded-full transition-colors ${
                  data.is_favorite
                    ? 'text-yellow-500 bg-yellow-900/20'
                    : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-900/20'
                }`}
                title={data.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg className="w-6 h-6" fill={data.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>

              {/* Improve with Claude button */}
              <button
                onClick={handleImprove}
                disabled={improving}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  improving
                    ? 'bg-purple-900/50 text-purple-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                }`}
                title="Ask Claude to annotate the summary and fill in all genotype variants"
              >
                {improving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Annotating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Annotate with Claude</span>
                  </>
                )}
              </button>
            </>
          )}
          <a
            href={`https://www.snpedia.com/index.php/${rsid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
          >
            SNPedia
          </a>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-6">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-10 w-10 text-purple-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">Error loading SNP data</p>
            <p className="text-gray-500 text-sm mb-4">{error.message}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            >
              Go Back
            </button>
          </div>
        )}

        {/* Data */}
        {data && !isLoading && !error && (
          <div className="space-y-6">
            {/* Genotype, Location & Importance - inline */}
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <span className="flex items-center gap-2">
                <span className="text-gray-500">Genotype:</span>
                <span className="font-mono font-bold text-white text-lg">{data.matched_genotype || data.genotype}</span>
                {labelData?.label && <LabelBadge label={labelData.label} size="sm" />}
                {data.matched_genotype && data.matched_genotype !== data.genotype && (
                  <span className="text-gray-500 text-xs">(23andMe: {data.genotype})</span>
                )}
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-400">
                <span className="text-gray-500">Location:</span>{' '}
                <span className="text-white">Chr {data.chromosome || '?'}</span>{' '}
                <span className="text-gray-500">pos</span>{' '}
                <span className="text-white">{data.position ? data.position.toLocaleString() : '?'}</span>
              </span>
              <span className="text-gray-600">|</span>
              <span className="flex items-center gap-2">
                <span className="text-gray-500">Importance:</span>
                {data.annotation?.magnitude != null && <MagnitudeBadge magnitude={data.annotation.magnitude} />}
                {(data.effective_repute) && <ReputeBadge repute={data.effective_repute} />}
                {(!data.annotation?.magnitude && data.annotation?.magnitude !== 0) && !data.annotation?.repute && (
                  <span className="text-gray-500">Unknown</span>
                )}
              </span>
            </div>

            {/* Tags/Categories */}
            {data.annotation?.categories?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.annotation.categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => onTagClick?.(cat)}
                    className="px-2 py-1 bg-purple-900/40 text-purple-300 rounded-lg text-sm capitalize hover:bg-purple-700/60 transition-colors cursor-pointer"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Summary */}
            {(data.annotation?.summary || editingSummary || data.annotation) && (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    Summary
                    <span className={`px-2 py-0.5 rounded text-xs ${getSourceColor(data.annotation?.source || 'snpedia')}`}>
                      {data.annotation?.source || 'snpedia'}
                    </span>
                  </h2>
                  {!editingSummary && (
                    <button
                      onClick={handleStartEditSummary}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2 py-1 hover:bg-gray-700 rounded transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
                {editingSummary ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedSummary}
                      onChange={(e) => setEditedSummary(e.target.value)}
                      className="w-full h-32 p-3 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                      placeholder="Enter summary..."
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={handleCancelEditSummary}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveSummary}
                        disabled={editMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {editMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : data.annotation?.summary ? (
                  <div className="text-sm text-gray-300 leading-relaxed">
                    <CitedText
                      text={String(data.annotation.summary)}
                      onCiteClick={(citeId) => handleCiteClick(citeId, data, conversations)}
                    />
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">
                    No summary available. Click Edit to add one, or use "Annotate with Claude" to generate one.
                  </div>
                )}
              </div>
            )}

            {/* Genotype Variants */}
            {data.annotation?.genotype_info && Object.keys(data.annotation.genotype_info).length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h2 className="text-sm font-semibold text-white mb-3">Genotype Variants</h2>
                <div className="space-y-2">
                  {Object.entries(data.annotation.genotype_info)
                    .sort(([gtA], [gtB]) => {
                      // Sort user's genotype to top
                      const aIsYours = gtA === data.genotype || gtA === data.matched_genotype;
                      const bIsYours = gtB === data.genotype || gtB === data.matched_genotype;
                      if (aIsYours && !bIsYours) return -1;
                      if (!aIsYours && bIsYours) return 1;
                      return 0;
                    })
                    .map(([gt, info]) => {
                      const isYours = gt === data.genotype || gt === data.matched_genotype;
                      const isEditing = editingGenotype === gt;
                      return (
                        <div key={gt} className={`p-3 rounded ${isYours ? 'bg-blue-900/30 border border-blue-700' : 'bg-gray-700/50'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white text-lg">{gt}</span>
                              {isYours && (
                                <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                                  Your genotype
                                </span>
                              )}
                              {isYours && labelData?.label && (
                                <LabelBadge label={labelData.label} size="sm" />
                              )}
                            </div>
                            {!isEditing && (
                              <button
                                onClick={() => handleStartEditGenotype(gt, info)}
                                className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2 py-1 hover:bg-gray-600 rounded transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Edit
                              </button>
                            )}
                          </div>
                          {isEditing ? (
                            <div className="space-y-2 mt-2">
                              <textarea
                                value={editedGenotypeInfo[gt] || ''}
                                onChange={(e) => setEditedGenotypeInfo({ ...editedGenotypeInfo, [gt]: e.target.value })}
                                className="w-full h-24 p-3 bg-gray-600 border border-gray-500 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                                placeholder={`Enter interpretation for ${gt}...`}
                              />
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={handleCancelEditGenotype}
                                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleSaveGenotype(gt)}
                                  disabled={editMutation.isPending}
                                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                  {editMutation.isPending ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-300">
                              <CitedText
                                text={info}
                                onCiteClick={(citeId) => handleCiteClick(citeId, data, conversations)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Claude Conversations - clickable items */}
            {conversations.length > 0 && (
              <div id="conversations-section" className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h2 className="text-sm font-semibold text-white mb-3">
                  Claude Conversations ({conversations.length})
                </h2>
                <div className="space-y-2">
                  {conversations.map((convo, idx) => {
                    const firstMsg = convo[0];
                    const preview = firstMsg?.content?.substring(0, 100) || 'Conversation';
                    const date = new Date(firstMsg?.created_at).toLocaleDateString();
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedConvo(convo)}
                        className="w-full text-left p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-purple-400">{convo.length} messages</span>
                          <span className="text-xs text-gray-500">{date}</span>
                        </div>
                        <p className="text-sm text-gray-300 truncate">{preview}...</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Knowledge Entries - clickable items */}
            {data.knowledge_entries?.length > 0 && (
              <div id="knowledge-section" className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h2 className="text-sm font-semibold text-white mb-3">
                  Knowledge Base ({data.knowledge_entries.length})
                </h2>
                <div className="space-y-2">
                  {data.knowledge_entries.map((entry, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedKnowledge(entry)}
                      className="w-full text-left p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${getSourceColor(entry.source)}`}>
                          {entry.source}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 truncate">
                        {entry.query?.substring(0, 80) || 'Knowledge entry'}...
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Data Log - clickable items */}
            {data.data_log_entries?.length > 0 && (
              <div id="datalog-section" className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h2 className="text-sm font-semibold text-white mb-3">
                  Data Log ({data.data_log_entries.length})
                </h2>
                <div className="space-y-2">
                  {data.data_log_entries.map((entry, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedDataLog(entry)}
                      className="w-full text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <span className={`px-1.5 py-0.5 rounded text-xs ${getSourceColor(entry.source)}`}>
                        {entry.source}
                      </span>
                      <span className="px-1.5 py-0.5 bg-gray-600 text-gray-300 rounded text-xs">
                        {entry.data_type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-gray-400 truncate flex-1">
                        {entry.content?.substring(0, 50)}...
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state if no meaningful data */}
            {!data.annotation?.summary &&
             !conversations.length &&
             !data.knowledge_entries?.length &&
             !data.data_log_entries?.length && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
                <p className="text-gray-400 mb-2">No additional data available for this SNP yet.</p>
                <p className="text-gray-500 text-sm mb-4">
                  Click "Annotate with Claude" above to generate a detailed summary and genotype information.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Improve with Claude Modal */}
      {showImproveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-gray-800 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Annotate with Claude
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Add specific instructions for Claude, or leave blank for a general annotation.
            </p>
            <textarea
              value={improveInstructions}
              onChange={(e) => setImproveInstructions(e.target.value)}
              placeholder="e.g., 'Update the other genotype explanations', 'Focus on health implications', 'Add more detail about drug interactions'..."
              className="w-full h-32 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={handleCancelImprove}
                disabled={improving}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImprove}
                disabled={improving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {improving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Annotating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Annotate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conversation Modal */}
      <ContentModal
        isOpen={!!selectedConvo}
        onClose={() => setSelectedConvo(null)}
        title="Claude Conversation"
      >
        <ConversationView messages={selectedConvo} />
      </ContentModal>

      {/* Knowledge Modal */}
      <ContentModal
        isOpen={!!selectedKnowledge}
        onClose={() => setSelectedKnowledge(null)}
        title="Knowledge Entry"
      >
        {selectedKnowledge && <KnowledgeView entry={selectedKnowledge} />}
      </ContentModal>

      {/* Data Log Modal */}
      <ContentModal
        isOpen={!!selectedDataLog}
        onClose={() => setSelectedDataLog(null)}
        title="Data Log Entry"
      >
        {selectedDataLog && <DataLogView entry={selectedDataLog} />}
      </ContentModal>
    </div>
  );
}
