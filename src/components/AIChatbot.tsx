import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, MapIcon, Search, Wrench, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function AIChatbot({ isOpen, onClose, userId }: { isOpen: boolean, onClose: () => void, userId?: string }) {
  const defaultMessage = {
    role: 'ai' as const,
    text: 'Hi there! I am your AI Co-pilot. I can help you with vehicle diagnostics, routes, or general queries. You can also enable Antigravity, Google Search, or Maps Grounding below.'
  };
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; }[]>([defaultMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useAntigravity, setUseAntigravity] = useState(false);
  const [useSearch, setUseSearch] = useState(true);
  const [useMaps, setUseMaps] = useState(false);
  const [modelType, setModelType] = useState<'gemini-3.1-pro-preview' | 'gemini-3.8-flash' | 'gemini-3.1-flash-lite'>('gemini-3.8-flash');
  const [role, setRole] = useState<'General Assistant' | 'Mechanic' | 'Navigator'>('General Assistant');
  const [interactionId, setInteractionId] = useState<string | undefined>(undefined);
  
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Sync to Firestore whenever messages change, as long as it's not just the default
    if (userId && messages.length > 1) {
      setDoc(doc(db, 'users', userId), { chatHistory: messages }, { merge: true }).catch(console.error);
    }
  }, [messages, userId]);

  useEffect(() => {
    if (userId) {
      getDoc(doc(db, 'users', userId)).then(docSnap => {
        if (docSnap.exists() && docSnap.data().chatHistory) {
          setMessages(docSnap.data().chatHistory);
        }
      }).catch(console.error);
    } else {
      setMessages([defaultMessage]);
    }
  }, [userId]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    
    // Add user message to history
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
          previousInteractionId: interactionId,
          useAntigravity,
          useSearch,
          useMaps,
          modelType,
          role
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        setMessages(prev => [...prev, { role: 'ai', text: `Error: ${errorText}` }]);
        setIsLoading(false);
        return;
      }
      
      const newInteractionId = response.headers.get('X-Interaction-Id');
      if (newInteractionId) {
        setInteractionId(newInteractionId);
      }

      setMessages(prev => [...prev, { role: 'ai', text: '' }]);
      setIsLoading(false); // Done loading initial response, start streaming

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          aiResponse += chunk;
          setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1].text = aiResponse;
            return newMsgs;
          });
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 right-6 w-[400px] h-[600px] max-h-[80vh] max-w-[calc(100vw-48px)] bg-[#1A1F2B] border border-white/10 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-[#232936] p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-car-accent" />
              <h3 className="font-semibold text-white">AI Co-pilot</h3>
            </div>
            <button onClick={onClose} className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={cn("flex items-start gap-3", msg.role === 'user' ? 'flex-row-reverse' : '')}>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", msg.role === 'user' ? 'bg-car-accent/20 text-car-accent' : 'bg-white/10 text-white')}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={cn("px-4 py-3 rounded-2xl max-w-[80%]", msg.role === 'user' ? 'bg-car-accent text-white rounded-tr-sm' : 'bg-white/5 text-white/90 rounded-tl-sm')}>
                  <div className="markdown-body text-sm">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-white/5 text-white/90 rounded-tl-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce delay-75" />
                  <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce delay-150" />
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {/* Controls & Input */}
          <div className="p-4 bg-[#232936] border-t border-white/5">
            <div className="flex flex-col gap-3 mb-3">
              <div className="flex gap-2 text-xs">
                <select 
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value as any)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 focus:outline-none focus:border-car-accent transition-colors"
                >
                  <option value="gemini-3.1-flash-lite">Fast (3.1 Lite)</option>
                  <option value="gemini-3.8-flash">General (3.8 Flash)</option>
                  <option value="gemini-3.1-pro-preview">Complex (3.1 Pro)</option>
                </select>
                <select 
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 focus:outline-none focus:border-car-accent transition-colors flex-1"
                >
                  <option value="General Assistant">Role: General Assistant</option>
                  <option value="Mechanic">Role: Expert Mechanic</option>
                  <option value="Navigator">Role: Route Navigator</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setUseAntigravity(!useAntigravity)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors border", useAntigravity ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10')}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Antigravity Agent
              </button>
              {!useAntigravity && (
                <>
                  <button
                    onClick={() => setUseSearch(!useSearch)}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors border", useSearch ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10')}
                  >
                    <Search className="w-3.5 h-3.5" />
                    Google Search
                  </button>
                  <button
                    onClick={() => setUseMaps(!useMaps)}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors border", useMaps ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10')}
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    Maps
                  </button>
                </>
              )}
            </div>
          </div>
            
          <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask your AI Co-pilot..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-car-accent"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 rounded-xl bg-car-accent text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
