import React, { useState, useEffect } from 'react';
import { BrainCircuit, AlertCircle, CheckCircle2, Zap, Thermometer, Gauge, Activity, Bluetooth, AlertTriangle, ShieldCheck, ShieldAlert, Info, Usb, ExternalLink, Sparkles, Download, Check, Loader2 } from 'lucide-react';
import { OBDData, SubscriptionTier } from '../types';
import { runAIDiagnosis, fetchDTCDefinition } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { OBD_CODE_DEFINITIONS } from '../constants/obdCodes';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface OBDTabProps {
  data: OBDData;
  isSimulation: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  onConnectReal: () => Promise<void> | void;
  onConnectSerial: () => Promise<void> | void;
  sensorHistory: any[];
  diagnosis?: string | null;
  onSetDiagnosis?: (val: string | null) => void;
  isAnalyzing?: boolean;
  onSetIsAnalyzing?: (val: boolean) => void;
  isSubscribed?: boolean;
  subscriptionTier?: SubscriptionTier;
  onShowPaywall?: () => void;
  totalMileage?: number;
  vehicleModel?: string;
  googleAccessToken?: string | null;
  onLinkDrive?: () => Promise<any> | void;
}

export default function OBDTab({ 
  data, 
  isSimulation, 
  connectionStatus, 
  onConnectReal, 
  onConnectSerial, 
  sensorHistory,
  diagnosis: propDiagnosis,
  onSetDiagnosis: propOnSetDiagnosis,
  isAnalyzing: propIsAnalyzing,
  onSetIsAnalyzing: propOnSetIsAnalyzing,
  isSubscribed = true,
  subscriptionTier,
  onShowPaywall,
  totalMileage,
  vehicleModel,
  googleAccessToken,
  onLinkDrive
}: OBDTabProps) {
  const [localDiagnosis, setLocalDiagnosis] = useState<string | null>(null);
  const [localIsAnalyzing, setLocalIsAnalyzing] = useState(false);

  const diagnosis = propDiagnosis !== undefined ? propDiagnosis : localDiagnosis;
  const setDiagnosis = propOnSetDiagnosis !== undefined ? propOnSetDiagnosis : setLocalDiagnosis;
  const isAnalyzing = propIsAnalyzing !== undefined ? propIsAnalyzing : localIsAnalyzing;
  const setIsAnalyzing = propOnSetIsAnalyzing !== undefined ? propOnSetIsAnalyzing : setLocalIsAnalyzing;

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [history, setHistory] = useState<OBDData[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [dtcDefinitions, setDtcDefinitions] = useState<Record<string, string>>({});
  const [isFetchingDtc, setIsFetchingDtc] = useState<Record<string, boolean>>({});

  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleDownloadDiagnosis = () => {
    if (!diagnosis) return;
    setDownloadStatus('idle');
    try {
      const name = `drivelogic_diagnosis_${new Date().toISOString().slice(0, 10)}_${Date.now()}.md`;
      const reportContent = `
# DriveLogicAI Vehicle Diagnosis Report
**Date:** ${new Date().toLocaleString()}
**Mileage:** ${totalMileage ? totalMileage.toLocaleString() : 'N/A'} miles

## OBD-II Live Telemetry
- Speed: ${Math.round(data.speed * 0.621371)} MPH
- RPM: ${data.rpm} RPM
- Coolant Temp: ${Math.round((data.coolantTemp * 9 / 5) + 32)} °F (${data.coolantTemp} °C)
- Throttle Position: ${data.throttlePos.toFixed(1)}%
- Engine Load: ${data.load.toFixed(1)}%
- Voltage: ${data.voltage.toFixed(1)} V
- DTCs: ${data.dtcs.join(', ') || 'No Diagnostic Trouble Codes found.'}

## AI Diagnosis and Recommendations
${diagnosis}
      `.trim();

      const blob = new Blob([reportContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadStatus('success');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    } catch (err) {
      console.warn("Failed to download diagnosis", err);
      setDownloadStatus('error');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    }
  };

  const handleCodeClick = async (code: string) => {
    if (selectedCode === code) {
      setSelectedCode(null);
      return;
    }
    
    setSelectedCode(code);
    
    if (!dtcDefinitions[code]) {
      setIsFetchingDtc(prev => ({ ...prev, [code]: true }));
      try {
        const definition = await fetchDTCDefinition(code);
        if (definition) {
          setDtcDefinitions(prev => ({ ...prev, [code]: definition }));
        } else {
          setDtcDefinitions(prev => ({ ...prev, [code]: OBD_CODE_DEFINITIONS[code] || `No definition available for code ${code}.` }));
        }
      } catch (error) {
        console.warn(error);
        setDtcDefinitions(prev => ({ ...prev, [code]: OBD_CODE_DEFINITIONS[code] || `No definition available for code ${code}.` }));
      } finally {
        setIsFetchingDtc(prev => ({ ...prev, [code]: false }));
      }
    }
  };

  const handleConnect = async () => {
    try {
      await onConnectReal();
      setConnectionError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      setConnectionError(errorMessage);
    }
  };

  const isBluetoothSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;
  const isSerialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  // Maintain a rolling history of the last 30 data points for the charts
  useEffect(() => {
    setHistory(prev => {
      const newHistory = [...prev, data];
      return newHistory.slice(-30); // Keep last 30 seconds/points
    });
  }, [data]);

  const getStatusConfig = () => {
    if (isSimulation && connectionStatus === 'disconnected') {
      return { 
        label: 'Simulation Active', 
        color: 'text-car-warning', 
        bg: 'bg-car-warning/10',
        dot: 'bg-car-warning animate-pulse',
        icon: Activity
      };
    }
    
    switch (connectionStatus) {
      case 'connected':
        return { 
          label: 'OBD-II Linked', 
          color: 'text-car-success', 
          bg: 'bg-car-success/10',
          dot: 'bg-car-success',
          icon: ShieldCheck
        };
      case 'connecting':
        return { 
          label: 'Connecting...', 
          color: 'text-car-accent', 
          bg: 'bg-car-accent/10',
          dot: 'bg-car-accent animate-ping',
          icon: Bluetooth
        };
      case 'disconnected':
      default:
        return { 
          label: 'Disconnected', 
          color: 'text-white/40', 
          bg: 'bg-white/5',
          dot: 'bg-white/20',
          icon: Bluetooth
        };
    }
  };

  const status = getStatusConfig();

  const handleDiagnosis = async () => {
    if (!isSubscribed) {
      onShowPaywall();
      return;
    }
    setIsAnalyzing(true);
    const result = await runAIDiagnosis(data, sensorHistory, vehicleModel);
    setDiagnosis(result);
    setIsAnalyzing(false);
  };

  const speedMph = Math.round(data.speed * 0.621371);
  const coolantF = Math.round((data.coolantTemp * 9 / 5) + 32);

  const rpmPercent = Math.min(100, Math.max(0, (data.rpm / 7500) * 100));
  const rpmBarColor = data.rpm > 6500 
    ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-rose-500/50 shadow-sm' 
    : data.rpm > 5000 
      ? 'bg-gradient-to-r from-car-accent to-amber-500' 
      : 'bg-gradient-to-r from-blue-500 to-cyan-400';

  const speedPercent = Math.min(100, Math.max(0, (speedMph / 140) * 100));
  const coolantPercent = Math.min(100, Math.max(0, ((coolantF - 100) / 160) * 100));
  const throttlePercent = Math.min(100, Math.max(0, data.throttlePos));
  const loadPercent = Math.min(100, Math.max(0, data.load));
  const voltagePercent = Math.min(100, Math.max(0, ((data.voltage - 10) / 5) * 100));

  const metrics = [
    { 
      label: 'RPM', 
      value: data.rpm, 
      unit: '', 
      icon: Gauge, 
      color: 'text-car-accent',
      percent: rpmPercent,
      barColor: rpmBarColor,
      minLabel: '0',
      maxLabel: '7.5k'
    },
    { 
      label: 'Speed', 
      value: speedMph, 
      unit: 'mph', 
      icon: Zap, 
      color: 'text-car-success',
      percent: speedPercent,
      barColor: 'bg-gradient-to-r from-emerald-500 to-teal-400',
      minLabel: '0',
      maxLabel: '140'
    },
    { 
      label: 'VSS', 
      value: speedMph, 
      unit: 'mph', 
      icon: Activity, 
      color: 'text-car-success',
      percent: speedPercent,
      barColor: 'bg-emerald-500'
    },
    { 
      label: 'Coolant', 
      value: coolantF, 
      unit: '°F', 
      icon: Thermometer, 
      color: coolantF > 221 ? 'text-car-danger' : 'text-car-warning',
      percent: coolantPercent,
      barColor: coolantF > 221 ? 'bg-rose-500' : coolantF > 200 ? 'bg-amber-400' : 'bg-sky-400'
    },
    { 
      label: 'Throttle', 
      value: data.throttlePos.toFixed(1), 
      unit: '%', 
      icon: Activity, 
      color: 'text-white',
      percent: throttlePercent,
      barColor: 'bg-indigo-400'
    },
    { 
      label: 'Load', 
      value: data.load.toFixed(1), 
      unit: '%', 
      icon: Activity, 
      color: 'text-white',
      percent: loadPercent,
      barColor: data.load > 85 ? 'bg-amber-500' : 'bg-purple-400'
    },
    { 
      label: 'Voltage', 
      value: data.voltage.toFixed(1), 
      unit: 'V', 
      icon: Zap, 
      color: 'text-car-accent',
      percent: voltagePercent,
      barColor: data.voltage < 11.8 ? 'bg-rose-500' : data.voltage > 14.8 ? 'bg-amber-400' : 'bg-cyan-400'
    },
  ];

  const chartData = history.map(d => ({
    ...d,
    speed: Math.round(d.speed * 0.621371),
    coolantTemp: Math.round((d.coolantTemp * 9 / 5) + 32)
  }));

  const readinessItems = [
    { label: 'Misfire', status: data.readiness.misfire },
    { label: 'Fuel System', status: data.readiness.fuelSystem },
    { label: 'Components', status: data.readiness.components },
    { label: 'Catalyst', status: data.readiness.catalyst },
    { label: 'EVAP', status: data.readiness.evap },
    { label: 'Oxygen Sensor', status: data.readiness.oxygenSensor },
  ];

  const getDtcSeverity = (code: string) => {
    if (code.startsWith('P') || code.startsWith('C')) {
      return { level: 'Critical', color: 'text-car-danger', bg: 'bg-car-danger/10', border: 'border-car-danger/20', activeBg: 'bg-car-danger/20', activeBorder: 'border-car-danger' };
    }
    if (code.startsWith('U')) {
      return { level: 'Warning', color: 'text-car-warning', bg: 'bg-car-warning/10', border: 'border-car-warning/20', activeBg: 'bg-car-warning/20', activeBorder: 'border-car-warning' };
    }
    return { level: 'Minor', color: 'text-car-accent', bg: 'bg-car-accent/10', border: 'border-car-accent/20', activeBg: 'bg-car-accent/20', activeBorder: 'border-car-accent' };
  };

  const groupedDtcs = data.dtcs.reduce((acc, code) => {
    const severity = getDtcSeverity(code).level;
    if (!acc[severity]) acc[severity] = [];
    acc[severity].push(code);
    return acc;
  }, {} as Record<string, string[]>);

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-car-card/90 border border-white/10 p-2 rounded-lg shadow-xl backdrop-blur-md">
          <p className="text-[10px] text-white/60 mb-1">{new Date(label).toLocaleTimeString()}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs font-bold" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Browser Compatibility Warning */}
      {(!isBluetoothSupported || !isSerialSupported || isInIframe) && !connectionError && connectionStatus === 'disconnected' && (
        <div className="p-4 bg-car-accent/5 border border-car-accent/20 rounded-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Info className="text-car-accent" size={16} />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-car-accent">Environmental Check</h4>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {!isBluetoothSupported && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40 uppercase">Bluetooth Support</span>
                <span className="text-car-danger font-bold uppercase px-2 py-0.5 bg-car-danger/10 rounded-md">Unsupported</span>
              </div>
            )}
            {!isSerialSupported && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40 uppercase">Serial/USB Support</span>
                <span className="text-car-danger font-bold uppercase px-2 py-0.5 bg-car-danger/10 rounded-md">Unsupported</span>
              </div>
            )}
            {isInIframe && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40 uppercase">Iframe Mode</span>
                <span className="text-car-warning font-bold uppercase px-2 py-0.5 bg-car-warning/10 rounded-md">Permissions Restricted</span>
              </div>
            )}
          </div>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full flex items-center justify-center gap-2 py-2 bg-car-accent text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-car-accent/80 transition-all shadow-lg shadow-car-accent/20"
          >
            <ExternalLink size={12} /> Optimization: Open in New Tab
          </button>
        </div>
      )}

      {/* Connection Status Indicator */}
      <div className="space-y-2 relative">
        {/* Dashboard Interior Background for Gauges */}
        <div className="absolute -inset-4 opacity-5 pointer-events-none overflow-hidden rounded-3xl -z-10">
          <img 
            src="https://www.rawhide.org/wp-content/uploads/2016/02/27-Dashboard-Symbols.jpg" 
            alt="Dashboard backdrop" 
            className="w-full h-auto object-cover object-top scale-150 origin-top"
          />
        </div>
        <div className={cn("flex items-center justify-between p-4 rounded-2xl border transition-all duration-500", status.bg, status.color.replace('text-', 'border-').replace('text-white/40', 'border-white/10'))}>
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-white/5")}>
              <status.icon size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", status.dot)} />
                <span className="text-xs font-bold uppercase tracking-widest">{status.label}</span>
              </div>
              <p className="text-[10px] opacity-60 font-mono">
                {connectionStatus === 'connecting' ? 'Searching for Bluetooth devices...' : 
                 connectionStatus === 'connected' ? 'Data stream active' : 'Connect adapter to see real telemetry'}
              </p>
            </div>
          </div>
          {connectionStatus === 'disconnected' && (
            <div className="flex gap-2">
              <button 
                onClick={handleConnect}
                className="px-3 py-1.5 bg-car-accent text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-car-accent/80 transition-colors flex items-center gap-1"
                title="Connect via Bluetooth"
              >
                <Bluetooth className="w-3 h-3" /> BT
              </button>
              <button 
                onClick={async () => {
                  try {
                    await onConnectSerial();
                    setConnectionError(null);
                  } catch (err) {
                    setConnectionError(err instanceof Error ? err.message : 'Failed to connect via USB');
                  }
                }}
                className="px-3 py-1.5 bg-car-purple text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-car-purple/80 transition-colors flex items-center gap-1"
                title="Connect via 1260 USB Serial Cable"
              >
                <Usb className="w-3 h-3" /> USB
              </button>
            </div>
          )}
        </div>
      {connectionError && (
        <div className="space-y-2">
          <div className="p-4 bg-car-danger/10 border border-car-danger/20 rounded-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-car-danger mt-0.5 shrink-0" size={16} />
              <div className="space-y-2">
                <p className="text-xs font-bold text-car-danger uppercase tracking-tight">Connection Troubleshooting</p>
                <div className="text-[11px] text-white/80 leading-relaxed overflow-hidden">
                  <div className="prose prose-invert prose-p:my-1 prose-p:leading-normal max-w-none text-[11px]">
                    <ReactMarkdown>{connectionError}</ReactMarkdown>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button 
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-car-accent/20 text-car-accent rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-car-accent/30 transition-all border border-car-accent/30"
                  >
                    <ExternalLink size={12} /> Open in New Tab
                  </button>
                  <button 
                    onClick={() => setConnectionError(null)}
                    className="px-3 py-1.5 bg-white/5 text-white/40 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Main Gauges Section */}
      <div className="grid grid-cols-2 gap-4">
        {metrics.slice(0, 2).map((m) => (
          <div key={m.label} className="glass-card p-6 rounded-3xl flex flex-col items-center gap-2 text-center border-b-2 border-car-accent/20">
            <m.icon size={24} className="text-car-accent/40" />
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold font-mono tracking-tighter ${m.color}`}>{m.value}</span>
              <span className="text-xs text-white/20 font-mono uppercase">{m.unit}</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">{m.label}</span>

            {/* Framer-Motion Animated Gauge Telemetry Bar */}
            <div className="w-full mt-2 space-y-1">
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden p-[1px] border border-white/10 relative">
                <motion.div
                  className={cn("h-full rounded-full transition-colors", m.barColor)}
                  initial={false}
                  animate={{ width: `${m.percent}%` }}
                  transition={{ type: "spring", stiffness: 90, damping: 18, mass: 0.6 }}
                />
              </div>
              <div className="flex justify-between items-center text-[8px] font-mono text-white/30 px-0.5">
                <span>{m.minLabel}</span>
                <span className="text-white/40 font-semibold">{Math.round(m.percent)}%</span>
                <span>{m.maxLabel}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Live Charts Section */}
      <div className="glass-card p-6 rounded-3xl space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-white/5 rounded-xl">
            <Activity className="text-white" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white">Live Telemetry</h3>
            <p className="text-xs text-white/40">Real-time performance graphs</p>
          </div>
        </div>

        {/* RPM Chart */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-car-purple">Engine RPM</span>
            <span className="text-xs font-bold font-mono text-car-purple">{data.rpm}</span>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorRpm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="rpm" 
                  name="RPM"
                  stroke="#A855F7" 
                  fillOpacity={1}
                  fill="url(#colorRpm)"
                  strokeWidth={2} 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Speed Chart */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-car-success">Speed (mph)</span>
            <span className="text-xs font-bold font-mono text-car-success">{speedMph}</span>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <YAxis domain={[0, 'auto']} hide />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="speed" 
                  name="Speed"
                  stroke="#22C55E" 
                  fillOpacity={1}
                  fill="url(#colorSpeed)"
                  strokeWidth={2} 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Coolant Temp Chart */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-car-accent">Coolant Temp (°F)</span>
            <span className="text-xs font-bold font-mono text-car-accent">{coolantF}</span>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorCoolant" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="coolantTemp" 
                  name="Coolant"
                  stroke="#3B82F6" 
                  fillOpacity={1}
                  fill="url(#colorCoolant)"
                  strokeWidth={2} 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Grid */}
      <div className="grid grid-cols-2 gap-4">
        {metrics.slice(2).map((m) => (
          <div key={m.label} className="glass-card p-4 rounded-2xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex justify-between items-center">
                <m.icon size={16} className="text-white/20" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">{m.label}</span>
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-2xl font-bold font-mono ${m.color}`}>{m.value}</span>
                <span className="text-[10px] text-white/20 font-mono">{m.unit}</span>
              </div>
            </div>

            {/* Framer-Motion Animated Telemetry Bar */}
            <div className="space-y-1">
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5 relative">
                <motion.div
                  className={cn("h-full rounded-full transition-colors", m.barColor || "bg-car-accent")}
                  initial={false}
                  animate={{ width: `${m.percent}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, mass: 0.5 }}
                />
              </div>
              <div className="flex justify-between items-center text-[7px] font-mono text-white/30">
                <span>0</span>
                <span>{Math.round(m.percent)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* DTCs Section */}
      <div className="glass-card p-6 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-car-danger/10 rounded-xl">
              <AlertTriangle className="text-car-danger" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Trouble Codes</h3>
              <p className="text-xs text-white/40">Active DTCs from ECU</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest pb-2 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-car-danger" />
            <span className="text-white/60">Critical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-car-warning" />
            <span className="text-white/60">Warning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-car-accent" />
            <span className="text-white/60">Minor</span>
          </div>
        </div>

        {data.dtcs.length > 0 ? (
          <div className="space-y-4">
            {['Critical', 'Warning', 'Minor'].map(severity => {
              const codes = groupedDtcs[severity];
              if (!codes || codes.length === 0) return null;

              const config = getDtcSeverity(codes[0]);

              return (
                <div key={severity} className="space-y-2">
                  <h4 className={cn("text-[10px] font-bold uppercase tracking-widest flex items-center gap-2", config.color)}>
                    {severity} Issues <span className={cn("px-1.5 py-0.5 rounded-md text-[8px]", config.bg)}>{codes.length}</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {codes.map(code => (
                      <button 
                        key={code} 
                        onClick={() => handleCodeClick(code)}
                        className={cn(
                          "border rounded-xl p-3 flex items-center justify-between transition-all",
                          selectedCode === code ? `${config.activeBg} ${config.activeBorder}` : `${config.bg} ${config.border} hover:bg-white/5`
                        )}
                      >
                        <span className={cn("font-mono font-bold", config.color)}>{code}</span>
                        <Info size={14} className={cn("transition-colors", selectedCode === code ? config.color : `${config.color}/40`)} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            
            <AnimatePresence>
              {selectedCode && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {(() => {
                    const config = getDtcSeverity(selectedCode);
                    return (
                      <div className={cn("p-4 border rounded-2xl", config.bg, config.border)}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn("text-[10px] font-bold uppercase tracking-widest", config.color)}>Definition for {selectedCode}</span>
                        </div>
                        <div className="text-sm text-white/80 leading-relaxed">
                          {isFetchingDtc[selectedCode] ? (
                            <span className="flex items-center gap-2 text-white/60">
                              <span className="w-3 h-3 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                              Analyzing code with AI...
                            </span>
                          ) : (
                            <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-a:text-car-accent">
                              <ReactMarkdown>
                                {dtcDefinitions[selectedCode] || OBD_CODE_DEFINITIONS[selectedCode] || "No definition available for this code."}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-car-success/5 rounded-2xl border border-car-success/10">
            <CheckCircle2 size={16} className="text-car-success" />
            <p className="text-xs text-car-success/80 font-medium">No diagnostic trouble codes found.</p>
          </div>
        )}
      </div>

      {/* Monitor Readiness Section */}
      <div className="glass-card p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-car-success/10 rounded-xl">
            <ShieldCheck className="text-car-success" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white">Monitor Readiness</h3>
            <p className="text-xs text-white/40">I/M Readiness Status</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {readinessItems.map(item => (
            <div key={item.label} className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5">
              <span className="text-[10px] uppercase tracking-wider text-white/60 font-mono">{item.label}</span>
              {item.status ? (
                <CheckCircle2 size={14} className="text-car-success" />
              ) : (
                <ShieldAlert size={14} className="text-car-warning" />
              )}
            </div>
          ))}
        </div>
        
        <div className="pt-2 border-t border-white/5 text-center">
          <p className="text-[8px] text-white/20 uppercase tracking-[0.2em] font-mono">
            Dashboard Symbols by <a href="https://rawhide.enfusendev.com" className="text-car-accent/50 hover:text-car-accent transition-colors">rawhide.enfusendev.com</a>
          </p>
        </div>
      </div>

      {/* AI Diagnosis Section */}
      <div className="glass-card p-6 rounded-3xl space-y-4 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-car-accent/10 rounded-xl">
              <BrainCircuit className="text-car-accent" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">AI Diagnostics</h3>
              <p className="text-xs text-white/40">Powered by Google Gemini</p>
            </div>
          </div>
          {isSubscribed ? (
            <button
              onClick={handleDiagnosis}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-car-accent text-white rounded-xl text-xs font-bold hover:bg-car-accent/80 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isAnalyzing ? 'ANALYZING...' : 'RUN AI DIAGNOSIS'}
            </button>
          ) : (
            <button
              onClick={onShowPaywall}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-car-accent text-white rounded-xl text-xs font-bold hover:brightness-110 active:scale-95 transition-all flex items-center gap-1 cursor-pointer shadow-lg shadow-car-accent/20"
            >
              <Sparkles size={12} className="animate-pulse" />
              UPGRADE
            </button>
          )}
        </div>

        {!isSubscribed ? (
          <div className="bg-gradient-to-br from-car-accent/5 to-white/5 border border-white/10 rounded-2xl p-5 text-center space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-car-accent/10 rounded-full blur-xl pointer-events-none" />
            <div className="mx-auto w-10 h-10 rounded-full bg-car-accent/20 flex items-center justify-center text-car-accent">
              <Sparkles size={18} />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Unlock Full AI Diagnosis</h4>
              <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto">
                Get unlimited, professional-grade diagnostic reports with deep fault code interpretations, driving habit sensor correlation, and detailed mitigation recommendations.
              </p>
            </div>
            <button
              onClick={onShowPaywall}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-car-accent hover:brightness-110 active:scale-[0.98] text-white rounded-xl text-xs font-bold tracking-wider uppercase font-mono transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-lg shadow-car-accent/20"
            >
              <Sparkles size={14} className="text-amber-200" /> Unlock Premium ($4.99/mo) or Pro ($0.99/mo)
            </button>
          </div>
        ) : diagnosis ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3 animate-none"
          >
            <div className="bg-white/5 rounded-2xl p-4 text-sm text-white/80 leading-relaxed prose prose-invert max-w-none">
              <ReactMarkdown>{diagnosis}</ReactMarkdown>
            </div>
            
            <div className="flex items-center justify-between bg-white/5 p-3 rounded-2xl border border-white/5">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-car-success" />
                <span className="text-xs text-white/60">
                  Diagnosis report generated successfully.
                </span>
              </div>
              <button
                onClick={handleDownloadDiagnosis}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  downloadStatus === 'success' ? "bg-car-success/20 text-car-success border border-car-success/30" :
                  downloadStatus === 'error' ? "bg-car-danger/20 text-car-danger border border-car-danger/30" :
                  "bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white"
                )}
              >
                {downloadStatus === 'success' ? <Check size={12} /> : <Download size={12} />}
                {downloadStatus === 'success' ? "Downloaded!" :
                 downloadStatus === 'error' ? "Failed to save" : "Download (.md)"}
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
            <AlertCircle size={16} className="text-car-warning" />
            <p className="text-xs text-white/60 italic">No active diagnosis. Tap run to analyze live telemetry.</p>
          </div>
        )}
      </div>
    </div>
  );
}
