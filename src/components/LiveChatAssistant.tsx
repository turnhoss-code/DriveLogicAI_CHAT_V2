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
  ExternalLink,
  Siren,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { pcmToBase64, playAudioChunk, resetAudioPlayback, speakWithEclipseTTS } from '../lib/audioUtils';
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
  onConnectOBD?: () => void;
  onConnectSerial?: () => void;
  onToggleRecording?: (start: boolean) => void;
  onLogDamagePoint?: (severity: 'Minor' | 'Moderate' | 'Severe', label?: string) => void;
  onExecuteVoiceCommand?: (name: string, args: any) => string | void;
  postCommandActions?: any;
  isSimulation?: boolean;
  onSetSimulation?: (sim: boolean) => void;
  trips?: any[];
  vehicleModel?: string;
  user?: any;
  obdData?: any;
  navigation?: any;
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
  sendCommand: (cmd: string) => void;
}

const DRIVE_LOGIC_GREETING = "Hi, I'm DriveLogic. How can I assist you?";

const LiveChatAssistant = forwardRef<LiveChatAssistantHandle, LiveChatAssistantProps>(({ 
  speed = 0, 
  rpm = 800, 
  isRecording = false,
  onTabChange,
  onSetNavigation,
  onDiagnose,
  onConnectOBD,
  onConnectSerial,
  onToggleRecording,
  onLogDamagePoint,
  onExecuteVoiceCommand,
  postCommandActions,
  isSimulation = false,
  onSetSimulation,
  trips = [],
  vehicleModel = '2023 Toyota Camry',
  user,
  obdData,
  navigation
}: LiveChatAssistantProps, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMini, setIsMini] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(true);
  const [proactiveAlertsEnabled, setProactiveAlertsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('ztcd_proactive_911_alerts') !== 'false';
  });
  const [isScanningRadar, setIsScanningRadar] = useState(false);
  const [proactiveBanner, setProactiveBanner] = useState<{
    text: string;
    location: string;
    sources?: { title: string; uri: string }[];
    feeds?: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [voiceVolume, setVoiceVolume] = useState<'low' | 'medium' | 'high' | 'mute'>(() => {
    return (localStorage.getItem('ztcd_gemini_voice_volume') as any) || 'high';
  });
  const liveVoice = 'Kore'; // Exclusively Eclipse natural voice (Gemini Live)
  const [useSearch, setUseSearch] = useState<boolean>(() => {
    return localStorage.getItem('ztcd_live_use_search') !== 'false';
  });
  const [actionNotification, setActionNotification] = useState<string | null>(null);

  // Real-time transcript logs seeded with the signature DriveLogic greeting
  const [liveTranscript, setLiveTranscript] = useState<TranscriptItem[]>([
    {
      id: 'initial-drive-logic-greeting',
      sender: 'ai',
      text: DRIVE_LOGIC_GREETING,
      timestamp: Date.now()
    }
  ]);
  const [activeSpeechState, setActiveSpeechState] = useState<'idle' | 'connecting' | 'listening' | 'speaking' | 'thinking'>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const isLiveRef = useRef<boolean>(false);
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
  const onConnectOBDRef = useRef(onConnectOBD);
  const onConnectSerialRef = useRef(onConnectSerial);
  const onToggleRecordingRef = useRef(onToggleRecording);
  const onLogDamagePointRef = useRef(onLogDamagePoint);
  const onExecuteVoiceCommandRef = useRef(onExecuteVoiceCommand);
  const onSetSimulationRef = useRef(onSetSimulation);
  const tripsRef = useRef(trips);
  const vehicleModelRef = useRef(vehicleModel);
  const userRef = useRef(user);
  const obdDataRef = useRef(obdData);
  const navigationRef = useRef(navigation);
  const speedRef = useRef(speed);
  const rpmRef = useRef(rpm);
  const isRecordingRef = useRef(isRecording);
  const isMicActiveRef = useRef(isMicActive);
  const wakeWordActiveRef = useRef(wakeWordActive);
  const proactiveAlertsEnabledRef = useRef(proactiveAlertsEnabled);
  const speechRecRef = useRef<any>(null);
  const wakeWordRecRef = useRef<any>(null);
  const hasSpokenInitialGreetingRef = useRef<boolean>(false);
  const hasRunInitialProactiveScanRef = useRef<boolean>(false);
  const lastScannedDestinationRef = useRef<string>('');
  const receivedAudioThisTurnRef = useRef<boolean>(false);
  const currentAiSpeechTextRef = useRef<string>('');
  const runProactiveHazardBriefingRef = useRef<(targetLoc?: string, preloadedText?: string, preloadedSources?: { title: string; uri: string }[]) => Promise<void>>(async () => {});

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);



  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  useEffect(() => {
    wakeWordActiveRef.current = wakeWordActive;
  }, [wakeWordActive]);

  useEffect(() => {
    proactiveAlertsEnabledRef.current = proactiveAlertsEnabled;
  }, [proactiveAlertsEnabled]);

  useEffect(() => {
    postCommandActionsRef.current = postCommandActions;
    isSimulationRef.current = isSimulation;
    onTabChangeRef.current = onTabChange;
    onSetNavigationRef.current = onSetNavigation;
    onDiagnoseRef.current = onDiagnose;
    onConnectOBDRef.current = onConnectOBD;
    onConnectSerialRef.current = onConnectSerial;
    onToggleRecordingRef.current = onToggleRecording;
    onLogDamagePointRef.current = onLogDamagePoint;
    onExecuteVoiceCommandRef.current = onExecuteVoiceCommand;
    onSetSimulationRef.current = onSetSimulation;
    tripsRef.current = trips;
    vehicleModelRef.current = vehicleModel;
    userRef.current = user;
    obdDataRef.current = obdData;
    navigationRef.current = navigation;
    speedRef.current = speed;
    rpmRef.current = rpm;
    isRecordingRef.current = isRecording;
  }, [postCommandActions, isSimulation, onTabChange, onSetNavigation, onDiagnose, onConnectOBD, onConnectSerial, onToggleRecording, onLogDamagePoint, onExecuteVoiceCommand, onSetSimulation, trips, vehicleModel, user, obdData, navigation, speed, rpm, isRecording]);

  // Unified voice command executor for all 13 DriveLogic tool categories
  const executeToolCall = useCallback((call: any) => {
    const name = call.name || call.type;
    const args = call.args || call || {};
    let actionDesc = "";

    // Broadcast event so any open component (3D Studio, OBDTab, GPSTab, FloatingMap, App) can react
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('drivelogic:command', { detail: { name, args } }));
    }

    if (onExecuteVoiceCommandRef.current) {
      const customDesc = onExecuteVoiceCommandRef.current(name, args);
      if (customDesc) actionDesc = customDesc;
    }

    if (name === 'changeTab' && onTabChangeRef.current) {
      onTabChangeRef.current(args.tab);
      actionDesc = actionDesc || `Switched to ${String(args.tab).toUpperCase()} tab`;
      if (postCommandActionsRef.current?.changeTab === 'triggerSim') {
        onSetSimulationRef.current && onSetSimulationRef.current(!isSimulationRef.current);
      }
    } else if (name === 'diagnoseVehicle') {
      if (postCommandActionsRef.current?.diagnoseVehicle === 'switchOBD') {
        onTabChangeRef.current && onTabChangeRef.current('obd');
      }
      if (args.dtcCode) {
        onTabChangeRef.current && onTabChangeRef.current('obd');
        actionDesc = actionDesc || `Looking up DTC ${args.dtcCode} with Google Search`;
      } else if (args.downloadReport) {
        actionDesc = actionDesc || `Downloaded Vehicle Diagnostic Report`;
      } else if (onDiagnoseRef.current) {
        onDiagnoseRef.current();
        actionDesc = actionDesc || "Initiated AI vehicle health & web diagnosis";
      }
    } else if (name === 'connectOBD') {
      onTabChangeRef.current && onTabChangeRef.current('obd');
      if (args.method === 'usb' && onConnectSerialRef.current) {
        onConnectSerialRef.current();
        actionDesc = actionDesc || "Connecting to OBD-II via USB Serial...";
      } else if (onConnectOBDRef.current) {
        onConnectOBDRef.current();
        actionDesc = actionDesc || "Auto-detecting ELM327 BLE module & sensing vehicle protocol";
      }
    } else if (name === 'setNavigation') {
      if (args.clear) {
        actionDesc = actionDesc || "Cleared active GPS route";
      } else if (args.from || args.to) {
        onSetNavigationRef.current && onSetNavigationRef.current(args.from || 'Current Location', args.to || 'Destination');
        actionDesc = actionDesc || `Set navigation route: ${args.from || 'Current Location'} ➔ ${args.to}`;
        if (postCommandActionsRef.current?.setNavigation === 'autoRecord') {
          onToggleRecordingRef.current && onToggleRecordingRef.current(true);
        } else if (postCommandActionsRef.current?.setNavigation === 'switchTab') {
          onTabChangeRef.current && onTabChangeRef.current('gps');
        }
      }
    } else if (name === 'toggleRecording' && onToggleRecordingRef.current) {
      const start = args.action === 'start';
      onToggleRecordingRef.current(start);
      actionDesc = actionDesc || `${start ? 'Started' : 'Stopped'} trip & accelerometer damage recording`;
      if (postCommandActionsRef.current?.toggleRecording === 'switchGPS') {
        onTabChangeRef.current && onTabChangeRef.current('gps');
      }
    } else if (name === 'toggleSimulation' && onSetSimulationRef.current) {
      onSetSimulationRef.current(Boolean(args.enabled));
      actionDesc = actionDesc || `Vehicle simulation mode ${args.enabled ? 'activated' : 'deactivated'}`;
    } else if (name === 'logDamagePoint' && onLogDamagePointRef.current) {
      const sev = (args.severity === 'Severe' || args.severity === 'Moderate') ? args.severity : 'Minor';
      onLogDamagePointRef.current(sev, args.label);
      actionDesc = actionDesc || `Logged ${sev} road damage point${args.label ? `: ${args.label}` : ''}`;
    } else if (name === 'optimizeRoute' && onSetNavigationRef.current) {
      const from = args.origin || 'Current Location';
      const to = args.destination || 'Destination';
      onSetNavigationRef.current(from, to);
      onTabChangeRef.current && onTabChangeRef.current('gps');
      actionDesc = actionDesc || `Optimizing low-damage route to ${to}`;
    } else if (name === 'showHazards') {
      onTabChangeRef.current && onTabChangeRef.current('gps');
      actionDesc = actionDesc || `Updated 911, Crime Radar, Waze & weather overlays`;
    } else if (name === 'scanUpcomingProblems') {
      onTabChangeRef.current && onTabChangeRef.current('gps');
      runProactiveHazardBriefingRef.current(args.location);
      actionDesc = actionDesc || `Scanning 911 CAD, Crime Radar, Waze, Weather, Prior Trips & Prior Chats...`;
    } else if (name === 'manageMaintenance') {
      onTabChangeRef.current && onTabChangeRef.current('maintenance');
      actionDesc = actionDesc || `Updated Vehicle Maintenance (${args.action || 'view'})`;
    } else if (name === 'controlSettings') {
      actionDesc = actionDesc || `Executed Settings command: ${args.action}`;
    } else if (name === 'controlAssistant') {
      if (args.action === 'open' || args.action === 'expand') {
        setIsOpen(true);
        setIsMini(false);
      } else if (args.action === 'minimize') {
        setIsMini(true);
      } else if (args.action === 'close') {
        setIsOpen(false);
      } else if (args.action === 'clearMemory') {
        clearPersistentHistory(userRef.current?.uid);
        setLiveTranscript([{ id: 'initial-drive-logic-greeting', sender: 'ai', text: DRIVE_LOGIC_GREETING, timestamp: Date.now() }]);
      } else if (args.action === 'mute') {
        setVoiceVolume('mute');
      } else if (args.action === 'unmute') {
        setVoiceVolume('high');
      } else if (args.action === 'volumeUp') {
        setVoiceVolume('high');
      } else if (args.action === 'volumeDown') {
        setVoiceVolume('low');
      }
      actionDesc = actionDesc || `DriveLogic Assistant: ${args.action}`;
    }

    if (actionDesc) {
      setActionNotification(actionDesc);
      setTimeout(() => setActionNotification(null), 4500);
      setLiveTranscript(prev => [
        ...prev,
        { id: Math.random().toString(), sender: 'system', text: actionDesc, timestamp: Date.now() }
      ]);
    }
  }, []);

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
    },
    sendCommand: (cmd: string) => {
      setIsOpen(true);
      setIsMini(false);
      handleSendText(cmd);
    }
  }));

  const getGainValue = (vol: 'low' | 'medium' | 'high' | 'mute') => {
    switch (vol) {
      case 'mute': return 0;
      case 'low': return 0.35;
      case 'medium': return 0.75;
      case 'high': return 1.25;
      default: return 0.85;
    }
  };

  const cycleVolume = () => {
    const sequence: ('low' | 'medium' | 'high' | 'mute')[] = ['low', 'medium', 'high', 'mute'];
    const currentIndex = sequence.indexOf(voiceVolume);
    const next = sequence[(currentIndex + 1) % sequence.length];
    setVoiceVolume(next);
    localStorage.setItem('ztcd_gemini_voice_volume', next);
    if (outputGainRef.current) {
    }
  };

  // Load persistent chat history on mount or user switch, keeping greeting at start
  useEffect(() => {
    let active = true;
    loadChatHistory(user?.uid).then(history => {
      if (active && history && history.length > 0) {
        const mapped = history.map(h => ({ 
          id: h.id, 
          sender: h.sender as any, 
          text: h.text,
          timestamp: h.timestamp 
        }));
        const hasGreeting = mapped.some(m => m.text.includes("Hi, I'm DriveLogic") || m.text.includes("Hi, I'm Drive Logic"));
        setLiveTranscript(hasGreeting ? mapped : [
          { id: 'initial-drive-logic-greeting', sender: 'ai', text: DRIVE_LOGIC_GREETING, timestamp: Date.now() },
          ...mapped
        ]);
      }
    });
    return () => { active = false; };
  }, [user?.uid]);

  const handleClearMemory = async () => {
    await clearPersistentHistory(user?.uid);
    setLiveTranscript([
      { id: 'initial-drive-logic-greeting', sender: 'ai', text: DRIVE_LOGIC_GREETING, timestamp: Date.now() }
    ]);
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

        const effectiveVoice = localStorage.getItem('ztcd_live_voice') || 'Kore';

        // Send init frame specifying natural voice (Kore / Eclipse, Aoede, Puck, Fenrir, Charon)
        ws.send(JSON.stringify({
          type: 'init',
          voice: effectiveVoice,
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

          // Live Audio Output chunks (24kHz PCM from Gemini Live / Eclipse TTS)
          if (msg.audio) {
            receivedAudioThisTurnRef.current = true;
            setActiveSpeechState('speaking');
            ensureOutputAudio();
            if (outputAudioCtxRef.current) {
              if (outputAudioCtxRef.current.state === 'suspended') {
                outputAudioCtxRef.current.resume().catch(() => {});
              }
              playAudioChunk(
                outputAudioCtxRef.current,
                msg.audio,
                outputAnalyserRef.current || outputAudioCtxRef.current.destination,
                () => setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle')
              );
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

            // If no native audio chunks arrived from live stream, synthesize with Eclipse Neural Female Voice (Kore)
            if (!hadAudio && spokenSoFar && voiceVolume !== 'mute') {
              setActiveSpeechState('speaking');
              ensureOutputAudio();
              speakWithEclipseTTS(
                spokenSoFar,
                outputAudioCtxRef.current,
                outputAnalyserRef.current || undefined,
                () => setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle')
              );
            } else if (!hadAudio) {
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

          // Live API tool calls execution across all 13 DriveLogic features
          if (msg.toolCall) {
            setActiveSpeechState('thinking');
            msg.toolCall.functionCalls.forEach((call: any) => {
              executeToolCall(call);
            });

            // Send tool responses back
            const response = {
              toolResponse: {
                functionResponses: msg.toolCall.functionCalls.map((call: any) => ({
                  id: call.id,
                  name: call.name,
                  response: { result: "Success: Action executed on DriveLogic dashboard" }
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
  }, [voiceVolume, executeToolCall]);

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

      // Start client-side speech recognition in parallel for instant subtitles & search-grounded voice execution
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
                wsRef.current.send(JSON.stringify({ text: textToSend, useSearch: true }));
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

  // Send text message (with Eclipse natural female voice reply, Google Search grounding & tool calls)
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
      // REST fallback: Use /api/v1/cmd (which returns Google Search Grounding + Eclipse 24kHz PCM audio)
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
        const replyText = data.text || data.reply || "Command executed.";

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

        // Execute all returned voice tool actions
        const fCalls = data.functionCalls || data.actions;
        if (fCalls && fCalls.length > 0) {
          fCalls.forEach((call: any) => executeToolCall(call));
        }

        // Play Eclipse natural female voice (either pre-rendered data.audio or via speakWithEclipseTTS)
        if (voiceVolume !== 'mute') {
          setActiveSpeechState('speaking');
          ensureOutputAudio();
          if (data.audio && outputAudioCtxRef.current && outputAnalyserRef.current) {
            playAudioChunk(
              outputAudioCtxRef.current,
              data.audio,
              outputAnalyserRef.current,
              () => setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle')
            );
          } else if (outputAudioCtxRef.current && outputAnalyserRef.current) {
            speakWithEclipseTTS(
              replyText,
              outputAudioCtxRef.current,
              outputAnalyserRef.current,
              () => setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle')
            );
          } else {
            setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle');
          }
        } else {
          setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle');
        }

      } catch (err: any) {
        console.error("Text chat fallback error:", err);
        setError("Unable to process command. Please reconnect or check server.");
        setActiveSpeechState('idle');
      }
    }
  };

  // Speak DriveLogic greeting helper using Eclipse Neural Female Voice (Kore)
  const speakGreeting = useCallback((appendTranscript = false) => {
    if (appendTranscript) {
      setLiveTranscript(prev => {
        const last = prev[prev.length - 1];
        if (last && last.text === DRIVE_LOGIC_GREETING) return prev;
        return [...prev, { id: Math.random().toString(), sender: 'ai', text: DRIVE_LOGIC_GREETING, timestamp: Date.now() }];
      });
    }
    if (voiceVolume !== 'mute' && typeof window !== 'undefined') {
      try {
        setActiveSpeechState('speaking');
        ensureOutputAudio();
        if (outputAudioCtxRef.current && outputAnalyserRef.current) {
          speakWithEclipseTTS(
            DRIVE_LOGIC_GREETING,
            outputAudioCtxRef.current,
            outputAnalyserRef.current,
            () => setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle')
          );
        }
      } catch {
        setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle');
      }
    }
  }, [voiceVolume]);

  // Automatically speak "Hi, I'm DriveLogic. How can I assist you?" as soon as the app loads
  useEffect(() => {
    if (hasSpokenInitialGreetingRef.current) return;
    hasSpokenInitialGreetingRef.current = true;

    const timer = setTimeout(() => {
      speakGreeting(false);
    }, 600);

    // Also attach a one-time gesture listener in case browser autoplay policy deferred AudioContext
    const unlockAndSpeak = () => {
      ensureOutputAudio();
      window.removeEventListener('pointerdown', unlockAndSpeak);
      window.removeEventListener('keydown', unlockAndSpeak);
    };
    window.addEventListener('pointerdown', unlockAndSpeak, { once: true });
    window.addEventListener('keydown', unlockAndSpeak, { once: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', unlockAndSpeak);
      window.removeEventListener('keydown', unlockAndSpeak);
    };
  }, [speakGreeting]);

  // Continuous background wake-word detection for "Hey, DriveLogic" with auto-reconnect
  useEffect(() => {
    if (!wakeWordActive || isMicActive) {
      if (wakeWordRecRef.current) {
        try { wakeWordRecRef.current.stop(); } catch {}
        wakeWordRecRef.current = null;
      }
      return;
    }

    // @ts-ignore
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) return;

    let isMounted = true;
    let restartTimer: any = null;

    const startWakeWordListener = () => {
      if (!isMounted || !wakeWordActiveRef.current || isMicActiveRef.current) return;
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onresult = (evt: any) => {
          for (let i = evt.resultIndex; i < evt.results.length; ++i) {
            const transcript = String(evt.results[i][0]?.transcript || '').toLowerCase().trim();
            const wakeMatch = transcript.match(/\b(?:hey|hi|ok|okay)?\s*drive\s*logic\b/i);
            if (wakeMatch) {
              const afterWake = transcript.slice((wakeMatch.index || 0) + wakeMatch[0].length).replace(/^[,.\s]+/, '').trim();
              setActionNotification('Wake Word Detected: "Hey, DriveLogic"');
              setTimeout(() => setActionNotification(null), 3500);
              setIsOpen(true);
              setIsMini(false);

              try { rec.stop(); } catch {}
              wakeWordRecRef.current = null;

              if (afterWake.length > 2 && evt.results[i].isFinal) {
                handleSendText(afterWake);
              } else {
                speakGreeting(true);
                startMic();
              }
              return;
            }
          }
        };

        rec.onerror = () => {
          // Auto-reconnect silently on no-speech or transient browser errors
        };

        rec.onend = () => {
          if (isMounted && wakeWordActiveRef.current && !isMicActiveRef.current) {
            restartTimer = setTimeout(() => {
              startWakeWordListener();
            }, 600);
          }
        };

        rec.start();
        wakeWordRecRef.current = rec;
      } catch {
        // Retry if speech recognition is temporarily busy
        restartTimer = setTimeout(startWakeWordListener, 2000);
      }
    };

    startWakeWordListener();

    return () => {
      isMounted = false;
      if (restartTimer) clearTimeout(restartTimer);
      if (wakeWordRecRef.current) {
        try { wakeWordRecRef.current.stop(); } catch {}
        wakeWordRecRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeWordActive, isMicActive]);

  // Hands-Free Proactive Multi-Source 911 / Crime Radar / Waze / Weather / Prior-Trips / Prior-Chats Verbal Briefing
  const runProactiveHazardBriefing = useCallback(
    async (
      targetLocation?: string,
      preloadedVerbalAlert?: string,
      preloadedSources?: { title: string; uri: string }[]
    ) => {
      if (isScanningRadar) return;
      setIsScanningRadar(true);

      const effectiveLocation =
        targetLocation ||
        navigationRef.current?.to ||
        navigationRef.current?.from ||
        'Albany, NY';

      try {
        ensureOutputAudio();

        if (preloadedVerbalAlert) {
          setProactiveBanner({
            text: preloadedVerbalAlert,
            location: effectiveLocation,
            sources: preloadedSources,
            feeds: ['911 CAD Dispatch', 'Crime Radar App', 'Waze Live', 'Prior Trips', 'Prior Chats', 'Weather Radar']
          });

          setLiveTranscript(prev => [
            ...prev,
            {
              id: Math.random().toString(),
              sender: 'ai',
              text: preloadedVerbalAlert,
              timestamp: Date.now(),
              sources: preloadedSources
            }
          ]);
          savePersistentMessage({ sender: 'ai', text: preloadedVerbalAlert }, userRef.current?.uid);

          if (voiceVolume !== 'mute' && outputAudioCtxRef.current && outputAnalyserRef.current) {
            setActiveSpeechState('speaking');
            await speakWithEclipseTTS(
              preloadedVerbalAlert,
              outputAudioCtxRef.current,
              outputAnalyserRef.current,
              () => setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle')
            );
          }
          setIsScanningRadar(false);
          return;
        }

        // Gather all 5 required intelligence contexts:
        // 1. Prior Chats, 2. Prior Trips & Vibration Logs, 3. GPS Coords & Route, 4. Live Telemetry, 5. Server Web Search + 911/Crime Radar/Waze/Weather Scraper
        const priorChats = await loadChatHistory(userRef.current?.uid);
        const priorChatsSummary = formatPriorChatsSummary(priorChats);
        const priorTripsSummary = formatPriorTripsSummary(tripsRef.current || []);
        const harshEventsSummary = formatHarshEventsSummary(tripsRef.current || []);

        let lat = 42.6526;
        let lng = -73.7562;
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 2200,
                maximumAge: 30000
              });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
          } catch {
            // Use default NY corridor coordinates if geolocation times out
          }
        }

        const customKey = localStorage.getItem('ztcd_gemini_api_key');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (customKey && customKey.trim()) {
          headers['x-gemini-api-key'] = customKey.trim();
        }

        const res = await fetch('/api/v1/proactive-radar', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            location: effectiveLocation,
            lat,
            lng,
            priorTripsSummary,
            harshEventsSummary,
            priorChatsSummary,
            telemetry: {
              speed: speedRef.current,
              rpm: rpmRef.current,
              isRecording: isRecordingRef.current,
              coolantTemp: obdDataRef.current?.coolantTemp || 90,
              dtcs: obdDataRef.current?.dtcs || [],
              voltage: obdDataRef.current?.voltage || 14.2
            },
            includeAudio: true
          })
        });

        if (!res.ok) {
          throw new Error(`Proactive radar returned ${res.status}`);
        }

        const data = await res.json();
        const verbalText =
          data.verbalAlert ||
          data.summary ||
          `Heads up from DriveLogic: Scanning 911 dispatch, Crime Radar, Waze, and prior trip logs for ${effectiveLocation}. Drive with caution.`;

        const feedLabels = Array.isArray(data.scrapedFeeds)
          ? data.scrapedFeeds.map((f: any) => f.source)
          : ['911 CAD Dispatch', 'Crime Radar App', 'Waze Live', 'Prior Trips', 'Prior Chats', 'Weather Radar'];

        setProactiveBanner({
          text: verbalText,
          location: data.location || effectiveLocation,
          sources: data.sources,
          feeds: feedLabels
        });

        setLiveTranscript(prev => [
          ...prev,
          {
            id: Math.random().toString(),
            sender: 'ai',
            text: verbalText,
            timestamp: Date.now(),
            sources: data.sources
          }
        ]);
        savePersistentMessage({ sender: 'ai', text: verbalText }, userRef.current?.uid);

        if (voiceVolume !== 'mute') {
          setActiveSpeechState('speaking');
          ensureOutputAudio();
          if (data.audio && outputAudioCtxRef.current && outputAnalyserRef.current) {
            playAudioChunk(
              outputAudioCtxRef.current,
              data.audio,
              outputAnalyserRef.current,
              () => setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle')
            );
          } else if (outputAudioCtxRef.current && outputAnalyserRef.current) {
            await speakWithEclipseTTS(
              verbalText,
              outputAudioCtxRef.current,
              outputAnalyserRef.current,
              () => setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle')
            );
          } else {
            setActiveSpeechState(isMicActiveRef.current ? 'listening' : 'idle');
          }
        }
      } catch (err) {
        console.warn('[DriveLogic Proactive 911 & Hazard Scan Notice]:', err);
      } finally {
        setIsScanningRadar(false);
      }
    },
    [isScanningRadar, voiceVolume]
  );

  useEffect(() => {
    runProactiveHazardBriefingRef.current = runProactiveHazardBriefing;
  }, [runProactiveHazardBriefing]);

  // Listen for manual or automated "drivelogic:proactive-scan" events from anywhere in the app
  useEffect(() => {
    const onProactiveScan = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      runProactiveHazardBriefingRef.current(detail.location, detail.verbalAlert, detail.sources);
    };
    window.addEventListener('drivelogic:proactive-scan', onProactiveScan);
    return () => window.removeEventListener('drivelogic:proactive-scan', onProactiveScan);
  }, []);

  // Hazard, 911 CAD, and Crime Radar briefings are spoken ONLY UPON REQUEST from the driver
  // (via voice command e.g. "What's ahead on my route?", "Check crime radar", or tapping "Radar On Request").

  // Keep Gemini Live WebSocket connected in the background for instant hands-free operation
  useEffect(() => {
    connectLiveSession();
    return () => {
      stopMic();
      resetAudioPlayback();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also ensure session is connected whenever drawer is opened
  useEffect(() => {
    if (isOpen) {
      connectLiveSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const getStatusLabel = () => {
    if (isScanningRadar) return 'Scraping 911 CAD, Crime Radar, Waze, Weather & Trip Logs...';
    switch (activeSpeechState) {
      case 'connecting': return 'Connecting to DriveLogic (Eclipse Voice)...';
      case 'listening': return 'DriveLogic listening hands-free...';
      case 'speaking': return 'DriveLogic (Eclipse) speaking...';
      case 'thinking': return 'DriveLogic searching web & 911 feeds...';
      default: return isLive ? (isMicActive ? 'Hands-Free Mic Active • Speak anytime' : 'Hands-Free Wake: "Hey, DriveLogic" • 911 Radar Active') : 'Hands-Free Wake: "Hey, DriveLogic"';
    }
  };

  return (
    <>
      {/* Non-Intrusive Hands-Free Proactive 911 / Crime Radar / Waze / Prior-Trip Verbal Alert Banner */}
      <AnimatePresence>
        {proactiveBanner && !isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            className="fixed bottom-32 left-3 right-3 max-w-md mx-auto z-40 glass-card rounded-2xl p-3 border border-rose-500/40 bg-zinc-950/95 backdrop-blur-xl shadow-[0_8px_30px_rgba(244,63,94,0.28)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[8.5px] font-mono font-bold uppercase flex items-center gap-1">
                  <Siren size={10} className="animate-pulse text-rose-400" />
                  <span>911 • Crime Radar • Waze • Trip Log Alert</span>
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[8px] font-mono">
                  Eclipse Voice Live
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => runProactiveHazardBriefing(proactiveBanner.location, proactiveBanner.text, proactiveBanner.sources)}
                  className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[8.5px] font-mono cursor-pointer"
                  title="Replay verbal warning"
                >
                  Replay
                </button>
                <button
                  type="button"
                  onClick={() => setProactiveBanner(null)}
                  className="p-1 text-white/40 hover:text-white rounded cursor-pointer"
                  title="Dismiss banner"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-white/90 leading-snug mt-1.5 font-sans">
              {proactiveBanner.text}
            </p>

            {proactiveBanner.sources && proactiveBanner.sources.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[8.5px] font-mono text-blue-300 shrink-0 flex items-center gap-0.5">
                  <Search size={8} /> Grounded:
                </span>
                {proactiveBanner.sources.slice(0, 3).map((src, idx) => (
                  <a
                    key={idx}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[8.5px] font-mono text-white/60 hover:text-emerald-300 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 truncate max-w-[130px] shrink-0"
                  >
                    {src.title}
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Launcher Button + Instant Hands-Free 911 Radar Trigger (Positioned above bottom nav on the left side) */}
      {!isOpen && (
        <div className="fixed bottom-20 left-4 z-40 flex items-center gap-1.5">
          <button
            onClick={() => {
              setIsOpen(true);
              setIsMini(false);
            }}
            className="px-3.5 py-2 rounded-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-[0_4px_20px_rgba(16,185,129,0.35)] flex items-center gap-2 hover:scale-105 active:scale-95 transition-all duration-200 group border border-emerald-400/40 cursor-pointer"
            title='Open DriveLogic Live Voice Chat (Eclipse Female Voice • Google Search & 911 Radar Grounded)'
          >
            <div className="relative flex items-center justify-center">
              <Sparkles size={16} className="animate-pulse text-emerald-100" />
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300"></span>
              </span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[11px] font-bold tracking-wide leading-none">DriveLogic</span>
              <span className="text-[8.5px] font-mono text-emerald-100/90 leading-tight mt-0.5">Eclipse Live Voice</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => runProactiveHazardBriefing()}
            disabled={isScanningRadar}
            className={cn(
              "p-2.5 rounded-full border shadow-lg transition-all cursor-pointer flex items-center justify-center",
              isScanningRadar
                ? "bg-rose-600/80 text-white border-rose-400 animate-pulse"
                : "bg-zinc-950/90 hover:bg-rose-950/80 text-rose-400 border-rose-500/40"
            )}
            title="Check Waze, 911 Dispatch & Crime Radar on Request"
          >
            <Siren size={15} className={cn(isScanningRadar && "animate-spin")} />
          </button>
        </div>
      )}

      {/* Real-Time Chat Assistant Window (Positioned cleanly above bottom nav) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0, 
              height: isMini ? 150 : 490
            }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="fixed bottom-20 left-3 right-3 max-w-md mx-auto z-[65] glass-card rounded-3xl overflow-hidden border border-emerald-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.65)] flex flex-col bg-zinc-950/95 backdrop-blur-xl"
          >
            {/* Header */}
            <div className="p-3 bg-gradient-to-r from-emerald-950/70 via-zinc-900/90 to-zinc-900/95 border-b border-emerald-500/20 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="p-1.5 bg-emerald-500/20 rounded-xl border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Radio size={14} className={cn(isLive && "animate-pulse")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap">DriveLogic</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[8px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                        Eclipse Voice
                      </span>
                    </div>
                    <span className="text-[8.5px] font-mono text-emerald-400/80 leading-none truncate block mt-0.5">
                      {isLive ? 'Gemini Live • Eclipse Natural Voice • Search Grounded' : 'Connecting to Gemini Live (Eclipse Voice)...'}
                    </span>
                  </div>
                </div>

                {/* Window Action Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={cycleVolume}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
                    title={`Voice Volume: ${voiceVolume.toUpperCase()} (Tap to change)`}
                  >
                    {voiceVolume === 'mute' ? (
                      <VolumeX size={13} className="text-red-400" />
                    ) : voiceVolume === 'low' ? (
                      <Volume1 size={13} className="text-emerald-300" />
                    ) : (
                      <Volume2 size={13} className="text-emerald-400" />
                    )}
                  </button>

                  <button 
                    type="button"
                    onClick={() => setIsMini(!isMini)}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors cursor-pointer"
                    title={isMini ? "Expand Chat" : "Minimize"}
                  >
                    {isMini ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                  </button>

                  <button 
                    type="button"
                    onClick={() => setIsOpen(false)} 
                    className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors cursor-pointer"
                    title="Close DriveLogic Assistant"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Sub-row for Radar On Request, Search Grounding, and Eclipse Voice indicator */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                <button
                  type="button"
                  onClick={() => runProactiveHazardBriefing()}
                  disabled={isScanningRadar}
                  className="px-2 py-0.5 rounded-full border flex items-center gap-1 text-[8.5px] font-mono tracking-wide transition-all cursor-pointer shrink-0 bg-rose-500/20 text-rose-300 border-rose-400/50 hover:bg-rose-500/30"
                  title="Speak Waze, 911 Dispatch & Crime Radar on Request"
                >
                  <Siren size={10} className={isScanningRadar ? "animate-spin text-rose-400" : "text-rose-400"} />
                  <span>{isScanningRadar ? 'Scanning Radar...' : 'Radar On Request'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = !useSearch;
                    setUseSearch(next);
                    localStorage.setItem('ztcd_live_use_search', String(next));
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded-full border flex items-center gap-1 text-[8.5px] font-mono tracking-wide transition-all cursor-pointer shrink-0",
                    useSearch 
                      ? "bg-blue-500/20 text-blue-300 border-blue-400/50 hover:bg-blue-500/30" 
                      : "bg-white/5 text-white/40 border-white/10 hover:text-white/70"
                  )}
                  title={useSearch ? "Google Search Data Grounding Enabled" : "Google Search Grounding Disabled"}
                >
                  <Search size={10} className={useSearch ? "text-blue-400" : "text-white/40"} />
                  <span>Search Grounded</span>
                </button>

                <div
                  className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1 text-[8.5px] font-mono tracking-wide shrink-0"
                  title="Gemini Live Natural Voice: Eclipse (Kore) exclusively"
                >
                  <Sparkles size={10} className="text-emerald-400" />
                  <span>Eclipse Voice</span>
                </div>
              </div>
            </div>

            {/* Persistent Memory & Wake Word Bar */}
            {!isMini && (
              <div className="px-3 py-1.5 bg-black/50 border-b border-white/5 flex items-center justify-between text-[9px] font-mono shrink-0">
                <span className="flex items-center gap-1.5 text-emerald-400 truncate">
                  <BrainCircuit size={11} className="shrink-0 text-emerald-400" />
                  <span className="truncate">Hands-Free: "Hey, DriveLogic" • Radar Spoken on Request</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setWakeWordActive(!wakeWordActive)}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[8px] uppercase font-bold border transition-colors cursor-pointer",
                      wakeWordActive
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-white/5 text-white/40 border-white/10"
                    )}
                    title="Toggle continuous 'Hey, DriveLogic' wake word listening"
                  >
                    {wakeWordActive ? 'Wake ON' : 'Wake OFF'}
                  </button>
                  <span className="text-white/40">{speed} mph • {rpm} rpm</span>
                  {liveTranscript.length > 0 && (
                    <button
                      onClick={handleClearMemory}
                      className="text-white/30 hover:text-white/80 p-0.5 rounded transition-colors cursor-pointer"
                      title="Reset chat history memory"
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
                    <p className="text-xs font-semibold text-white/85">Hi, I'm DriveLogic. How can I assist you?</p>
                    <p className="text-[10.5px] text-white/40 max-w-[240px] leading-relaxed mt-1">
                      Say <strong className="text-emerald-300">"Hey, DriveLogic"</strong> anytime for hands-free control, 911 & Crime Radar alerts, diagnostics, and general web queries.
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
                              <><Bot size={8} /> DriveLogic • Eclipse Voice</>
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
                <span className="text-[8px] uppercase tracking-wider font-mono text-white/40">DriveLogic (Eclipse) • Wake: "Hey, DriveLogic"</span>
                <p className="text-[11px] text-white/90 truncate font-sans mt-0.5">
                  {liveTranscript[liveTranscript.length - 1]?.text || DRIVE_LOGIC_GREETING}
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
                    (activeSpeechState === 'thinking' || isScanningRadar) && "text-amber-400 animate-pulse",
                    activeSpeechState === 'connecting' && "text-white/60",
                    activeSpeechState === 'idle' && !isScanningRadar && "text-white/40"
                  )}>
                    {getStatusLabel()}
                  </span>

                  {/* Interrupt Button (Visible during AI speech) */}
                  {activeSpeechState === 'speaking' && (
                    <button
                      onClick={handleInterrupt}
                      className="px-2 py-0.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[8.5px] font-mono flex items-center gap-1 transition-all cursor-pointer"
                      title="Stop DriveLogic voice speech"
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
                  onClick={() => runProactiveHazardBriefing()}
                  disabled={isScanningRadar}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-[9px] font-medium text-rose-200 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Siren size={10} className={cn("text-rose-400", isScanningRadar && "animate-spin")} />
                  <span>Scan 911 & Crime Radar</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("Diagnose vehicle health and search web for OBD fault codes & TSBs")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-[9px] font-medium text-emerald-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Wrench size={10} className="text-emerald-400" />
                  <span>Diagnose & Web Search</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("Auto-detect ELM327 BLE module and sense vehicle OBD protocol")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/40 text-[9px] font-medium text-blue-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Zap size={10} className="text-blue-400" />
                  <span>Connect ELM327 BLE</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("Open 3D Digital Twin Studio and enable X-Ray mode")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-[9px] font-medium text-cyan-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Compass size={10} className="text-cyan-400" />
                  <span>3D X-Ray View</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendText("Start trip recording with accelerometer vibration damage plotting")}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-white/10 text-[9px] font-medium text-white/70 hover:text-white transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Activity size={10} className="text-purple-400" />
                  <span>Log Vibration Damage</span>
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
                  title={isMicActive ? "Stop microphone" : "Start continuous hands-free microphone streaming"}
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
                    placeholder='Ask DriveLogic or say "Scan 911 and Crime Radar"...'
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
                  title="Send message to DriveLogic"
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
