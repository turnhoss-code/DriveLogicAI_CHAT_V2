import React from 'react';
import { 
  Flag, 
  MapPin, 
  Clock, 
  Gauge, 
  AlertTriangle, 
  Zap, 
  RotateCw, 
  Thermometer, 
  ShieldCheck, 
  Activity, 
  FileSpreadsheet, 
  FileCode, 
  X,
  Navigation
} from 'lucide-react';
import { Trip, TripEvent } from '../types';
import { exportTripAsCSV, exportTripAsJSON } from '../lib/tripExporter';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface TripSummaryCardProps {
  trip: Trip;
  onClose?: () => void;
  onViewOnMap?: (tripId: string) => void;
  className?: string;
}

export const TripSummaryCard: React.FC<TripSummaryCardProps> = ({
  trip,
  onClose,
  onViewOnMap,
  className
}) => {
  const startTime = trip.startTime;
  const endTime = trip.endTime || (trip.waypoints && trip.waypoints.length > 0 
    ? trip.waypoints[trip.waypoints.length - 1].timestamp 
    : startTime + 1000 * 60 * 15);
  
  const durationMs = Math.max(1000, endTime - startTime);
  const durationHours = durationMs / 3600000;
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationSeconds = Math.floor((durationMs % 60000) / 1000);
  const durationFormatted = durationMinutes >= 60
    ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
    : durationMinutes > 0
      ? `${durationMinutes}m ${durationSeconds}s`
      : `${durationSeconds}s`;

  const distanceMiles = trip.distance || 0;
  const distanceKm = distanceMiles * 1.60934;

  // Average speed calculation
  const calculatedAvgSpeed = durationHours > 0 && distanceMiles > 0
    ? Math.round(distanceMiles / durationHours)
    : (trip.avgSpeed || 0);
  const averageSpeed = trip.avgSpeed && trip.avgSpeed > 0 
    ? trip.avgSpeed 
    : calculatedAvgSpeed;
  const avgSpeedKmh = Math.round(averageSpeed * 1.60934);

  const events = trip.events || [];
  const harshBrakingCount = events.filter(e => e.type === 'harsh_braking').length;
  const rapidAccelCount = events.filter(e => e.type === 'rapid_acceleration').length;
  const sharpCornerCount = events.filter(e => e.type === 'sharp_cornering').length;
  const overheatCount = events.filter(e => e.type === 'overheating').length;

  const wearScore = Math.round(trip.averageDamageScore || 0);
  const getWearBadge = (score: number) => {
    if (score < 25) return { label: 'LOW WEAR', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    if (score < 55) return { label: 'MODERATE WEAR', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    return { label: 'HIGH STRESS', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
  };
  const wearBadge = getWearBadge(wearScore);

  const formatEventTime = (timestamp: number) => {
    const elapsedMs = Math.max(0, timestamp - startTime);
    const m = Math.floor(elapsedMs / 60000);
    const s = Math.floor((elapsedMs % 60000) / 1000);
    return `+${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getEventMeta = (type: TripEvent['type']) => {
    switch (type) {
      case 'harsh_braking':
        return {
          label: 'Harsh Braking',
          icon: AlertTriangle,
          textColor: 'text-rose-400',
          badgeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
          barColor: 'bg-rose-500',
          tip: 'Heavy deceleration detected. High thermal load on pads.'
        };
      case 'rapid_acceleration':
        return {
          label: 'Rapid Acceleration',
          icon: Zap,
          textColor: 'text-amber-400',
          badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
          barColor: 'bg-amber-500',
          tip: 'Torque surge detected. Elevated drivetrain wear.'
        };
      case 'sharp_cornering':
        return {
          label: 'Sharp Cornering',
          icon: RotateCw,
          textColor: 'text-purple-400',
          badgeBg: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
          barColor: 'bg-purple-500',
          tip: 'High lateral G-forces. Lateral tire scrub observed.'
        };
      case 'overheating':
        return {
          label: 'Coolant Alert',
          icon: Thermometer,
          textColor: 'text-orange-400',
          badgeBg: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
          barColor: 'bg-orange-500',
          tip: 'Engine temperature spiked beyond nominal parameters.'
        };
      default:
        return {
          label: 'Driving Event',
          icon: Activity,
          textColor: 'text-white/70',
          badgeBg: 'bg-white/10 border-white/20 text-white/80',
          barColor: 'bg-white/50',
          tip: 'Driving telemetry anomaly detected.'
        };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border border-white/15 bg-zinc-950/90 backdrop-blur-xl shadow-2xl p-4 sm:p-5 space-y-4 text-left overflow-hidden relative",
        className
      )}
    >
      {/* Glow Effect */}
      <div className="absolute top-0 right-0 w-64 h-32 bg-car-accent/10 rounded-full blur-3xl pointer-events-none" />

      {/* Card Header */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-car-accent/20 border border-car-accent/30 flex items-center justify-center text-car-accent shadow-sm">
            <Flag size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">Trip Summary</h4>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Finished Trip
              </span>
            </div>
            <p className="text-[10px] text-white/40 font-mono mt-0.5">
              {new Date(startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => exportTripAsCSV(trip)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-white/50 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 transition-colors text-[10px] font-mono flex items-center gap-1"
            title="Export CSV"
          >
            <FileSpreadsheet size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            onClick={() => exportTripAsJSON(trip)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-sky-500/20 text-white/50 hover:text-sky-300 border border-white/10 hover:border-sky-500/30 transition-colors text-[10px] font-mono flex items-center gap-1"
            title="Export JSON"
          >
            <FileCode size={13} className="text-sky-400" />
            <span className="hidden sm:inline">JSON</span>
          </button>
          {onViewOnMap && (
            <button
              onClick={() => onViewOnMap(trip.id)}
              className="p-1.5 rounded-lg bg-car-accent/20 hover:bg-car-accent/35 text-car-accent border border-car-accent/30 transition-colors text-[10px] font-mono flex items-center gap-1"
              title="View on Map"
            >
              <Navigation size={13} />
              <span className="hidden sm:inline">Map</span>
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors ml-1"
              title="Close summary"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main Metrics 3-Card Grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 relative z-10">
        {/* Total Distance */}
        <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[9px] font-mono uppercase tracking-wider">Total Distance</span>
            <MapPin size={13} className="text-car-accent" />
          </div>
          <div>
            <div className="text-base sm:text-xl font-bold font-mono text-white leading-tight">
              {distanceMiles.toFixed(1)} <span className="text-[10px] font-normal text-white/50">mi</span>
            </div>
            <div className="text-[9px] text-white/40 font-mono mt-0.5">
              {distanceKm.toFixed(1)} km
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[9px] font-mono uppercase tracking-wider">Duration</span>
            <Clock size={13} className="text-sky-400" />
          </div>
          <div>
            <div className="text-base sm:text-xl font-bold font-mono text-white leading-tight">
              {durationFormatted}
            </div>
            <div className="text-[9px] text-white/40 font-mono mt-0.5">
              {Math.max(1, Math.round(durationMinutes))} mins active
            </div>
          </div>
        </div>

        {/* Average Speed */}
        <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[9px] font-mono uppercase tracking-wider">Avg Speed</span>
            <Gauge size={13} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-base sm:text-xl font-bold font-mono text-white leading-tight">
              {averageSpeed} <span className="text-[10px] font-normal text-white/50">mph</span>
            </div>
            <div className="text-[9px] text-white/40 font-mono mt-0.5">
              {avgSpeedKmh} km/h
            </div>
          </div>
        </div>
      </div>

      {/* Component Wear and Event Counter Strip */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-wrap items-center justify-between gap-2 relative z-10 text-[10px] font-mono">
        <div className="flex items-center gap-2">
          <span className="text-white/40 uppercase">Wear Assessment:</span>
          <span className={cn("px-2 py-0.5 rounded-md font-bold border", wearBadge.color)}>
            {wearBadge.label} ({wearScore} pts)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/40 uppercase">Events:</span>
          <span className="text-white font-bold">{events.length} logged</span>
          {harshBrakingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {harshBrakingCount} brake
            </span>
          )}
          {rapidAccelCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {rapidAccelCount} accel
            </span>
          )}
          {sharpCornerCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {sharpCornerCount} turn
            </span>
          )}
        </div>
      </div>

      {/* Recorded Events List */}
      <div className="space-y-2 relative z-10">
        <div className="flex items-center justify-between">
          <h5 className="text-[11px] font-bold uppercase tracking-wider text-white/70 font-mono flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-car-accent" />
            Recorded Trip Events ({events.length})
          </h5>
          <span className="text-[9px] font-mono text-white/40">Chronological list</span>
        </div>

        {events.length === 0 ? (
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center flex flex-col items-center justify-center gap-1.5 text-white/40">
            <ShieldCheck size={20} className="text-emerald-400/80" />
            <span className="text-xs font-medium text-white/80">Smooth Driving — No Harsh Events Logged</span>
            <span className="text-[10px] font-mono">No sudden braking, harsh acceleration, or excessive lateral G-forces recorded.</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {events.map((evt, idx) => {
              const meta = getEventMeta(evt.type);
              const Icon = meta.icon;
              return (
                <div
                  key={evt.id || idx}
                  className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 transition-all flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center border shrink-0", meta.badgeBg)}>
                        <Icon size={13} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{meta.label}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/40 text-white/50 border border-white/10">
                          {formatEventTime(evt.timestamp)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden hidden sm:block">
                        <div 
                          className={cn("h-full rounded-full", meta.barColor)} 
                          style={{ width: `${Math.min(100, Math.max(10, evt.severity))}%` }} 
                        />
                      </div>
                      <span className={cn("text-[10px] font-mono font-bold", meta.textColor)}>
                        {evt.severity} <span className="text-[8px] text-white/30">G-SEV</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-white/50 pl-8">
                    <span className="truncate">{evt.note || meta.tip}</span>
                    {evt.location && (
                      <span className="font-mono text-white/30 shrink-0 ml-2">
                        {evt.location.lat.toFixed(4)}, {evt.location.lng.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default TripSummaryCard;
