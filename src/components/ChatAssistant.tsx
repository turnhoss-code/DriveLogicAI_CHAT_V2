import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { MessageSquare, Mic, Send, X, Bot, User, Loader2, Sparkles, Minimize2, AlertTriangle, Volume2, VolumeX, Globe, ExternalLink, Cpu, Zap, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { processVoiceCommand } from '../services/geminiService';
import { cn } from '../lib/utils';
import { PostCommandActions } from '../types';

export type ChatModel = 'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite';
export type ChatRole = 'general' | 'diagnostics' | 'telemetry';

export interface MessageSource {
  title: string;
  uri: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  sources?: MessageSource[];
  model?: string;
  role?: string;
}

interface ChatAssistantProps {
  onTabChange: (tab: 'obd' | 'damage' | 'gps' | 'maintenance') => void;
  onSetNavigation: (from: string, to: string) => void;
  onDiagnose: () => Promise<string> | any;
  onToggleRecording: (start: boolean) => void;
  speed: number;
  rpm: number;
  isRecording: boolean;
  postCommandActions?: PostCommandActions;
  isSimulation?: boolean;
  onSetSimulation?: (val: boolean) => void;
  vehicleModel?: string;
  onOpenLiveChat?: () => void;
}

export interface ChatAssistantHandle {
  toggleMic: () => void;
}

let persistentMicStream: MediaStream | null = null;

const cleanTextForSpeech = (text: string): string => {
  if (!text) return '';
  
  // 1. Remove markdown links, keeping only the link text: [some text](http...) -> some text
  let cleaned = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // 2. Remove asterisks completely so the TTS engine doesn't say "asterisk"
  cleaned = cleaned.replace(/\*/g, '');
  
  // 3. Remove underscores, tildes, backticks, hashes, bullet points
  cleaned = cleaned.replace(/[_~`#]/g, '');
  
  // 4. Strip out list formatting characters (e.g., "- " or "• " at the start of a line)
  cleaned = cleaned.replace(/^\s*[-•]\s*/gm, '');

  // 5. Replace slash or backslash with space so it doesn't say "slash" or "backslash"
  cleaned = cleaned.replace(/[\/\\]/g, ' ');

  // 6. Clean up other math/code symbols that can be read literally
  cleaned = cleaned.replace(/[<>@+=|]/g, ' ');

  // 7. Prevent the TTS engine from reading "comma" or "period" literal words.
  // Normalize spacing around normal punctuation: no leading spaces before punctuation
  cleaned = cleaned.replace(/\s+([.,!?])/g, '$1');
  
  // 8. Replace repeating punctuation with a single instance so it acts as a normal pause rather than being spoken as characters
  cleaned = cleaned.replace(/,+/g, ',');
  cleaned = cleaned.replace(/\.+/g, '.');
  cleaned = cleaned.replace(/\?+/g, '?');
  cleaned = cleaned.replace(/!+/g, '!');

  // 9. Trim and replace multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
};

const ChatAssistant = forwardRef<ChatAssistantHandle, ChatAssistantProps>(({ 
  onTabChange, 
  onSetNavigation, 
  onDiagnose, 
  onToggleRecording, 
  speed, 
  rpm, 
  isRecording,
  postCommandActions,
  isSimulation,
  onSetSimulation,
  vehicleModel,
  onOpenLiveChat
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMini, setIsMini] = useState(false);
  const [size, setSize] = useState({ width: 340, height: 480 });
  const [selectedModel, setSelectedModel] = useState<ChatModel>('gemini-3.5-flash');
  const [selectedRole, setSelectedRole] = useState<ChatRole>('general');
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: '1', 
      text: "Hi, I'm DriveLogic AI, your multi-turn onboard automotive assistant. I can diagnose fault codes, recommend optimized routes in NY state, and query real-time Google Search data. How can I assist you?", 
      sender: 'ai', 
      timestamp: Date.now(),
      model: 'gemini-3.5-flash',
      role: 'general'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRecognitionRef = useRef<any>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  const hasSpokenGreeting = useRef(false);
  
  // Refs for managing continuous background wake-word listening
  const isWakeWordModeRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const shouldListenRef = useRef(true);
  const isStartingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    toggleMic: () => {
      setIsOpen(true);
      setIsMini(false);
      if (!hasSpokenGreeting.current) {
        speak(messages[0].text);
        hasSpokenGreeting.current = true;
      }
      isWakeWordModeRef.current = false;
      startSpeechRecognition();
    }
  }));

  const speak = useCallback((text: string) => {
    // Disabled to use only Gemini realtime chat voice
  }, [isMuted]);

  const handleResize = useCallback((e: MouseEvent | TouchEvent) => {
    if (!resizeRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const newWidth = Math.max(200, clientX - 16); // 16px margin from left
    const newHeight = Math.max(150, window.innerHeight - clientY - 96); // 96px bottom offset
    
    setSize({ width: newWidth, height: newHeight });
  }, []);

  const stopResize = useCallback(() => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResize);
    window.removeEventListener('touchmove', handleResize);
    window.removeEventListener('touchend', stopResize);
  }, [handleResize]);

  const startResize = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchmove', handleResize);
    window.addEventListener('touchend', stopResize);
  }, [handleResize, stopResize]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const cleanInput = text.trim().toLowerCase();
    if (cleanInput === "hey drive logic" || cleanInput === "hey drivelogic" || cleanInput === "hey drive-logic" || cleanInput === "hey drive_logic") {
      setInput('');
      isWakeWordModeRef.current = false;
      startSpeechRecognition();
      return;
    }

    const userMsg: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: Date.now() };
    const currentMessages = [...messages];
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const result = await processVoiceCommand(
      text, 
      { speed, rpm, isRecording, vehicleModel }, 
      currentMessages,
      { model: selectedModel, role: selectedRole }
    );
    
    let speakPhrase = "";
    let executedCall = false;

    if (result.functionCalls) {
      for (const call of result.functionCalls) {
        executedCall = true;
        if (call.name === 'changeTab') {
          const args = call.args as { tab: 'obd' | 'damage' | 'gps' | 'maintenance' };
          onTabChange(args.tab);
          
          const action = postCommandActions?.changeTab || 'speakTab';
          if (action === 'speakTab') {
            const tabNames: Record<string, string> = {
              obd: 'OBD diagnostics',
              damage: 'damage log',
              gps: 'GPS routes',
              maintenance: 'maintenance tasks'
            };
            speakPhrase = `ok, displaying ${tabNames[args.tab] || args.tab}`;
          } else if (action === 'triggerSim') {
            if (onSetSimulation) {
              onSetSimulation(args.tab === 'obd');
            }
            speakPhrase = `ok, simulation ${args.tab === 'obd' ? 'initiated' : 'stopped'}`;
          } else {
            speakPhrase = "ok";
          }
        } else if (call.name === 'setNavigation') {
          const args = call.args as { from: string, to: string };
          onSetNavigation(args.from, args.to);

          const action = postCommandActions?.setNavigation || 'switchTab';
          if (action === 'autoRecord') {
            onToggleRecording(true);
            speakPhrase = "ok, navigation set and recording started";
          } else if (action === 'switchTab') {
            onTabChange('gps');
            speakPhrase = "ok";
          } else {
            speakPhrase = "ok";
          }
        } else if (call.name === 'diagnoseVehicle') {
          const action = postCommandActions?.diagnoseVehicle || 'switchOBD';
          if (action === 'switchOBD') {
            onTabChange('obd');
          }
          
          // Execute the diagnose task in background so we don't block chat for 15s
          onDiagnose();
          
          if (action === 'speakHealth') {
            speakPhrase = `ok, diagnosis initiated. I will notify you when the health index is ready.`;
          } else {
            speakPhrase = "ok, diagnosis initiated";
          }
        } else if (call.name === 'toggleRecording') {
          const args = call.args as { action: string };
          const start = args.action === 'start';
          onToggleRecording(start);

          const action = postCommandActions?.toggleRecording || 'speakStatus';
          if (action === 'switchGPS') {
            onTabChange('gps');
            speakPhrase = `ok, recording ${start ? 'started' : 'stopped'} and switching to GPS`;
          } else if (action === 'speakStatus') {
            speakPhrase = `ok, trip recording is now ${start ? 'active' : 'stopped'}`;
          } else {
            speakPhrase = "ok";
          }
        }
      }
    }

    const aiMsg: Message = { 
      id: (Date.now() + 1).toString(), 
      text: executedCall ? (speakPhrase || "ok") : (result.text || "Command executed successfully."), 
      sender: 'ai', 
      timestamp: Date.now(),
      sources: result.sources || [],
      model: result.model || selectedModel,
      role: result.role || selectedRole
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsLoading(false);
    speak(executedCall ? (speakPhrase || "ok") : aiMsg.text);
  };

  const startSpeechRecognition = async () => {
    if (isStartingRef.current) return;
    if (isListeningRef.current) return;
    
    isStartingRef.current = true;
    setMicError(null);

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition is not supported in this browser.");
      isStartingRef.current = false;
      return;
    }

    try {
      if (!persistentMicStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        persistentMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // We do NOT stop the tracks, so the mic stays engaged to prevent flashing
      }
    } catch (err: any) {
      console.warn("Microphone access error:", err);
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setMicError("Mic Permission Denied");
        shouldListenRef.current = false; // Disable auto-restarting if blocked
        isStartingRef.current = false;
        return;
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('Requested device not found')) {
        setMicError("No Microphone Found");
        shouldListenRef.current = false; // Disable auto-restarting if no mic
        isStartingRef.current = false;
        return;
      }
      setMicError("Mic Error");
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      isStartingRef.current = false;
    };

    recognition.onend = () => {
      setIsListening(false);
      isListeningRef.current = false;
      isStartingRef.current = false;
      activeRecognitionRef.current = null;
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted') {
        setIsListening(false);
        isListeningRef.current = false;
        isStartingRef.current = false;
        return;
      }
      
      if (event.error === 'no-speech') {
        setIsListening(false);
        isListeningRef.current = false;
        isStartingRef.current = false;
        return;
      }
      
      console.warn("Speech recognition error:", event.error);
      
      let errorMsg = "Mic Error";
      if (event.error === 'not-allowed') {
        errorMsg = "Mic Blocked";
        shouldListenRef.current = false;
      } else if (event.error === 'audio-capture') {
        errorMsg = "No Microphone Found";
        shouldListenRef.current = false;
      }
      
      setMicError(errorMsg);
      setIsListening(false);
      isListeningRef.current = false;
      isStartingRef.current = false;
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      const lowerTranscript = transcript.toLowerCase().trim();

      if (isWakeWordModeRef.current) {
        // Match wake word "hey drive-logic" variations
        const wakeWords = [
          "hey drive-logic", "hey drive logic", "hey drivelogic",
          "drive-logic", "drive logic", "drivelogic",
          "hey co-pilot", "hey copilot"
        ];
        
        let hasWakeWord = false;
        let commandAfterWakeWord = lowerTranscript;

        for (const ww of wakeWords) {
          if (lowerTranscript.includes(ww)) {
            hasWakeWord = true;
            // Extract anything spoken after the wake word
            const parts = lowerTranscript.split(ww);
            commandAfterWakeWord = parts[parts.length - 1].trim();
            break;
          }
        }
        
        if (hasWakeWord) {
          // Open UI and wake up co-pilot
          setIsOpen(true);
          setIsMini(false);
          isWakeWordModeRef.current = false;
          
          if (commandAfterWakeWord.length > 0) {
            handleSend(commandAfterWakeWord);
          } else {
            speak("Yes");
          }
        }
      } else {
        // Standard conversational mode
        handleSend(transcript);
      }
    };

    activeRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.warn("Failed to start speech recognition:", e?.message || e);
      setIsListening(false);
      isListeningRef.current = false;
      isStartingRef.current = false;
    }
  };

  const handleMicClick = () => {
    if (isListeningRef.current) {
      if (activeRecognitionRef.current) {
        try { activeRecognitionRef.current.stop(); } catch (e) {}
      }
    } else {
      isWakeWordModeRef.current = false;
      startSpeechRecognition();
    }
  };

  // Clean up speech recognition on component unmount
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (activeRecognitionRef.current) {
        try { activeRecognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-4 z-50 w-12 h-12 rounded-full bg-car-accent text-white shadow-lg flex items-center justify-center hover:bg-car-accent/80 transition-all group cursor-pointer"
      >
        <MessageSquare size={20} />
        {micError && !isOpen && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-car-danger rounded-full border-2 border-car-bg flex items-center justify-center">
            <AlertTriangle size={8} className="text-white" />
          </div>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={resizeRef}
            initial={{ opacity: 0, scale: 0.9, y: 20, x: -20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0, 
              x: 0,
              width: isMini ? 160 : size.width,
              height: isMini ? 120 : size.height
            }}
            exit={{ opacity: 0, scale: 0.9, y: 20, x: -20 }}
            className="fixed bottom-6 left-4 z-[60] glass-card rounded-3xl overflow-hidden border border-car-accent/30 shadow-2xl flex flex-col"
          >
            {/* Resize Handle (Top-Right) */}
            {!isMini && (
              <div 
                onMouseDown={startResize}
                onTouchStart={startResize}
                className="absolute top-0 right-0 w-6 h-6 cursor-ne-resize z-[70] flex items-center justify-center group"
              >
                <div className="w-1.5 h-1.5 bg-white/20 rounded-full group-hover:bg-car-accent transition-colors" />
              </div>
            )}

            {/* Header */}
            <div className="p-3 bg-car-accent/10 flex items-center justify-between border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="p-1.5 bg-car-accent/20 rounded-lg shrink-0">
                  <Bot size={14} className="text-car-accent" />
                </div>
                {!isMini && <span className="text-[10px] font-bold uppercase tracking-widest text-white/80 truncate">AI Co-Pilot</span>}
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setIsMuted(!isMuted);
                    if (!isMuted) window.speechSynthesis.cancel();
                  }} 
                  className="p-1 hover:bg-white/10 rounded-lg text-white/40"
                  title={isMuted ? "Unmute Voice" : "Mute Voice"}
                >
                  {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                <button 
                  onClick={() => setIsMini(!isMini)} 
                  className="p-1 hover:bg-white/10 rounded-lg text-white/40"
                  title={isMini ? "Expand" : "Mini View"}
                >
                  <Minimize2 size={12} className={cn(isMini && "rotate-180")} />
                </button>
                <button 
                  onClick={() => {
                    setIsOpen(false);
                    window.speechSynthesis.cancel();
                  }} 
                  className="p-1 hover:bg-white/10 rounded-lg text-white/40"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Model & Role Selection Header */}
            {!isMini && (
              <div className="px-3 py-1.5 bg-black/40 border-b border-white/5 flex items-center justify-between gap-1 text-[9px] font-mono shrink-0 overflow-x-auto scrollbar-hide">
                <span className="text-white/40 shrink-0">Model:</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel('gemini-3.5-flash');
                      setSelectedRole('general');
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded-full flex items-center gap-1 transition-all cursor-pointer",
                      selectedModel === 'gemini-3.5-flash'
                        ? "bg-car-accent/20 border border-car-accent/60 text-car-accent font-bold"
                        : "bg-white/5 text-white/50 hover:text-white"
                    )}
                    title="gemini-3.5-flash: General tasks + Google Search Grounding"
                  >
                    <Globe size={9} />
                    <span>3.5 Flash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel('gemini-3.1-pro-preview');
                      setSelectedRole('diagnostics');
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded-full flex items-center gap-1 transition-all cursor-pointer",
                      selectedModel === 'gemini-3.1-pro-preview'
                        ? "bg-purple-500/20 border border-purple-500/60 text-purple-300 font-bold"
                        : "bg-white/5 text-white/50 hover:text-white"
                    )}
                    title="gemini-3.1-pro-preview: Deep diagnostic reasoning & mechanical analysis"
                  >
                    <Cpu size={9} />
                    <span>3.1 Pro</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel('gemini-3.1-flash-lite');
                      setSelectedRole('telemetry');
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded-full flex items-center gap-1 transition-all cursor-pointer",
                      selectedModel === 'gemini-3.1-flash-lite'
                        ? "bg-amber-500/20 border border-amber-500/60 text-amber-300 font-bold"
                        : "bg-white/5 text-white/50 hover:text-white"
                    )}
                    title="gemini-3.1-flash-lite: Fast telemetry checks & status"
                  >
                    <Zap size={9} />
                    <span>3.1 Lite</span>
                  </button>

                  {onOpenLiveChat && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onOpenLiveChat();
                      }}
                      className="px-2 py-0.5 rounded-full flex items-center gap-1 transition-all bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-bold hover:bg-emerald-500/30 cursor-pointer ml-auto shrink-0 shadow-sm"
                      title="Switch to Real-Time Voice Chat with Eclipse Voice (gemini-3.8-live)"
                    >
                      <Sparkles size={9} className="text-emerald-400 animate-pulse" />
                      <span>Eclipse Live</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Messages - Hidden in Mini Mode */}
            {!isMini ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex flex-col", msg.sender === 'user' ? "items-end" : "items-start")}>
                    <div className={cn(
                      "max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed",
                      msg.sender === 'user' 
                        ? "bg-car-accent text-white rounded-tr-none shadow-md" 
                        : "bg-white/5 text-white/90 border border-white/10 rounded-tl-none shadow-md"
                    )}>
                      {msg.sender === 'ai' && (
                        <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-white/10 text-[8.5px] font-mono">
                          <span className="text-car-accent font-bold">
                            {msg.role === 'diagnostics' ? 'Diagnostic Specialist' : msg.role === 'telemetry' ? 'Telemetry Monitor' : 'DriveLogic Assistant'}
                          </span>
                          <span className="text-white/30">•</span>
                          <span className="text-white/50">
                            {msg.model || selectedModel}
                          </span>
                          {msg.sources && msg.sources.length > 0 && (
                            <span className="ml-auto text-[8px] px-1.5 py-0.2 rounded bg-car-accent/20 text-car-accent font-bold flex items-center gap-0.5">
                              <Globe size={8} /> Grounded
                            </span>
                          )}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                      {/* Grounding Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-1">
                          <div className="text-[8.5px] text-white/50 flex items-center gap-1 font-mono uppercase tracking-wider">
                            <Globe size={9} className="text-car-accent" />
                            <span>Google Search Sources ({msg.sources.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {msg.sources.map((src, sIdx) => (
                              <a
                                key={sIdx}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[8.5px] px-2 py-0.5 rounded-md bg-white/10 hover:bg-car-accent/20 border border-white/10 hover:border-car-accent/50 text-car-accent flex items-center gap-1 transition-all"
                              >
                                <ExternalLink size={8} />
                                <span className="truncate max-w-[130px]" title={src.title}>{src.title}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[8px] text-white/30 px-1 mt-0.5 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/5 flex items-center gap-2">
                      <Loader2 size={14} className="text-car-accent animate-spin" />
                      <span className="text-[9px] font-mono text-white/50">
                        {selectedModel === 'gemini-3.1-pro-preview' ? 'Pro reasoning...' : selectedModel === 'gemini-3.1-flash-lite' ? 'Fast telemetry...' : 'Searching with Google & reasoning...'}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-2">
                {isLoading ? (
                  <Loader2 size={16} className="text-car-accent animate-spin" />
                ) : (
                  <div className="text-center">
                    <p className="text-[8px] text-white/40 uppercase tracking-widest mb-1">Last Msg</p>
                    <p className="text-[10px] text-white/80 line-clamp-2 px-2">
                      {messages[messages.length - 1]?.text}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Input - Hidden in Mini Mode */}
            {!isMini && (
              <div className="p-3 sm:p-4 bg-black/20 border-t border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSend(input)}
                      placeholder={selectedRole === 'diagnostics' ? "Describe diagnostic issue..." : selectedRole === 'telemetry' ? "Ask speed, RPM, battery..." : "Ask directions, maintenance, or web info..."}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-car-accent/50"
                    />
                    <button
                      onClick={handleMicClick}
                      className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors flex items-center gap-1",
                        isListening ? "text-car-danger animate-pulse" : "text-white/40 hover:text-white",
                        micError && "text-car-warning"
                      )}
                    >
                      {micError && <span className="text-[8px] uppercase font-bold">{micError}</span>}
                      <Mic size={14} />
                    </button>
                  </div>
                  <button
                    onClick={() => handleSend(input)}
                    className="p-2 bg-car-accent text-white rounded-xl hover:bg-car-accent/80 transition-colors cursor-pointer"
                  >
                    <Send size={14} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                  <button 
                    onClick={() => handleSend("What is my current speed and RPM?")}
                    className="whitespace-nowrap px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] text-white/50 hover:text-white transition-colors cursor-pointer"
                  >
                    Speed & RPM
                  </button>
                  <button 
                    onClick={() => handleSend("Search latest recalls for Toyota Camry")}
                    className="whitespace-nowrap px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] text-white/50 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Globe size={8} /> Search Recalls
                  </button>
                  <button 
                    onClick={() => handleSend("Recommend best driving route in NY to reduce wear")}
                    className="whitespace-nowrap px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] text-white/50 hover:text-white transition-colors cursor-pointer"
                  >
                    Route Advice
                  </button>
                  <button 
                    onClick={() => handleSend("Diagnose my vehicle health")}
                    className="whitespace-nowrap px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] text-white/50 hover:text-white transition-colors cursor-pointer"
                  >
                    Diagnose
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

export default ChatAssistant;
