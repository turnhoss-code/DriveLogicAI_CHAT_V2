import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Flag, 
  Gauge, 
  Zap, 
  AlertTriangle, 
  ShieldCheck, 
  FileSpreadsheet, 
  FileCode, 
  MapPin, 
  Clock, 
  ArrowUpRight,
  Activity,
  Car
} from 'lucide-react';
import { Trip, TripEvent } from '../types';
import { exportTripAsCSV, exportTripAsJSON } from '../lib/tripExporter';
import { cn } from '../lib/utils';

interface TripSummaryModalProps {
  isOpen: boolean;
  trip: Trip | null;
  onClose: () => void;
  onViewOnMap?: (tripId: string) => void;
}

export const TripSummaryModal: React.FC<TripSummaryModalProps> = ({
  isOpen,
  trip,
  onClose,
  onViewOnMap,
}) => {
  if (!isOpen || !trip) return null;

  const startTime = trip.startTime;
  const endTime = trip.endTime || Date.now();
  const durationMs = Math.max(1000, endTime - startTime);
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationSeconds = Math.floor((durationMs % 60000) / 1000);
  const durationFormatted = durationMinutes > 0 
    ? `${durationMinutes}m ${durationSeconds}s` 
    : `${durationSeconds}s`;

  const distanceMiles = trip.distance || 0;
  const distanceKm = distanceMiles * 1.60934;

  // Average speed calculation
  const durationHours = durationMs / 3600000;
  const calculatedAvgSpeed = durationHours > 0 && distanceMiles > 0
    ? Math.round(distanceMiles / durationHours)
    : (trip.avgSpeed || 0);
  const effectiveAvgSpeed = trip.avgSpeed !== undefined && trip.avgSpeed > 0 
    ? trip.avgSpeed 
    : Math.max(0, calculatedAvgSpeed);

  // Max G-force detected
  const maxG = trip.maxGForce && trip.maxGForce > 0 
    ? trip.maxGForce 
    : (trip.events && trip.events.length > 0 
        ? Math.max(1.0, ...trip.events.map(e => (e.severity / 25))) 
        : 1.05);

  // Harsh events breakdown
  const events = trip.events || [];
  const harshBrakingCount = events.filter(e => e.type === 'harsh_braking').length;
  const rapidAccelCount = events.filter(e => e.type === 'rapid_acceleration').length;
  const sharpCorneringCount = events.filter(e => e.type === 'sharp_cornering').length;
  const overheatingCount = events.filter(e => e.type === 'overheating').length;
  const totalHarshEvents = events.length;

  // Damage / wear assessment
  const wearScore = Math.round(trip.averageDamageScore || 0);
  const getWearRating = (score: number) => {
    if (score < 25) return { label: 'Nominal / Minimal Wear', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    if (score < 60) return { label: 'Moderate Stress', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    return { label: 'High Component Stress', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
  };
  const wearRating = getWearRating(wearScore);

  const formatEventTime = (timestamp: number) => {
    const elapsedMs = Math.max(0, timestamp - startTime);
    const m = Math.floor(elapsedMs / 60000);
    const s = Math.floor((elapsedMs % 60000) / 1000);
    return `+${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getEventBadge = (type: TripEvent['type']) => {
    switch (type) {
      case 'harsh_braking':
        return { label: 'Harsh Braking', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
      case 'rapid_acceleration':
        return { label: 'Rapid Acceleration', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
      case 'sharp_cornering':
        return { label: 'Sharp Cornering', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
      case 'overheating':
        return { label: 'Thermal Alert', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
      default:
        return { label: 'Driving Event', color: 'text-white/60 bg-white/10 border-white/20' };
    }
  };

  return (
    <AnimatePresence>
      <div 
        id="modal-trip-summary-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          id="modal-trip-summary"
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-zinc-950 border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-5 py-4 bg-gradient-to-b from-white/10 to-transparent border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-car-accent/20 border border-car-accent/30 flex items-center justify-center text-car-accent shadow-sm">
                <Flag size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white tracking-tight">Trip Summary</h2>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Completed
                  </span>
                </div>
                <p className="text-[10px] text-white/50 font-mono">
                  {new Date(startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Duration: {durationFormatted}
                </p>
              </div>
            </div>

            <button
              id="btn-trip-summary-close"
              onClick={onClose}
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Summary"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
            {/* Primary Telematics Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              {/* Total Distance */}
              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-white/40 mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider">Distance</span>
                  <MapPin size={13} className="text-car-accent" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-white leading-tight">
                    {distanceMiles.toFixed(2)}
                    <span className="text-xs font-normal text-white/50 ml-1">mi</span>
                  </div>
                  <div className="text-[10px] text-white/40 font-mono mt-0.5">
                    {distanceKm.toFixed(1)} km
                  </div>
                </div>
              </div>

              {/* Average Speed */}
              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-white/40 mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider">Avg Speed</span>
                  <Gauge size={13} className="text-sky-400" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-white leading-tight">
                    {effectiveAvgSpeed}
                    <span className="text-xs font-normal text-white/50 ml-1">mph</span>
                  </div>
                  <div className="text-[10px] text-white/40 font-mono mt-0.5">
                    {Math.round(effectiveAvgSpeed * 1.60934)} km/h
                  </div>
                </div>
              </div>

              {/* Max G-Force */}
              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-white/40 mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider">Max Force</span>
                  <Zap size={13} className={maxG > 1.5 ? "text-rose-400" : "text-amber-400"} />
                </div>
                <div>
                  <div className={cn(
                    "text-lg sm:text-xl font-bold font-mono leading-tight",
                    maxG > 1.5 ? "text-rose-400" : maxG > 1.2 ? "text-amber-400" : "text-emerald-400"
                  )}>
                    {maxG.toFixed(2)}
                    <span className="text-xs font-normal opacity-70 ml-1">G</span>
                  </div>
                  <div className="text-[10px] text-white/40 font-mono mt-0.5">
                    {maxG > 1.5 ? 'Harsh' : maxG > 1.2 ? 'Moderate' : 'Nominal'}
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle Wear & Dynamics Status Bar */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-white/5 text-car-accent border border-white/5">
                  <Activity size={15} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Drive Dynamics Score</div>
                  <div className="text-[10px] text-white/50 font-mono">
                    Telemetry wear index: {wearScore} / 100
                  </div>
                </div>
              </div>
              <span className={cn("px-2.5 py-1 rounded-xl text-[10px] font-mono font-semibold border", wearRating.color)}>
                {wearRating.label}
              </span>
            </div>

            {/* Harsh Driving Events Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={14} className={totalHarshEvents > 0 ? "text-amber-400" : "text-emerald-400"} />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Harsh Driving Events
                  </h3>
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border",
                  totalHarshEvents > 0 
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30" 
                    : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                )}>
                  {totalHarshEvents === 0 ? "0 Detected" : `${totalHarshEvents} Event${totalHarshEvents > 1 ? 's' : ''}`}
                </span>
              </div>

              {/* Event Breakdown Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                  <span className="text-[9px] uppercase font-mono text-white/40 block">Harsh Braking</span>
                  <span className={cn("text-xs font-mono font-bold", harshBrakingCount > 0 ? "text-rose-400" : "text-white/60")}>
                    {harshBrakingCount}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                  <span className="text-[9px] uppercase font-mono text-white/40 block">Rapid Accel</span>
                  <span className={cn("text-xs font-mono font-bold", rapidAccelCount > 0 ? "text-amber-400" : "text-white/60")}>
                    {rapidAccelCount}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                  <span className="text-[9px] uppercase font-mono text-white/40 block">Cornering</span>
                  <span className={cn("text-xs font-mono font-bold", sharpCorneringCount > 0 ? "text-sky-400" : "text-white/60")}>
                    {sharpCorneringCount}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                  <span className="text-[9px] uppercase font-mono text-white/40 block">Thermal</span>
                  <span className={cn("text-xs font-mono font-bold", overheatingCount > 0 ? "text-orange-400" : "text-white/60")}>
                    {overheatingCount}
                  </span>
                </div>
              </div>

              {/* Detailed Events List or Smooth Driving Banner */}
              {totalHarshEvents === 0 ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-1">
                  <ShieldCheck size={24} className="text-emerald-400 mx-auto" />
                  <p className="text-xs font-bold text-emerald-300">Clean Driving Telematics</p>
                  <p className="text-[10px] text-emerald-200/60 font-mono">
                    No harsh deceleration, aggressive acceleration, or acute lateral forces were detected.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {events.map((ev, idx) => {
                    const badge = getEventBadge(ev.type);
                    return (
                      <div 
                        key={ev.id || `${ev.timestamp}-${idx}`}
                        className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono text-white/40 shrink-0">
                            {formatEventTime(ev.timestamp)}
                          </span>
                          <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-mono uppercase font-bold border shrink-0", badge.color)}>
                            {badge.label}
                          </span>
                          {ev.note && (
                            <span className="text-[10px] text-white/60 truncate font-sans">
                              {ev.note}
                            </span>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-mono font-bold text-white">
                            Sev: {Math.round(ev.severity)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Export & Actions */}
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  id="btn-summary-export-csv"
                  onClick={() => exportTripAsCSV(trip)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 text-white/80 text-xs font-mono transition-all cursor-pointer"
                  title="Export trip data to CSV"
                >
                  <FileSpreadsheet size={13} className="text-emerald-400" />
                  <span>CSV</span>
                </button>

                <button
                  id="btn-summary-export-json"
                  onClick={() => exportTripAsJSON(trip)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-sky-500/20 hover:text-sky-300 border border-white/10 hover:border-sky-500/30 text-white/80 text-xs font-mono transition-all cursor-pointer"
                  title="Export trip data to JSON"
                >
                  <FileCode size={13} className="text-sky-400" />
                  <span>JSON</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {onViewOnMap && (
                  <button
                    id="btn-summary-view-map"
                    onClick={() => {
                      onViewOnMap(trip.id);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl bg-car-accent/20 hover:bg-car-accent/30 border border-car-accent/40 text-car-accent text-xs font-semibold transition-all cursor-pointer"
                  >
                    <span>View on Map</span>
                    <ArrowUpRight size={13} />
                  </button>
                )}

                <button
                  id="btn-summary-done"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white text-black hover:bg-white/90 text-xs font-bold transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default TripSummaryModal;
