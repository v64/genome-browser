import { useMemo } from 'react'

export function ChatMessage({ message, onSnpClick }) {
  // Parse message content to find and linkify SNP references
  const parsedContent = useMemo(() => {
    const content = message.content
    const snpPattern = /\b(rs\d+)\b/gi

    const parts = []
    let lastIndex = 0
    let match

    const regex = new RegExp(snpPattern)
    while ((match = regex.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index),
        })
      }

      // Add the SNP link
      parts.push({
        type: 'snp',
        content: match[1],
        rsid: match[1].toLowerCase(),
      })

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex),
      })
    }

    return parts
  }, [message.content])

  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
        }`}
      >
        <div className="text-sm whitespace-pre-wrap">
          {parsedContent.map((part, i) => {
            if (part.type === 'snp') {
              return (
                <button
                  key={i}
                  onClick={() => onSnpClick?.(part.rsid)}
                  className={`font-mono font-semibold underline decoration-dotted ${
                    isUser
                      ? 'text-blue-200 hover:text-white'
                      : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                  }`}
                >
                  {part.content}
                </button>
              )
            }
            return <span key={i}>{part.content}</span>
          })}
        </div>

        {/* Show extracted SNPs with genotypes */}
        {!isUser && message.snps_extracted?.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex flex-wrap gap-1">
              {message.snps_extracted.slice(0, 5).map((rsid) => (
                <button
                  key={rsid}
                  onClick={() => onSnpClick?.(rsid)}
                  className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                >
                  {rsid}
                </button>
              ))}
              {message.snps_extracted.length > 5 && (
                <span className="text-xs text-gray-500">
                  +{message.snps_extracted.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        <div
          className={`text-xs mt-1 ${
            isUser ? 'text-blue-200' : 'text-gray-400'
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
