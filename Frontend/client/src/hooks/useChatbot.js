import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

const WRITE_TOOLS = ['add_call_record', 'add_prospect', 'add_objection', 'update_call_record', 'hide_record', 'unhide_record'];

export default function useChatbot() {
  const auth = useAuth();
  const { refetchData } = useData();
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return;

    const trimmed = text.trim().slice(0, 2000);
    const convId = conversationId || crypto.randomUUID();
    if (!conversationId) setConversationId(convId);

    // Add user message to UI immediately
    const userMsg = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    try {
      // Build history from existing messages (for Claude context)
      const history = [...messages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-50);

      // Build auth headers — support both client token and admin view modes
      const headers = { 'Content-Type': 'application/json' };
      if (auth.mode === 'admin') {
        const adminKey = sessionStorage.getItem('adminApiKey');
        if (adminKey) headers['X-Admin-Key'] = adminKey;
        if (auth.adminViewClientId) headers['X-View-Client-Id'] = auth.adminViewClientId;
      } else {
        headers['X-Client-Token'] = auth.token;
      }

      const res = await fetch('/api/dashboard/chat/message', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversationId: convId,
          message: trimmed,
          history,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        toolsUsed: data.toolsUsed || [],
      }]);

      // Auto-refetch dashboard data if a write tool was used
      if (data.toolsUsed?.some(t => WRITE_TOOLS.includes(t))) {
        refetchData();
      }
    } catch (err) {
      setError(err.message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        isError: true,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [auth.token, conversationId, messages, isLoading]);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, startNewConversation, conversationId };
}
