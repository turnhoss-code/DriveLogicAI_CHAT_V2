import React, { useState, useMemo, useRef } from 'react';
import { 
  Activity, 
  Clock, 
  MapPin, 
  AlertTriangle, 
  Flame, 
  Zap, 
  RotateCw, 
  Thermometer, 
  ChevronRight, 
  X, 
  Navigation, 
  Compass, 
  Sliders, 
  Share2, 
  Info, 
  Layers,
  Sparkles,
  Download,
  FileSpreadsheet,
  FileCode,
  Flag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Trip, TripEvent } from '../types';
import { cn } from '../lib/utils';
import { GoogleMap, Polyline, Marker } from '@react-google-maps/api';
import { exportTripAsJSON, exportTripAsCSV } from '../lib/tripExporter';

interface TripTimelineDetailsProps {
  trip: Trip;
  onClose?: () => void;
  mapsApiKey?: string;
  isLoaded?: boolean;
  onSelectEventForAI?: (event: TripEvent, trip: Trip) => void;
  onShowSummary?: () => void;
}

type EventFilter = 'all' | 'harsh_braking' | 'rapid_acceleration' | 'sharp_cornering' | 'overheating';

const EVENT_CONFIG = {
  harsh_braking: {
    label: 'Harsh Braking',
    color: '#EF4444', // Red
    bgClass: 'bg-red-500/10 border-red-500/30 text-red-400',
    badgeClass: 'bg-red-500 text-white',
    icon: AlertTriangle,
    aiTip: 'High G-force deceleration puts extreme thermal stress on brake pads and rotors. Increase following distance by 2-3 seconds to anticipate stops smoothly.'
  },
  rapid_acceleration: {
    label: 'Rapid Acceleration',
    color: '#F59E0B', // Amber
    bgClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    badgeClass: 'bg-amber-500 text-black',
    icon: Zap,
    aiTip: 'Hard throttle bursts spike fuel consumption by up to 35% and increase drivetrain torque wear. Apply gradual progressive throttle.'
  },
  sharp_cornering: {
    label: 'Sharp Cornering',
    color: '#A855F7', // Purple
    bgClass: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    badgeClass: 'bg-purple-500 text-white',
    icon: RotateCw,
    aiTip: 'Excessive lateral G-forces cause uneven tire shoulder scrub and stress sway-bar end links. Brake before turn entry, accelerate gently upon exit.'
  },
  overheating: {
    label: 'Coolant / Engine Heat',
    color: '#F43F5E', // Rose
    bgClass: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
    badgeClass: 'bg-rose-500 text-white',
    icon: Thermometer,
    aiTip: 'Coolant temperature elevated above nominal 90°C. Verify coolant reservoir level, thermostat cycling, and radiator fan operation.'
  }
};

export default function TripTimelineDetails({
  trip,
  onClose,
  mapsApiKey,
  isLoaded,
  onSelectEventForAI,
  onShowSummary
}: TripTimelineDetailsProps) {
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(0);
  const [hoveredEventIndex, setHoveredEventIndex] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<EventFilter>('all');
  const [viewMode, setViewMode] = useState<'schematic' | 'map'>('schematic');
  const [scrubberTime, setScrubberTime] = useState<number | null>(null);

  const timelineBarRef = useRef<HTMLDivElement>(null);

  // Compute Trip Time Bounds
  const startTime = trip.startTime;
  const endTime = trip.endTime || (trip.waypoints && trip.waypoints.length > 0 
    ? trip.waypoints[trip.waypoints.length - 1].timestamp 
    : startTime + 1000 * 60 * 18);
  const totalDurationMs = Math.max(1000 * 60, endTime - startTime);
  const totalDurationMin = Math.round(totalDurationMs / 60000);

  // Filter events based on active filter
  const filteredEvents = useMemo(() => {
    return (trip.events || []).filter(e => {
      if (activeFilter === 'all') return true;
      return e.type === activeFilter;
    });
  }, [trip.events, activeFilter]);

  const activeEventIndex = hoveredEventIndex !== null ? hoveredEventIndex : selectedEventIndex;
  const activeEvent = (activeEventIndex !== null && filteredEvents[activeEventIndex]) 
    ? filteredEvents[activeEventIndex] 
    : (filteredEvents[0] || null);

  // Event category counts
  const eventCounts = useMemo(() => {
    const counts = {
      all: trip.events?.length || 0,
      harsh_braking: 0,
      rapid_acceleration: 0,
      sharp_cornering: 0,
      overheating: 0,
    };
    (trip.events || []).forEach(e => {
      if (counts[e.type] !== undefined) {
        counts[e.type]++;
      }
    });
    return counts;
  }, [trip.events]);

  // Damage score visual status
  const scoreDetails = useMemo(() => {
    const s = trip.averageDamageScore || 0;
    if (s < 20) return { label: 'EXCELLENT', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (s < 50) return { label: 'FAIR', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
    return { label: 'HIGH WEAR', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
  }, [trip.averageDamageScore]);

  // Compute SVG coordinates for the miniature schematic route preview
  const svgRoute = useMemo(() => {
    const wps = trip.waypoints || [];
    if (wps.length < 2) return null;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    wps.forEach(p => {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });

    const latSpan = Math.max(0.005, maxLat - minLat);
    const lngSpan = Math.max(0.005, maxLng - minLng);

    // Padding inside SVG canvas (300 x 220)
    const width = 320;
    const height = 210;
    const pad = 28;

    const scaleX = (width - pad * 2) / lngSpan;
    const scaleY = (height - pad * 2) / latSpan;

    const toSvgCoords = (lat: number, lng: number) => {
      const x = pad + (lng - minLng) * scaleX;
      // Invert Y because latitude increases upwards
      const y = height - pad - (lat - minLat) * scaleY;
      return { x, y };
    };

    const points = wps.map(p => toSvgCoords(p.lat, p.lng));
    const pathD = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    // Project events onto SVG route
    const eventPoints = filteredEvents.map((evt, idx) => {
      let coords = { x: width / 2, y: height / 2 };
      if (evt.location) {
        coords = toSvgCoords(evt.location.lat, evt.location.lng);
      } else {
        // Fallback interpolate based on timestamp
        const ratio = Math.max(0, Math.min(1, (evt.timestamp - startTime) / totalDurationMs));
        const indexApprox = Math.floor(ratio * (points.length - 1));
        coords = points[indexApprox] || points[0];
      }
      return { ...coords, event: evt, originalIndex: idx };
    });

    return {
      width,
      height,
      pathD,
      startPoint: points[0],
      endPoint: points[points.length - 1],
      eventPoints
    };
  }, [trip.waypoints, filteredEvents, startTime, totalDurationMs]);

  // Handle timeline scrubber drag/click
  const handleTimelineInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineBarRef.current) return;
    const rect = timelineBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const calculatedTime = startTime + ratio * totalDurationMs;
    setScrubberTime(calculatedTime);

    // Find closest event
    if (filteredEvents.length > 0) {
      let closestIdx = 0;
      let minDiff = Infinity;
      filteredEvents.forEach((evt, idx) => {
        const diff = Math.abs(evt.timestamp - calculatedTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      setSelectedEventIndex(closestIdx);
    }
  };

  const formatElapsed = (timestamp: number) => {
    const elapsedSec = Math.max(0, Math.floor((timestamp - startTime) / 1000));
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `+${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-white/10 rounded-3xl p-5 md:p-6 shadow-2xl backdrop-blur-xl relative space-y-6 text-white overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-car-accent/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header with Title, Stats & Close button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-widest bg-car-accent/20 text-car-accent border border-car-accent/30 flex items-center gap-1">
              <Navigation size={10} />
              Trip Timeline Details
            </span>
            <span className="text-xs text-white/40 font-mono">
              {new Date(trip.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
            Driving Dynamics & Harsh Event Map
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Trip Summary Modal Trigger */}
          {onShowSummary && (
            <button
              onClick={onShowSummary}
              className="px-2.5 py-1.5 rounded-xl bg-car-accent/15 hover:bg-car-accent/30 text-car-accent border border-car-accent/30 transition-all text-xs font-mono font-medium flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="View full Trip Summary report"
            >
              <Flag size={13} />
              <span>Summary</span>
            </button>
          )}

          {/* Download CSV */}
          <button
            onClick={() => exportTripAsCSV(trip)}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-white/70 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/40 transition-all text-xs font-mono font-medium flex items-center gap-1.5 shadow-sm"
            title="Download waypoints and harsh event logs as CSV"
          >
            <FileSpreadsheet size={13} className="text-emerald-400" />
            <span>CSV</span>
          </button>

          {/* Download JSON */}
          <button
            onClick={() => exportTripAsJSON(trip)}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-white/70 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 transition-all text-xs font-mono font-medium flex items-center gap-1.5 shadow-sm"
            title="Download full trip telemetry, waypoints, and event logs as JSON"
          >
            <FileCode size={13} className="text-sky-400" />
            <span>JSON</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors ml-1"
              title="Close Trip Details"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Trip Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-black/30 border border-white/5 p-3 rounded-2xl">
          <span className="text-[9px] uppercase tracking-wider text-white/40 block font-mono">Trip Duration</span>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock size={15} className="text-car-accent" />
            <span className="text-base font-bold font-mono">{totalDurationMin} min</span>
          </div>
        </div>

        <div className="bg-black/30 border border-white/5 p-3 rounded-2xl">
          <span className="text-[9px] uppercase tracking-wider text-white/40 block font-mono">Distance</span>
          <div className="flex items-center gap-1.5 mt-1">
            <Compass size={15} className="text-car-cyan" />
            <span className="text-base font-bold font-mono">{trip.distance.toFixed(1)} mi</span>
          </div>
        </div>

        <div className="bg-black/30 border border-white/5 p-3 rounded-2xl">
          <span className="text-[9px] uppercase tracking-wider text-white/40 block font-mono">Average Damage</span>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-base font-bold font-mono", scoreDetails.color)}>
              {Math.round(trip.averageDamageScore || 0)}
            </span>
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono border", scoreDetails.bg, scoreDetails.color)}>
              {scoreDetails.label}
            </span>
          </div>
        </div>

        <div className="bg-black/30 border border-white/5 p-3 rounded-2xl">
          <span className="text-[9px] uppercase tracking-wider text-white/40 block font-mono">Harsh Events</span>
          <div className="flex items-center gap-1.5 mt-1">
            <AlertTriangle size={15} className="text-amber-400" />
            <span className="text-base font-bold font-mono">{trip.events?.length || 0} Events</span>
          </div>
        </div>
      </div>

      {/* Event Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-mono mr-1">Filter Events:</span>
        <button
          onClick={() => setActiveFilter('all')}
          className={cn(
            "px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border",
            activeFilter === 'all'
              ? "bg-white/15 border-white/40 text-white shadow-sm"
              : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white"
          )}
        >
          <span>All</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-white/10 rounded-full font-mono">{eventCounts.all}</span>
        </button>

        <button
          onClick={() => setActiveFilter('harsh_braking')}
          className={cn(
            "px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border",
            activeFilter === 'harsh_braking'
              ? "bg-red-500/20 border-red-500/60 text-red-400 shadow-sm"
              : "bg-white/5 border-white/5 text-white/60 hover:bg-red-500/10 hover:text-red-300"
          )}
        >
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Braking</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-white/10 rounded-full font-mono">{eventCounts.harsh_braking}</span>
        </button>

        <button
          onClick={() => setActiveFilter('rapid_acceleration')}
          className={cn(
            "px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border",
            activeFilter === 'rapid_acceleration'
              ? "bg-amber-500/20 border-amber-500/60 text-amber-400 shadow-sm"
              : "bg-white/5 border-white/5 text-white/60 hover:bg-amber-500/10 hover:text-amber-300"
          )}
        >
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Acceleration</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-white/10 rounded-full font-mono">{eventCounts.rapid_acceleration}</span>
        </button>

        <button
          onClick={() => setActiveFilter('sharp_cornering')}
          className={cn(
            "px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border",
            activeFilter === 'sharp_cornering'
              ? "bg-purple-500/20 border-purple-500/60 text-purple-400 shadow-sm"
              : "bg-white/5 border-white/5 text-white/60 hover:bg-purple-500/10 hover:text-purple-300"
          )}
        >
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span>Cornering</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-white/10 rounded-full font-mono">{eventCounts.sharp_cornering}</span>
        </button>
      </div>

      {/* Main Interactive Grid: Timeline Visualizer + Miniature Route Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side (7 Cols): Interactive Timeline Bar & Event Carousel */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-white/80 uppercase tracking-wider text-[10px] font-mono flex items-center gap-1.5">
                <Sliders size={12} className="text-car-accent" />
                Interactive Time Scrub Bar
              </span>
              <span className="text-[10px] text-white/40 font-mono">
                Click or hover timeline markers to map onto route
              </span>
            </div>

            {/* Visual Timeline Track */}
            <div 
              ref={timelineBarRef}
              onClick={handleTimelineInteraction}
              className="relative h-14 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-2 cursor-pointer border border-white/10 hover:border-white/20 transition-all select-none"
            >
              {/* Center baseline rail */}
              <div className="absolute top-1/2 left-3 right-3 h-1.5 -translate-y-1/2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500/40 via-cyan-500/40 to-blue-500/40" />
              </div>

              {/* Time tick markers */}
              <div className="absolute top-1 left-3 text-[8px] font-mono text-white/40">00:00</div>
              <div className="absolute top-1 right-3 text-[8px] font-mono text-white/40">
                {Math.floor(totalDurationMin)}:00
              </div>

              {/* Harsh Event Pins along Timeline */}
              {filteredEvents.map((evt, idx) => {
                const config = EVENT_CONFIG[evt.type] || EVENT_CONFIG.harsh_braking;
                const IconComponent = config.icon;
                const ratio = Math.max(0, Math.min(1, (evt.timestamp - startTime) / totalDurationMs));
                const leftPercent = `${(ratio * 100).toFixed(1)}%`;
                const isSelected = activeEventIndex === idx;

                return (
                  <div
                    key={idx}
                    style={{ left: leftPercent }}
                    onMouseEnter={() => setHoveredEventIndex(idx)}
                    onMouseLeave={() => setHoveredEventIndex(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEventIndex(idx);
                    }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 group cursor-pointer"
                  >
                    {/* Pulsing ring if selected */}
                    {isSelected && (
                      <motion.div
                        layoutId="activeEventRing"
                        className="absolute -inset-2 rounded-full border-2 border-car-accent animate-ping opacity-60"
                      />
                    )}

                    {/* Event Node */}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-transform shadow-lg border",
                        isSelected 
                          ? "scale-125 border-white ring-2 ring-car-accent" 
                          : "scale-100 border-white/40 hover:scale-110",
                        config.badgeClass
                      )}
                      title={`${config.label} (${formatElapsed(evt.timestamp)})`}
                    >
                      <IconComponent size={14} />
                    </div>

                    {/* Severity chip hovering above node */}
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 px-1.5 py-0.5 rounded text-[8px] font-mono border border-white/20 text-white z-30 pointer-events-none">
                      {formatElapsed(evt.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Timeline Events List / Selector */}
            <div className="space-y-2 pt-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-white/50 block font-mono">
                Events Along This Trip ({filteredEvents.length})
              </span>

              {filteredEvents.length === 0 ? (
                <div className="p-4 rounded-xl bg-white/5 text-center text-xs text-white/40">
                  No events found for this filter category.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {filteredEvents.map((evt, idx) => {
                    const config = EVENT_CONFIG[evt.type] || EVENT_CONFIG.harsh_braking;
                    const IconComponent = config.icon;
                    const isSelected = activeEventIndex === idx;

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedEventIndex(idx)}
                        onMouseEnter={() => setHoveredEventIndex(idx)}
                        onMouseLeave={() => setHoveredEventIndex(null)}
                        className={cn(
                          "p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2",
                          isSelected
                            ? "bg-car-accent/20 border-car-accent text-white shadow-md"
                            : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn("p-1.5 rounded-lg shrink-0", config.bgClass)}>
                            <IconComponent size={13} />
                          </div>
                          <div className="truncate">
                            <span className="text-xs font-bold block truncate">{config.label}</span>
                            <span className="text-[10px] font-mono text-white/40">{formatElapsed(evt.timestamp)}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold font-mono block text-white/90">
                            {Math.round(evt.severity)}/100
                          </span>
                          <span className="text-[8px] uppercase tracking-wider text-white/30">Severity</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Active Event Diagnostic & AI Advice Card */}
          {activeEvent && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              key={activeEvent.timestamp}
              className={cn(
                "p-4 rounded-2xl border relative overflow-hidden",
                EVENT_CONFIG[activeEvent.type]?.bgClass || "bg-white/5 border-white/10"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono", EVENT_CONFIG[activeEvent.type]?.badgeClass)}>
                    {EVENT_CONFIG[activeEvent.type]?.label}
                  </span>
                  <span className="text-xs font-mono text-white/70">
                    Timestamp: {new Date(activeEvent.timestamp).toLocaleTimeString()} ({formatElapsed(activeEvent.timestamp)})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-white">
                    Damage Score: {Math.round(activeEvent.severity)}
                  </span>
                </div>
              </div>

              <div className="text-xs text-white/80 leading-relaxed space-y-2 mt-1">
                <div className="flex items-start gap-2 bg-black/30 p-2.5 rounded-xl border border-white/5">
                  <Sparkles size={16} className="text-car-accent shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[10px] uppercase tracking-widest text-car-accent block">
                      DriveLogic AI Advisory:
                    </span>
                    <p className="text-[11px] text-white/90 mt-0.5">
                      {EVENT_CONFIG[activeEvent.type]?.aiTip}
                    </p>
                  </div>
                </div>

                {activeEvent.location && (
                  <div className="flex items-center justify-between text-[10px] font-mono text-white/50 pt-1">
                    <span>GPS: {activeEvent.location.lat.toFixed(4)}°N, {activeEvent.location.lng.toFixed(4)}°W</span>
                    {onSelectEventForAI && (
                      <button
                        onClick={() => onSelectEventForAI(activeEvent, trip)}
                        className="text-car-accent hover:underline flex items-center gap-1 font-bold"
                      >
                        <Sparkles size={11} />
                        Ask Live AI about this event
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Side (5 Cols): Miniature Route Preview with Mapped Events */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-white/60 font-mono flex items-center gap-1.5">
              <Layers size={12} className="text-car-accent" />
              Miniature Route Preview
            </span>

            {/* View Mode Toggle */}
            {isLoaded && mapsApiKey && (
              <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10 text-[10px]">
                <button
                  onClick={() => setViewMode('schematic')}
                  className={cn(
                    "px-2 py-0.5 rounded font-mono transition-colors",
                    viewMode === 'schematic' ? "bg-car-accent text-white font-bold" : "text-white/50 hover:text-white"
                  )}
                >
                  Vector
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={cn(
                    "px-2 py-0.5 rounded font-mono transition-colors",
                    viewMode === 'map' ? "bg-car-accent text-white font-bold" : "text-white/50 hover:text-white"
                  )}
                >
                  Map
                </button>
              </div>
            )}
          </div>

          {/* Route Canvas Card */}
          <div className="bg-black/60 rounded-2xl border border-white/10 p-3 relative overflow-hidden shadow-inner flex flex-col items-center justify-center min-h-[260px]">
            {/* Ambient Map Grid Background */}
            <div 
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.2) 1px, transparent 0)',
                backgroundSize: '16px 16px'
              }}
            />

            {/* Google Map View if toggled and loaded */}
            {viewMode === 'map' && isLoaded && mapsApiKey ? (
              <div className="w-full h-64 rounded-xl overflow-hidden relative z-10">
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  zoom={13}
                  center={trip.waypoints[0] || { lat: 40.7128, lng: -74.0060 }}
                  options={{
                    disableDefaultUI: true,
                    styles: [
                      { elementType: "geometry", stylers: [{ color: "#1e293b" }] },
                      { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
                      { featureType: "road", elementType: "geometry", stylers: [{ color: "#334155" }] },
                      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] }
                    ]
                  }}
                >
                  {trip.waypoints.length > 1 && (
                    <Polyline
                      path={trip.waypoints.map(w => ({ lat: w.lat, lng: w.lng }))}
                      options={{
                        strokeColor: "#38bdf8",
                        strokeWeight: 4,
                        strokeOpacity: 0.8
                      }}
                    />
                  )}

                  {/* Start / End Markers */}
                  {trip.waypoints.length > 0 && (
                    <Marker
                      position={{ lat: trip.waypoints[0].lat, lng: trip.waypoints[0].lng }}
                      icon={{
                        path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                        scale: 6,
                        fillColor: "#10b981",
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: "#FFFFFF"
                      }}
                    />
                  )}

                  {filteredEvents.map((evt, idx) => {
                    if (!evt.location) return null;
                    const config = EVENT_CONFIG[evt.type] || EVENT_CONFIG.harsh_braking;
                    const isSelected = activeEventIndex === idx;

                    return (
                      <Marker
                        key={idx}
                        position={{ lat: evt.location.lat, lng: evt.location.lng }}
                        onClick={() => setSelectedEventIndex(idx)}
                        icon={{
                          path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                          scale: isSelected ? 9 : 7,
                          fillColor: config.color,
                          fillOpacity: 1,
                          strokeWeight: isSelected ? 3 : 1.5,
                          strokeColor: "#FFFFFF"
                        }}
                      />
                    );
                  })}
                </GoogleMap>
              </div>
            ) : svgRoute ? (
              /* High-Fidelity Responsive SVG Route Preview with Mapped Harsh Events */
              <div className="w-full relative z-10 flex flex-col items-center">
                <svg
                  viewBox={`0 0 ${svgRoute.width} ${svgRoute.height}`}
                  className="w-full max-h-56 filter drop-shadow-md select-none overflow-visible"
                >
                  <defs>
                    <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                      <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity="0.9" />
                    </linearGradient>

                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="glow" />
                      <feComposite in="SourceGraphic" in2="glow" operator="over" />
                    </filter>
                  </defs>

                  {/* Route path casing (thick dark backdrop) */}
                  <path
                    d={svgRoute.pathD}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Route path glowing gradient line */}
                  <path
                    d={svgRoute.pathD}
                    fill="none"
                    stroke="url(#routeGradient)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#glow)"
                  />

                  {/* Start Point Pin (A) */}
                  {svgRoute.startPoint && (
                    <g transform={`translate(${svgRoute.startPoint.x}, ${svgRoute.startPoint.y})`}>
                      <circle r="7" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                      <text
                        y="3"
                        textAnchor="middle"
                        fontSize="8"
                        fontWeight="bold"
                        fill="#ffffff"
                        fontFamily="monospace"
                      >
                        A
                      </text>
                    </g>
                  )}

                  {/* End Point Pin (B) */}
                  {svgRoute.endPoint && (
                    <g transform={`translate(${svgRoute.endPoint.x}, ${svgRoute.endPoint.y})`}>
                      <circle r="7" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                      <text
                        y="3"
                        textAnchor="middle"
                        fontSize="8"
                        fontWeight="bold"
                        fill="#ffffff"
                        fontFamily="monospace"
                      >
                        B
                      </text>
                    </g>
                  )}

                  {/* Mapped Harsh Events Pins directly along the Route */}
                  {svgRoute.eventPoints.map((pt, idx) => {
                    const evt = pt.event;
                    const config = EVENT_CONFIG[evt.type] || EVENT_CONFIG.harsh_braking;
                    const isSelected = activeEventIndex === pt.originalIndex;

                    return (
                      <g
                        key={idx}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        onClick={() => setSelectedEventIndex(pt.originalIndex)}
                        onMouseEnter={() => setHoveredEventIndex(pt.originalIndex)}
                        onMouseLeave={() => setHoveredEventIndex(null)}
                        className="cursor-pointer transition-all"
                      >
                        {/* Selected event pulsing halo */}
                        {isSelected && (
                          <circle
                            r="15"
                            fill={config.color}
                            opacity="0.3"
                            className="animate-pulse"
                          />
                        )}

                        {/* Event circle */}
                        <circle
                          r={isSelected ? "9" : "6.5"}
                          fill={config.color}
                          stroke="#ffffff"
                          strokeWidth={isSelected ? "2.5" : "1.5"}
                          className="transition-all hover:scale-125"
                        />

                        {/* Tooltip on hover */}
                        {isSelected && (
                          <g transform="translate(0, -16)">
                            <rect
                              x="-40"
                              y="-16"
                              width="80"
                              height="16"
                              rx="4"
                              fill="#0f172a"
                              stroke={config.color}
                              strokeWidth="1"
                            />
                            <text
                              y="-5"
                              textAnchor="middle"
                              fontSize="8"
                              fontWeight="bold"
                              fill="#ffffff"
                              fontFamily="sans-serif"
                            >
                              {config.label}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Legend bar */}
                <div className="flex flex-wrap items-center justify-between w-full mt-2 pt-2 border-t border-white/5 text-[9px] text-white/60 font-mono">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" /> Start
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500" /> End
                    </span>
                  </div>
                  <span className="text-white/40">
                    Hover pins to inspect details
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 text-white/30 text-xs font-mono">
                <MapPin size={24} className="mx-auto mb-2 opacity-50" />
                No coordinate waypoints available for route schematic.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
