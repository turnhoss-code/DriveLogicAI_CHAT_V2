import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, MapIcon, Search, Volume2, VolumeX, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { speakWithEclipseTTS, resetAudioPlayback } from '../lib/audioUtils';

export function AIChatbot({ isOpen, onClose, userId }: { isOpen: boolean, onClose: () => void, userId?: string }) {
  const defaultMessage = {
    role: 'ai' as const,
    text: "Hi, I'm **DriveLogic** (with **Eclipse** voice). I'm your general assistant and hands-free vehicle co-pilot — grounded with live Google Search for diagnostics, TSBs, traffic, weather, and general knowledge, plus full control of all app features."
  };
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; }[]>([defaultMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useAntigravity, setUseAntigravity] = useState(false);
  const [useSearch, setUseSearch] = useState(true);
  const [useMaps, setUseMaps] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userLatLng, setUserLatLng] = useState<{ latitude: number; longitude: number } | undefined>(undefined);
  const [modelType, setModelType] = useState<'gemini-4-argon' | 'gemini-3.8-flash' | 'gemini-3.1-flash-lite'>('gemini-3.8-flash');
  const [role, setRole] = useState<'General Assistant' | 'Mechanic' | 'Navigator' | 'Telemetry'>('General Assistant');
  const [interactionId, setInteractionId] = useState<string | undefined>(undefined);
  
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLatLng({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Sync to Firestore whenever messages change, as long as it's not just the default
    if (userId && messages.length > 1) {
      setDoc(doc(db, 'users', userId), { chatHistory: messages }, { merge: true }).catch((err) => {
        console.warn('Could not sync chat history to Firestore:', err?.message || err);
      });
    }
  }, [messages, userId]);

  useEffect(() => {
    if (userId) {
      getDoc(doc(db, 'users', userId)).then(docSnap => {
        if (docSnap.exists() && docSnap.data().chatHistory) {
          setMessages(docSnap.data().chatHistory);
        }
      }).catch((err) => {
        console.warn('Could not load chat history from Firestore:', err?.message || err);
      });
    } else {
      setMessages([defaultMessage]);
    }
  }, [userId]);

  const speakReplyWithEclipse = async (text: string) => {
    if (!voiceEnabled || !text.trim()) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      setIsSpeaking(true);
      await speakWithEclipseTTS(text, audioCtxRef.current, audioCtxRef.current.destination, () => {
        setIsSpeaking(false);
      });
    } catch {
      setIsSpeaking(false);
    }
  };

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
          latLng: userLatLng,
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
      setIsLoading(false);

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

      if (aiResponse.trim() && voiceEnabled) {
        speakReplyWithEclipse(aiResponse);
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
          className="fixed bottom-24 right-4 sm:right-6 w-[400px] h-[580px] max-h-[78vh] max-w-[calc(100vw-32px)] bg-[#1A1F2B] border border-emerald-500/30 rounded-3xl shadow-2xl flex flex-col z-[70] overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-950/70 via-[#232936] to-[#232936] p-3.5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-white text-sm tracking-tight">DriveLogic</h3>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Eclipse Voice
                  </span>
                </div>
                <p className="text-[10px] text-emerald-400/80 font-mono">
                  {isSpeaking ? 'Eclipse Speaking...' : 'General Assistant • Google Search Grounded'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const next = !voiceEnabled;
                  setVoiceEnabled(next);
                  if (!next) {
                    resetAudioPlayback();
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                    setIsSpeaking(false);
                  }
                }}
                className={cn(
                  "p-2 rounded-lg transition-colors cursor-pointer",
                  voiceEnabled ? "text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25" : "text-white/40 hover:text-white hover:bg-white/5"
                )}
                title={voiceEnabled ? "Eclipse Female Voice Enabled (Click to Mute)" : "Eclipse Voice Muted"}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button onClick={onClose} className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={cn("flex items-start gap-3", msg.role === 'user' ? 'flex-row-reverse' : '')}>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", msg.role === 'user' ? 'bg-car-accent/20 text-car-accent' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30')}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={cn("px-4 py-3 rounded-2xl max-w-[82%]", msg.role === 'user' ? 'bg-car-accent text-white rounded-tr-sm' : 'bg-white/5 text-white/90 rounded-tl-sm border border-white/10')}>
                  <div className="markdown-body text-xs sm:text-sm leading-relaxed">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-white/5 text-white/90 rounded-tl-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce delay-75" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce delay-150" />
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {/* Controls & Input */}
          <div className="p-3.5 bg-[#232936] border-t border-white/10">
            <div className="flex flex-col gap-2.5 mb-2.5">
              <div className="flex gap-2 text-xs">
                <select 
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value as any)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 focus:outline-none focus:border-car-accent transition-colors text-[11px]"
                >
                  <option value="gemini-3.8-flash">DriveLogic (3.8 Flash + Search)</option>
                  <option value="gemini-4-argon">Deep Reasoning (4 Argon)</option>
                  <option value="gemini-3.1-flash-lite">Fast Response (3.1 Lite)</option>
                </select>
                <select 
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 focus:outline-none focus:border-car-accent transition-colors flex-1 text-[11px]"
                >
                  <option value="General Assistant">Role: General Assistant & Co-Pilot</option>
                  <option value="Mechanic">Role: Master Mechanic</option>
                  <option value="Navigator">Role: Route & Weather Navigator</option>
                  <option value="Telemetry">Role: Telemetry Analyst</option>
                </select>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setUseSearch(!useSearch)}
                  className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 transition-colors border cursor-pointer", useSearch ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10')}
                >
                  <Search className="w-3 h-3" />
                  Google Search Grounded
                </button>
                <button
                  type="button"
                  onClick={() => setUseMaps(!useMaps)}
                  className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 transition-colors border cursor-pointer", useMaps ? 'bg-green-500/20 text-green-300 border-green-500/50' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10')}
                >
                  <MapIcon className="w-3 h-3" />
                  Maps
                </button>
                <button
                  type="button"
                  onClick={() => setUseAntigravity(!useAntigravity)}
                  className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 transition-colors border cursor-pointer", useAntigravity ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10')}
                >
                  <Sparkles className="w-3 h-3" />
                  Antigravity
                </button>
              </div>
            </div>
            
            <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask DriveLogic anything (web search, car repair, general info)..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-500 transition-colors cursor-pointer shrink-0"
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
