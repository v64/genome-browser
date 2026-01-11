import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export function useChat() {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)

  // Get chat history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['chatHistory'],
    queryFn: () => api.getChatHistory(),
    enabled: isOpen,
  })

  // Check Claude status
  const { data: statusData } = useQuery({
    queryKey: ['chatStatus'],
    queryFn: () => api.getChatStatus(),
  })

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (message) => api.sendChatMessage(message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] })
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })

  // Clear history mutation
  const clearMutation = useMutation({
    mutationFn: () => api.clearChatHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] })
    },
  })

  // Explain SNP mutation
  const explainMutation = useMutation({
    mutationFn: (rsid) => api.explainSnp(rsid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] })
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })

  const sendMessage = useCallback(async (message) => {
    return sendMutation.mutateAsync(message)
  }, [sendMutation])

  const clearHistory = useCallback(() => {
    clearMutation.mutate()
  }, [clearMutation])

  const explainSnp = useCallback(async (rsid) => {
    setIsOpen(true)
    return explainMutation.mutateAsync(rsid)
  }, [explainMutation])

  const toggleChat = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  return {
    isOpen,
    setIsOpen,
    toggleChat,
    messages: historyData?.messages || [],
    isLoading: historyLoading,
    isSending: sendMutation.isPending,
    isExplaining: explainMutation.isPending,
    sendMessage,
    clearHistory,
    explainSnp,
    isConfigured: statusData?.configured || false,
    lastResponse: sendMutation.data,
    lastExplanation: explainMutation.data,
  }
}
