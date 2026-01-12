// Strip citation markers like [cite:knowledge_238] from text
export function stripCitations(text) {
  if (!text) return text
  return text.replace(/\[cite:[^\]]+\]/g, '').trim()
}
