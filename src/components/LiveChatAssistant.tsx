import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { 
  Mic, 
  MicOff, 
  Send, 
  X, 
  Loader2, 
  Sparkles, 
  AlertTriangle, 
  Headphones, 
  User, 
  Bot, 
  Square, 
  Volume1, 
  Volume2, 
  VolumeX, 
  BrainCircuit, 
  RotateCcw,
  Minimize2,
  Maximize2,
  Navigation,
  Wrench,
  Radio,
  Gauge,
  CheckCircle2,
  Compass,
  Zap,
  Activity,
  Search,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { pcmToBase64, playAudioChunk, resetAudioPlayback } from '../lib/audioUtils';
import { 
  loadChatHistory, 
  savePersistentMessage, 
  clearPersistentHistory, 
  formatPriorChatsSummary, 
  formatPriorTripsSummary, 
  formatHarshEventsSummary 
} from '../lib/chatMemory';

export interface LiveChatAssistantProps {
  speed?: number;
  rpm?: number;
  isRecording?: boolean;
  onTabChange?: (tab: string) => void;
  onSetNavigation?: (from: string, to: string) => void;
  onDiagnose?: () => void;
  onToggleRecording?: (start: boolean) => void;
  postCommandActions?: any;
  isSimulation?: boolean;
  onSetSimulation?: (sim: boolean) => void;
  trips?: any[];
  vehicleModel?: string;
  user?: any;
  obdData?: any;
}

interface TranscriptItem {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  action?: string;
  timestamp?: number;
  sources?: { title: string; uri: string }[];
}

export interface LiveChatAssistantHandle {
  open: () => void;
  close: () => void;
  toggleMic: () => void;
}

const LiveChatAssistant = forwardRef<LiveChatAssistantHandle, LiveChatAssistantProps>(({ 
  speed = 0, 
  rpm = 800, 
  isRecording = false,
  onTabChange,
  onSetNavigation,
  onDiagnose,
  onToggleRecording,
  postCommandActions,
  isSimulation = false,
  onSetSimulation,
  trips = [],
  vehicleModel = '2023 Toyota Camry',
  user,
  obdData
}: LiveChatAssistantProps, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMini, setIsMini] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [voiceVolume, setVoiceVolume] = useState<'low' | 'medium' | 'high' | 'mute'>(() => {
    return (localStorage.getItem('ztcd_gemini_voice_volume') as any) || 'medium';
  });
  const [useSearch, setUseSearch] = useState<boolean>(() => {
    return localStorage.getItem('ztcd_live_use_search') !== 'false';
  });
  const [actionNotification, setActionNotification] = useState<string | null>(null);

  // Real-time transcript logs
  const [liveTranscript, setLiveTranscript] = useState<TranscriptItem[]>([]);
  const [activeSpeechState, setActiveSpeechState] = useState<'idle' | 'connecting' | 'listening' | 'speaking' | 'thinking'>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Sync refs to avoid stale closures in callbacks
  const postCommandActionsRef = useRef(postCommandActions);
  const isSimulationRef = useRef(isSimulation);
  const onTabChangeRef = useRef(onTabChange);
  const onSetNavigationRef = useRef(onSetNavigation);
  const onDiagnoseRef = useRef(onDiagnose);
  const onToggleRecordingRef = useRef(onToggleRecording);
  const onSetSimulationRef = useRef(onSetSimulation);
  const tripsRef = useRef(trips);
  const vehicleModelRef = useRef(vehicleModel);
  const userRef = useRef(user);
  const obdDataRef = useRef(obdData);
  const speedRef = useRef(speed);
  const rpmRef = useRef(rpm);
  const isRecordingRef = useRef(isRecording);
  const isMicActiveRef = useRef(isMicActive);
  const speechRecRef = useRef<any>(null);
  const receivedAudioThisTurnRef = useRef<boolean>(false);
  const currentAiSpeechTextRef = useRef<string>('');

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  useEffect(() => {
    postCommandActionsRef.current = postCommandActions;
    isSimulationRef.current = isSimulation;
    onTabChangeRef.current = onTabChange;
    onSetNavigationRef.current = onSetNavigation;
    onDiagnoseRef.current = onDiagnose;
    onToggleRecordingRef.current = onToggleRecording;
    onSetSimulationRef.current = onSetSimulation;
    tripsRef.current = trips;
    vehicleModelRef.current = vehicleModel;
    userRef.current = user;
    obdDataRef.current = obdData;
    speedRef.current = speed;
    rpmRef.current = rpm;
    isRecordingRef.current = isRecording;
  }, [postCommandActions, isSimulation, onTabChange, onSetNavigation, onDiagnose, onToggleRecording, onSetSimulation, trips, vehicleModel, user, obdData, speed, rpm, isRecording]);

  useImperativeHandle(ref, () => ({
    open: () => {
      setIsOpen(true);
      setIsMini(false);
    },
    close: () => {
      setIsOpen(false);
    },
    toggleMic: () => {
      setIsOpen(true);
      setIsMini(false);
      toggleMic();
    }
  }));

  const getGainValue = (vol: 'low' | 'medium' | 'high' | 'mute') => {
    switch (vol) {
      case 'mute': return 0;
      case 'low': return 0.25;
      case 'medium': return 0.65;
      case 'high': return 1.2;
      default: return 0.65;
    }
  };

  const cycleVolume = () => {
    const sequence: ('low' | 'medium' | 'high' | 'mute')[] = ['low', 'medium', 'high', 'mute'];
    const currentIndex = sequence.indexOf(voiceVolume);
    const next = sequence[(currentIndex + 1) % sequence.length];
    setVoiceVolume(next);
    localStorage.setItem('ztcd_gemini_voice_volume', next);
    if (outputGainRef.current) {
      outputGainRef.current.gain.value = getGainValue(next);
    }
  };

  // Load persistent chat history on mount or user switch
  useEffect(() => {
    let active = true;
    loadChatHistory(user?.uid).then(history => {
      if (active && history && history.length > 0) {
        setLiveTranscript(history.map(h => ({ 
          id: h.id, 
          sender: h.sender as any, 
          text: h.text,
          timestamp: h.timestamp 
        })));
      }
    });
    return () => { active = false; };
  }, [user?.uid]);

  const handleClearMemory = async () => {
    await clearPersistentHistory(user?.uid);
    setLiveTranscript([]);
  };

  // Auto-scroll transcript to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveTranscript, actionNotification]);

  // Waveform visualization loop
  useEffect(() => {
    if (!isOpen || !canvasRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phrase = 0;

    const renderWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;

      // Read volume level from active speech source analyser
      let volume = 0;
      if (activeSpeechState === 'speaking' && outputAnalyserRef.current) {
        const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
        outputAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        volume = sum / dataArray.length;
      } else if (activeSpeechState === 'listening' && inputAnalyserRef.current) {
        const dataArray = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
        inputAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        volume = sum / dataArray.length;
      }

      // Compute visual parameters
      const normVolume = Math.min(1, volume / 96);
      const amplitude = 4 + normVolume * (height / 2.3 - 4);
      const frequency = 0.045 + normVolume * 0.04;
      const speedAnim = 0.08 + normVolume * 0.12;

      phrase += speedAnim;

      // Solid styling with glowing shadow
      ctx.lineWidth = 2.2;

      let color = 'rgba(52, 211, 153, '; // vibrant emerald for Eclipse Voice
      if (activeSpeechState === 'listening') {
        color = 'rgba(56, 189, 248, '; // bright cyan/blue for user mic
      } else if (activeSpeechState === 'thinking' || activeSpeechState === 'connecting') {
        color = 'rgba(251, 191, 36, '; // amber for processing
      } else if (activeSpeechState === 'idle') {
        color = 'rgba(148, 163, 184, '; // muted slate for idle
      }

      // Draw 3 layers of smooth fluid sine waves
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        ctx.strokeStyle = color + (0.8 - layer * 0.25) + ')';
        ctx.shadowBlur = layer === 0 ? 8 : 0;
        ctx.shadowColor = color + '0.45)';

        for (let x = 0; x < width; x++) {
          const envelope = Math.sin(x * Math.PI / width);
          const y = height / 2 + Math.sin(x * frequency + phrase + layer * (Math.PI / 2.5)) * amplitude * envelope;
          
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      animationFrameRef.current = requestAnimationFrame(renderWave);
    };

    renderWave();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isOpen, isLive, activeSpeechState]);

  // Ensure AudioContext is initialized for Eclipse voice playback
  const ensureOutputAudio = () => {
    if (!outputAudioCtxRef.current) {
      const outputAudioCtx = new AudioContext({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputAudioCtx;

      const outputAnalyser = outputAudioCtx.createAnalyser();
      outputAnalyser.fftSize = 64;
      outputAnalyserRef.current = outputAnalyser;

      const outputGain = outputAudioCtx.createGain();
      outputGain.gain.value = getGainValue(voiceVolume);
      outputGain.connect(outputAudioCtx.destination);
      outputGainRef.current = outputGain;

      outputAnalyser.connect(outputGain);
    }
    if (outputAudioCtxRef.current.state === 'suspended') {
      outputAudioCtxRef.current.resume().catch(() => {});
    }
  };

  // Connect WebSocket to Gemini Live with Eclipse voice
  const connectLiveSession = useCallback(async () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      setError(null);
      setActiveSpeechState('connecting');
      ensureOutputAudio();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setIsLive(true);
        setActiveSpeechState('idle');

        // Fetch latest prior chats and format summaries
        const priorChats = await loadChatHistory(userRef.current?.uid);
        const priorChatsSummary = formatPriorChatsSummary(priorChats);
        const priorTripsSummary = formatPriorTripsSummary(tripsRef.current || []);
        const harshEventsSummary = formatHarshEventsSummary(tripsRef.current || []);

        let customApiKey: string | undefined = undefined;
        try {
          const storedKey = localStorage.getItem('ztcd_gemini_api_key');
          if (storedKey && storedKey.trim()) customApiKey = storedKey.trim();
        } catch {}

        // Send init frame specifying Zephyr Voice
        ws.send(JSON.stringify({
          type: 'init',
          voice: 'Zephyr',
          apiKey: customApiKey,
          userId: userRef.current?.uid,
          vehicleModel: vehicleModelRef.current || '2023 Toyota Camry',
          priorChatsSummary,
          priorTripsSummary,
          harshEventsSummary,
          telemetry: {
            speed: speedRef.current,
            rpm: rpmRef.current,
            isRecording: isRecordingRef.current,
            coolantTemp: obdDataRef.current?.coolantTemp || 90,
            dtcs: obdDataRef.current?.dtcs || [],
            voltage: obdDataRef.current?.voltage || 14.2
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.ready) {
            setIsLive(true);
            setError(null);
            setActiveSpeechState('idle');
            return;
          }

          if (msg.liveNotice) {
            setActionNotification(msg.liveNotice);
            setTimeout(() => setActionNotification(null), 4000);
            return;
          }

          if (msg.error) {
            console.warn("Live message error notice:", msg.error);
            setError(msg.error);
            return;
          }

          // Live Audio Output chunks (24kHz PCM)
          if (msg.audio) {
            receivedAudioThisTurnRef.current = true;
            setActiveSpeechState('speaking');
            ensureOutputAudio();
            if (outputAudioCtxRef.current && outputAnalyserRef.current) {
              playAudioChunk(outputAudioCtxRef.current, msg.audio, outputAnalyserRef.current);
            }
          }

          // AI text subtitles transcription streaming
          if (msg.text) {
            currentAiSpeechTextRef.current += msg.text;
            setActiveSpeechState('speaking');
            setLiveTranscript(prev => {
              const last = prev[prev.length - 1];
              if (last && last.sender === 'user') {
                savePersistentMessage({ sender: 'user', text: last.text }, userRef.current?.uid);
              }

              if (last && last.sender === 'ai') {
                return [...prev.slice(0, -1), { ...last, text: last.text + msg.text, sources: msg.sources || last.sources }];
              } else {
                return [...prev, { id: Math.random().toString(), sender: 'ai', text: msg.text, timestamp: Date.now(), sources: msg.sources }];
              }
            });
          }

          // Search Grounding web sources
          if (msg.sources && Array.isArray(msg.sources)) {
            setLiveTranscript(prev => {
              const last = prev[prev.length - 1];
              if (last && last.sender === 'ai') {
                return [...prev.slice(0, -1), { ...last, sources: msg.sources }];
              }
              return prev;
            });
          }

          // User speech transcription streaming
          if (msg.userText) {
            setActiveSpeechState('listening');
            setLiveTranscript(prev => {
              const last = prev[prev.length - 1];
              if (last && last.sender === 'user') {
                return [...prev.slice(0, -1), { ...last, text: msg.userText }];
              } else {
                return [...prev, { id: Math.random().toString(), sender: 'user', text: msg.userText, timestamp: Date.now() }];
              }
            });
          }

          // Turn completed
          if (msg.turnComplete) {
            const spokenSoFar = currentAiSpeechTextRef.current.trim();
            const hadAudio = receivedAudioThisTurnRef.current;
            currentAiSpeechTextRef.current = '';
            receivedAudioThisTurnRef.current = false;

            // If no native audio chunks arrived from live stream, use browser TTS so the user always hears voice
            if (!hadAudio && spokenSoFar && voiceVolume !== 'mute' && 'speechSynthesis' in window) {
              setActiveSpeechState('speaking');
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(spokenSoFar);
              utterance.rate = 1.05;
              utterance.pitch = 0.95;
              utterance.onend = () => {
                setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle');
              };
              utterance.onerror = () => {
                setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle');
              };
              window.speechSynthesis.speak(utterance);
            } else {
              setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle');
            }

            setLiveTranscript(prev => {
              const last = prev[prev.length - 1];
              if (last && last.text.trim() && (last.sender === 'user' || last.sender === 'ai')) {
                savePersistentMessage({ sender: last.sender, text: last.text }, userRef.current?.uid);
              }
              return prev;
            });
          }

          // Interruption signal
          if (msg.interrupted) {
            resetAudioPlayback();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            currentAiSpeechTextRef.current = '';
            receivedAudioThisTurnRef.current = false;
            setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle');
            setLiveTranscript(prev => {
              const last = prev[prev.length - 1];
              if (last && last.sender === 'ai') {
                return [...prev.slice(0, -1), { ...last, text: last.text + " [Interrupted]" }];
              }
              return prev;
            });
          }

          // Live API tool calls execution
          if (msg.toolCall) {
            setActiveSpeechState('thinking');
            msg.toolCall.functionCalls.forEach((call: any) => {
              let actionDesc = "";

              if (call.name === 'changeTab' && onTabChangeRef.current) {
                onTabChangeRef.current(call.args.tab);
                actionDesc = `Switched to ${String(call.args.tab).toUpperCase()} view`;
                if (postCommandActionsRef.current?.changeTab === 'triggerSim') {
                  onSetSimulationRef.current && onSetSimulationRef.current(!isSimulationRef.current);
                }
              } else if (call.name === 'diagnoseVehicle' && onDiagnoseRef.current) {
                if (postCommandActionsRef.current?.diagnoseVehicle === 'switchOBD') {
                  onTabChangeRef.current && onTabChangeRef.current('obd');
                }
                onDiagnoseRef.current();
                actionDesc = "Initiated AI vehicle health diagnosis";
              } else if (call.name === 'setNavigation' && onSetNavigationRef.current) {
                onSetNavigationRef.current(call.args.from, call.args.to);
                actionDesc = `Set navigation route: ${call.args.from} ➔ ${call.args.to}`;
                if (postCommandActionsRef.current?.setNavigation === 'autoRecord') {
                  onToggleRecordingRef.current && onToggleRecordingRef.current(true);
                } else if (postCommandActionsRef.current?.setNavigation === 'switchTab') {
                  onTabChangeRef.current && onTabChangeRef.current('gps');
                }
              } else if (call.name === 'toggleRecording' && onToggleRecordingRef.current) {
                const start = call.args.action === 'start';
                onToggleRecordingRef.current(start);
                actionDesc = `${start ? 'Started' : 'Stopped'} trip telemetry recording`;
                if (postCommandActionsRef.current?.toggleRecording === 'switchGPS') {
                  onTabChangeRef.current && onTabChangeRef.current('gps');
                }
              } else if (call.name === 'toggleSimulation' && onSetSimulationRef.current) {
                onSetSimulationRef.current(Boolean(call.args.enabled));
                actionDesc = `Vehicle simulation mode ${call.args.enabled ? 'activated' : 'deactivated'}`;
              } else if (call.name === 'optimizeRoute' && onSetNavigationRef.current) {
                const from = call.args.origin || 'Manhattan, NY';
                const to = call.args.destination || 'JFK Airport, NY';
                onSetNavigationRef.current(from, to);
                onTabChangeRef.current && onTabChangeRef.current('gps');
                actionDesc = `Optimizing low-damage route to ${to}`;
              }

              if (actionDesc) {
                setActionNotification(actionDesc);
                setTimeout(() => setActionNotification(null), 4500);
                setLiveTranscript(prev => [
                  ...prev,
                  { id: Math.random().toString(), sender: 'system', text: actionDesc, timestamp: Date.now() }
                ]);
              }
            });

            // Send tool responses back
            const response = {
              toolResponse: {
                functionResponses: msg.toolCall.functionCalls.map((call: any) => ({
                  id: call.id,
                  name: call.name,
                  response: { result: "Success: Action executed on dashboard" }
                }))
              }
            };
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(response));
            }
          }
        } catch (e: any) {
          console.error("Live message parsing error:", e);
        }
      };

      ws.onerror = () => {
        setIsLive(false);
        setActiveSpeechState('idle');
      };

      ws.onclose = () => {
        setIsLive(false);
        setActiveSpeechState('idle');
      };

    } catch (err: any) {
      console.warn("Error establishing live session:", err);
      setIsLive(false);
      setActiveSpeechState('idle');
    }
  }, [voiceVolume]);

  // Start microphone streaming
  const startMic = async () => {
    try {
      setError(null);
      ensureOutputAudio();

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        await connectLiveSession();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputAudioCtx;

      const inputAnalyser = inputAudioCtx.createAnalyser();
      inputAnalyser.fftSize = 64;
      inputAnalyserRef.current = inputAnalyser;

      const source = inputAudioCtx.createMediaStreamSource(stream);
      source.connect(inputAnalyser);

      const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(inputAudioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
          wsRef.current.send(JSON.stringify({ audio: base64 }));
        }
      };

      // Start client-side speech recognition in parallel for instant subtitles & reliable input
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';

          rec.onresult = (evt: any) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = evt.resultIndex; i < evt.results.length; ++i) {
              if (evt.results[i].isFinal) {
                finalTranscript += evt.results[i][0].transcript;
              } else {
                interimTranscript += evt.results[i][0].transcript;
              }
            }

            const currentSpoken = (finalTranscript || interimTranscript).trim();
            if (currentSpoken) {
              setActiveSpeechState('listening');
              setLiveTranscript(prev => {
                const last = prev[prev.length - 1];
                if (last && last.sender === 'user') {
                  return [...prev.slice(0, -1), { ...last, text: currentSpoken }];
                } else {
                  return [...prev, { id: Math.random().toString(), sender: 'user', text: currentSpoken, timestamp: Date.now() }];
                }
              });
            }

            if (finalTranscript.trim()) {
              const textToSend = finalTranscript.trim();
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                setActiveSpeechState('thinking');
                wsRef.current.send(JSON.stringify({ text: textToSend }));
              }
            }
          };

          rec.onerror = (e: any) => {
            if (e.error !== 'no-speech' && e.error !== 'aborted') {
              console.warn("Speech recognition warning:", e.error);
            }
          };

          rec.onend = () => {
            if (isMicActiveRef.current) {
              try { rec.start(); } catch {}
            }
          };

          rec.start();
          speechRecRef.current = rec;
        } catch (recErr) {
          console.warn("Speech recognition init exception:", recErr);
        }
      }

      setIsMicActive(true);
      setActiveSpeechState('listening');

    } catch (err: any) {
      console.warn("Microphone access denied:", err.message);
      setError("Microphone permission denied. You can continue real-time chat via text.");
      setIsMicActive(false);
      setActiveSpeechState('idle');
    }
  };

  // Stop microphone streaming
  const stopMic = () => {
    setIsMicActive(false);
    setActiveSpeechState(activeSpeechState === 'speaking' ? 'speaking' : 'idle');

    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {}
      speechRecRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    inputAnalyserRef.current = null;
  };

  // Toggle microphone
  const toggleMic = () => {
    if (isMicActive) {
      stopMic();
    } else {
      startMic();
    }
  };

  // Interrupt current AI speech
  const handleInterrupt = () => {
    resetAudioPlayback();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    currentAiSpeechTextRef.current = '';
    receivedAudioThisTurnRef.current = false;
    setActiveSpeechState(isMicActive ? 'listening' : 'idle');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ interrupt: true }));
    }
  };

  // Send text message (with voice reply & tool calls)
  const handleSendText = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    setTextInput('');
    setError(null);
    ensureOutputAudio();

    // Add user message to transcript
    const userMsgId = Math.random().toString();
    setLiveTranscript(prev => [
      ...prev,
      { id: userMsgId, sender: 'user', text: trimmed, timestamp: Date.now() }
    ]);
    savePersistentMessage({ sender: 'user', text: trimmed }, userRef.current?.uid);

    // If live WebSocket is connected, send text to Gemini Live
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setActiveSpeechState('thinking');
      wsRef.current.send(JSON.stringify({ text: trimmed, useSearch }));
    } else {
      // Offline fallback: Use /api/v1/cmd and Web Speech API
      setActiveSpeechState('thinking');
      try {
        const response = await fetch('/api/v1/cmd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmed,
            useSearch,
            contextData: {
              speed: speedRef.current,
              rpm: rpmRef.current,
              isRecording: isRecordingRef.current,
              vehicleModel: vehicleModelRef.current,
              coolantTemp: obdDataRef.current?.coolantTemp || 90,
              dtcs: obdDataRef.current?.dtcs || [],
              voltage: obdDataRef.current?.voltage || 14.2
            },
            history: liveTranscript.filter(m => m.sender === 'user' || m.sender === 'ai').map(m => ({
              sender: m.sender,
              text: m.text
            }))
          })
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();
        const replyText = data.text || data.reply || "Command executed successfully.";

        // Add AI message to transcript with web search sources
        const aiMsgId = Math.random().toString();
        setLiveTranscript(prev => [
          ...prev,
          { 
            id: aiMsgId, 
            sender: 'ai', 
            text: replyText, 
            timestamp: Date.now(),
            sources: data.sources 
          }
        ]);
        savePersistentMessage({ sender: 'ai', text: replyText }, userRef.current?.uid);

        // Execute action if returned
        const fCalls = data.functionCalls || data.actions;
        if (fCalls && fCalls.length > 0) {
          fCalls.forEach((call: any) => {
            const name = call.name || call.type;
            const args = call.args || call;
            if (name === 'changeTab' && onTabChangeRef.current) {
              onTabChangeRef.current(args.tab);
            } else if (name === 'diagnoseVehicle' && onDiagnoseRef.current) {
              onDiagnoseRef.current();
            } else if (name === 'setNavigation' && onSetNavigationRef.current) {
              onSetNavigationRef.current(args.from, args.to);
            } else if (name === 'toggleRecording' && onToggleRecordingRef.current) {
              onToggleRecordingRef.current(args.action === 'start');
            } else if (name === 'toggleSimulation' && onSetSimulationRef.current) {
              onSetSimulationRef.current(Boolean(args.enabled));
            } else if (name === 'optimizeRoute' && onSetNavigationRef.current) {
              onSetNavigationRef.current(args.origin || 'Manhattan, NY', args.destination || 'JFK Airport, NY');
              onTabChangeRef.current && onTabChangeRef.current('gps');
            }
          });
        }

        // Speak via Web Speech API in natural style
        if (voiceVolume !== 'mute' && 'speechSynthesis' in window) {
          setActiveSpeechState('speaking');
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(replyText);
          utterance.rate = 1.05;
          utterance.pitch = 0.95;
          utterance.onend = () => {
            setActiveSpeechState(isMicActive ? 'listening' : 'idle');
          };
          window.speechSynthesis.speak(utterance);
        } else {
          setActiveSpeechState(isMicActive ? 'listening' : 'idle');
        }

      } catch (err: any) {
        console.error("Text chat fallback error:", err);
        setError("Unable to process command. Please reconnect or check server.");
        setActiveSpeechState('idle');
      }
    }
  };

  // Open & connect live session on drawer open
  useEffect(() => {
    if (isOpen) {
      connectLiveSession();
    } else {
      stopMic();
      resetAudioPlayback();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsLive(false);
      setActiveSpeechState('idle');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const getStatusLabel = () => {
    switch (activeSpeechState) {
      case 'connecting': return 'Connecting to Eclipse Voice...';
      case 'listening': return 'Listening to you...';
      case 'speaking': return 'Eclipse Voice speaking...';
      case 'thinking': return 'Co-Pilot is reasoning...';
      default: return isLive ? (isMicActive ? 'Mic Active • Speak or type below' : 'Live Ready • Tap mic or type below') : 'Tap to connect Live Chat';
    }
  };

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-4 z-50 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-[0_4px_20px_rgba(16,185,129,0.35)] flex items-center gap-2.5 hover:scale-105 active:scale-95 transition-all duration-200 group border border-emerald-400/40 cursor-pointer"
          title="Open Real-time Chat with Eclipse Voice"
        >
          <div className="relative flex items-center justify-center">
            <Sparkles size={18} className="animate-pulse text-emerald-100" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300"></span>
            </span>
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold tracking-wide leading-none">Real-Time Chat</span>
            <span className="text-[9px] font-mono text-emerald-100/90 leading-tight mt-0.5">Eclipse Voice • gemini-3.8 • Search Grounded</span>
          </div>
        </button>
      )}

      {/* Real-Time Chat Assistant Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20, x: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0, 
              x: 0,
              width: isMini ? 320 : 380,
              height: isMini ? 160 : 540
            }}
            exit={{ opacity: 0, scale: 0.92, y: 20, x: 20 }}
            className="fixed bottom-6 right-4 z-[65] glass-card rounded-3xl overflow-hidden border border-emerald-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.65)] flex flex-col bg-zinc-950/95 backdrop-blur-xl"
          >
            {/* Header */}
            <div className="p-3 bg-gradient-to-r from-emerald-950/60 via-zinc-900/80 to-zinc-900/90 flex items-center justify-between border-b border-emerald-500/20 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-500/20 rounded-xl border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Radio size={14} className={cn(isLive && "animate-pulse")} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white">Live Co-Pilot</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[8px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Zephyr Voice
                    </span>
                  </div>
                  <span className="text-[8.5px] font-mono text-emerald-400/80 leading-none mt-0.5">
                    {isLive ? 'Gemini Real-Time • Active' : 'Connecting to Real-Time Voice...'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Search Grounding Data Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !useSearch;
                    setUseSearch(next);
                    localStorage.setItem('ztcd_live_use_search', String(next));
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded-full border flex items-center gap-1 text-[9px] font-mono tracking-wide transition-all cursor-pointer",
                    useSearch 
                      ? "bg-blue-500/20 text-blue-300 border-blue-400/50 hover:bg-blue-500/30" 
                      : "bg-white/5 text-white/40 border-white/10 hover:text-white/70"
                  )}
                  title={useSearch ? "Google Search Data Grounding Enabled" : "Google Search Grounding Disabled"}
                >
                  <Search size={10} className={useSearch ? "text-blue-400" : "text-white/40"} />
                  <span>Search</span>
                </button>

                {/* Voice Volume Button */}
                <button
                  onClick={cycleVolume}
                  className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white flex items-center gap-1 text-[9px] font-mono tracking-wide transition-all cursor-pointer"
                  title={`Voice Volume: ${voiceVolume.toUpperCase()} (Tap to change)`}
                >
                  {voiceVolume === 'mute' ? (
                    <VolumeX size={11} className="text-red-400" />
                  ) : voiceVolume === 'low' ? (
                    <Volume1 size={11} className="text-emerald-300" />
                  ) : (
                    <Volume2 size={11} className="text-emerald-400" />
                  )}
                  <span className="uppercase font-semibold">{voiceVolume}</span>
                </button>

                {/* Mini Toggle */}
                <button 
                  onClick={() => setIsMini(!isMini)}
                  className="p-1 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors cursor-pointer"
                  title={isMini ? "Expand Chat" : "Minimize"}
                >
                  {isMini ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                </button>

                {/* Close Button */}
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="p-1 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors cursor-pointer"
                  title="Close Live Assistant"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Persistent Memory & Telemetry Status Bar */}
            {!isMini && (
              <div className="px-3 py-1.5 bg-black/50 border-b border-white/5 flex items-center justify-between text-[9px] font-mono shrink-0">
                <span className="flex items-center gap-1.5 text-emerald-400 truncate">
                  <BrainCircuit size={11} className="shrink-0 text-emerald-400" />
                  <span className="truncate">Memory Active ({trips?.length || 0} trips • {liveTranscript.length} turns)</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-white/40">{speed} mph • {rpm} rpm</span>
                  {liveTranscript.length > 0 && (
                    <button
                      onClick={handleClearMemory}
                      className="text-white/30 hover:text-white/80 p-0.5 rounded transition-colors cursor-pointer"
                      title="Clear chat history memory"
                    >
                      <RotateCcw size={10} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Action Toast Banner */}
            {actionNotification && (
              <motion.div 
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-3 py-1.5 bg-emerald-500/20 border-b border-emerald-500/30 flex items-center gap-1.5 text-[9.5px] font-mono text-emerald-300 shrink-0"
              >
                <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
                <span className="truncate">{actionNotification}</span>
              </motion.div>
            )}

            {/* Subtitles & Scrollable Message History */}
            {!isMini ? (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-black/25 custom-scrollbar flex flex-col">
                {liveTranscript.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                      <Headphones size={22} />
                    </div>
                    <p className="text-xs font-semibold text-white/85">Real-Time Chat • Eclipse Voice</p>
                    <p className="text-[10.5px] text-white/40 max-w-[240px] leading-relaxed mt-1">
                      Speak freely or type below. Eclipse voice listens, replies in real-time audio, and executes live vehicle commands.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {liveTranscript.map((msg) => (
                      <div key={msg.id} className={cn("flex flex-col gap-1", msg.sender === 'user' ? "items-end" : msg.sender === 'system' ? "items-center" : "items-start")}>
                        {msg.sender !== 'system' && (
                          <span className="text-[8px] font-mono uppercase tracking-wider text-white/30 flex items-center gap-1 px-1">
                            {msg.sender === 'user' ? (
                              <>You <User size={8} /></>
                            ) : (
                              <><Bot size={8} /> Eclipse Voice</>
                            )}
                          </span>
                        )}

                        {msg.sender === 'system' ? (
                          <div className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-mono text-emerald-300/80 flex items-center gap-1.5 my-1">
                            <Activity size={10} className="text-emerald-400" />
                            <span>{msg.text}</span>
                          </div>
                        ) : (
                          <div className={cn(
                            "max-w-[85%] px-3 py-2 rounded-2xl text-[11px] leading-relaxed font-sans shadow-md",
                            msg.sender === 'user' 
                              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-none border border-emerald-400/30" 
                              : "bg-zinc-900/90 text-white/90 border border-emerald-500/15 rounded-tl-none"
                          )}>
                            <div>{msg.text}</div>
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="mt-2 pt-1.5 border-t border-white/10 flex flex-wrap gap-1.5 items-center">
                                <span className="text-[9px] text-blue-400 flex items-center gap-1 font-medium">
                                  <Search size={9} /> Sources:
                                </span>
                                {msg.sources.map((src, srcIdx) => (
                                  <a
                                    key={srcIdx}
                                    href={src.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[9px] bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                                  >
                                    <span className="truncate max-w-[120px]">{src.title}</span>
                                    <ExternalLink size={8} className="shrink-0 opacity-70" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-center px-4 py-2">
                <span className="text-[8px] uppercase tracking-wider font-mono text-white/40">Latest turn</span>
                <p className="text-[11px] text-white/90 truncate font-sans mt-0.5">
                  {liveTranscript[liveTranscript.length - 1]?.text || "Ready for voice or text"}
                </p>
              </div>
            )}

            {/* Waveform & Speech Status */}
            <div className="px-3 pt-2 bg-zinc-950/90 border-t border-white/5 shrink-0 flex flex-col items-center">
              {error && (
                <div className="w-full mb-2 text-[9.5px] text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-amber-500/25">
                  <AlertTriangle size={11} className="shrink-0" />
                  <span className="truncate flex-1">{error}</span>
                  {!isLive && (
                    <button 
                      onClick={connectLiveSession}
                      className="underline text-emerald-300 hover:text-white shrink-0 ml-1 cursor-pointer"
                    >
                      Reconnect
                    </button>
                  )}
                </div>
              )}

              {/* Canvas Waveform */}
              <div className="w-full relative flex flex-col items-center">
                <canvas 
                  ref={canvasRef} 
                  width={340} 
                  height={32} 
                  className="w-full h-8 bg-black/40 rounded-xl border border-white/5 shadow-inner" 
                />
                <div className="flex items-center justify-between w-full px-1 mt-1">
                  <span className={cn(
                    "text-[9.5px] font-medium font-sans truncate",
                    activeSpeechState === 'speaking' && "text-emerald-400 font-semibold",
                    activeSpeechState === 'listening' && "text-sky-400 font-semibold",
                    activeSpeechState === 'thinking' && "text-amber-400 animate-pulse",
                    activeSpeechState === 'connecting' && "text-white/60",
                    activeSpeechState === 'idle' && "text-white/40"
                  )}>
                    {getStatusLabel()}
                  </span>

                  {/* Interrupt Button (Visible during AI speech) */}
                  {activeSpeechState === 'speaking' && (
                    <button
                      onClick={handleInterrupt}
                      className="px-2 py-0.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[8.5px] font-mono flex items-center gap-1 transition-all cursor-pointer"
                      title="Stop Eclipse voice speech"
                    >
                      <Square size={8} fill="currentColor" />
                      <span>Interrupt</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Action Prompt Chips (Expanded mode only) */}
            {!isMini && (
              <div className="px-3 py-1.5 bg-zinc-950/90 flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => handleSendText("Search web for vehicle recalls, TSBs, and live road conditions in New York")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/40 text-[9px] font-medium text-blue-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Search size={10} className="text-blue-400" />
                  <span>Search Recalls & Traffic</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("Diagnose vehicle health and scan for OBD fault codes")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-white/10 text-[9px] font-medium text-white/70 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Wrench size={10} className="text-emerald-400" />
                  <span>Diagnose Health</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("Recommend the best route in New York to reduce vehicle wear")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-white/10 text-[9px] font-medium text-white/70 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Navigation size={10} className="text-sky-400" />
                  <span>Optimize Route</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("What is my current speed, RPM, and engine status?")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-white/10 text-[9px] font-medium text-white/70 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Gauge size={10} className="text-amber-400" />
                  <span>Speed & RPM</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("Switch to GPS navigation map")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-white/10 text-[9px] font-medium text-white/70 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Compass size={10} className="text-emerald-400" />
                  <span>GPS Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("Toggle vehicle simulation telemetry")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-white/10 text-[9px] font-medium text-white/70 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Zap size={10} className="text-purple-400" />
                  <span>Toggle Sim</span>
                </button>
              </div>
            )}

            {/* Input Bar & Mic Toggle */}
            <div className="p-3 bg-zinc-950 border-t border-emerald-500/20 shrink-0">
              <div className="flex items-center gap-2">
                {/* Voice Toggle Button */}
                <button
                  type="button"
                  onClick={toggleMic}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0",
                    isMicActive 
                      ? "bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse" 
                      : "bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400"
                  )}
                  title={isMicActive ? "Stop microphone" : "Start continuous microphone streaming"}
                >
                  {isMicActive ? <MicOff size={16} /> : <Mic size={16} />}
                </button>

                {/* Text Input */}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendText(textInput)}
                    placeholder="Speak or type to Eclipse Voice..."
                    className="w-full bg-zinc-900/90 border border-white/10 rounded-xl py-2 px-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400/60 transition-all font-sans"
                  />
                </div>

                {/* Send Button */}
                <button
                  type="button"
                  onClick={() => handleSendText(textInput)}
                  disabled={!textInput.trim()}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0",
                    textInput.trim() 
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:brightness-110" 
                      : "bg-white/5 text-white/30 border border-white/5 cursor-not-allowed"
                  )}
                  title="Send message to Eclipse Voice"
                >
                  {activeSpeechState === 'thinking' ? (
                    <Loader2 size={15} className="animate-spin text-emerald-400" />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

export default LiveChatAssistant;
