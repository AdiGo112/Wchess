# 06-Chat — Frontend Implementation Prompt

Copy and paste to an AI coding assistant.

---

You are implementing the in-game chat frontend panel for ChessWeb using React 18 + TypeScript + Socket.io client + Tailwind CSS.

## What already exists
- GamePage exists at `frontend/src/pages/GamePage.tsx` with useGameSocket hook
- AuthContext provides { user } with { id, username }
- axios instance configured with auth interceptors
- Socket.io client installed

## Task: Build the chat panel

### Step 1: useChatSocket hook

Create `frontend/src/hooks/useChatSocket.ts`:

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

export interface ChatMessage {
  id: string;
  gameId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

export function useChatSocket(gameId: string) {
  const { accessToken } = useAuth() as any;
  const socketRef = useRef<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOpponentTyping, setIsOpponentTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_API_URL}/chat`, {
      auth: { token: accessToken },
    });
    socketRef.current = socket;

    socket.on('message_received', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('typing_indicator', ({ isTyping }: { isTyping: boolean }) => {
      setIsOpponentTyping(isTyping);
    });

    socket.on('error', (err: { code: string; message: string }) => {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    });

    return () => { socket.disconnect(); };
  }, [gameId, accessToken]);

  const sendMessage = useCallback((content: string) => {
    socketRef.current?.emit('send_message', { gameId, content });
  }, [gameId]);

  const startTyping = useCallback(() => {
    socketRef.current?.emit('typing_start', { gameId });
  }, [gameId]);

  const stopTyping = useCallback(() => {
    socketRef.current?.emit('typing_stop', { gameId });
  }, [gameId]);

  return { messages, isOpponentTyping, error, sendMessage, startTyping, stopTyping };
}
```

### Step 2: ChatPanel component

Create `frontend/src/components/ChatPanel.tsx`:

```typescript
import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChatSocket } from '../hooks/useChatSocket';
import api from '../lib/axios';

interface Props {
  gameId: string;
}

export function ChatPanel({ gameId }: Props) {
  const { user } = useAuth();
  const { messages, isOpponentTyping, error, sendMessage, startTyping, stopTyping } = useChatSocket(gameId);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load history on mount
  useEffect(() => {
    api.get(`/chat/${gameId}/history`).then(res => {
      // History already sorted chronologically by the service
      // Messages from hook start empty; set initial history
      // NOTE: history is loaded separately from live messages
      // Implementation: store history in separate state or merge carefully
    });
  }, [gameId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInput('');
    stopTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Typing indicator debounce
    startTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  };

  const formatTime = (createdAt: string) => {
    const date = new Date(createdAt);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-gray-700 text-sm font-semibold text-gray-200 border-b border-gray-600">
        Game Chat
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.map(msg => {
          const isMe = msg.userId === user?.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-gray-400 mb-1">
                {isMe ? 'You' : msg.username} · {formatTime(msg.createdAt)}
              </span>
              <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm break-words
                ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-100'}`}>
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {isOpponentTyping && (
        <div className="px-3 py-1 text-xs text-gray-400 italic">
          Opponent is typing...
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-3 py-1 text-xs text-red-400 bg-red-900/20">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="p-2 border-t border-gray-700 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send)"
          rows={2}
          maxLength={500}
          className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

### Step 3: Add ChatPanel to GamePage

In `frontend/src/pages/GamePage.tsx`, add the ChatPanel in a sidebar layout:

```tsx
// Add to the game page layout
<div className="flex min-h-screen bg-gray-900 text-white">
  {/* Main board area */}
  <div className="flex flex-col items-center justify-center flex-1 p-4">
    {/* ... existing board, clocks, draw controls ... */}
  </div>

  {/* Chat sidebar */}
  <div className="w-72 flex-shrink-0 p-4">
    <ChatPanel gameId={gameId!} />
  </div>
</div>
```

Write all files now.
