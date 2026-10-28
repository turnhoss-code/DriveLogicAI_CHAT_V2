import React, { useState, useMemo } from 'react';
import { 
  GitCompare, 
  Activity, 
  MapPin, 
  Clock, 
  Gauge, 
  AlertTriangle, 
  Zap, 
  RotateCw, 
  Flame, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  Sliders, 
  ChevronRight, 
  Sparkles,
  Layers,
  ArrowRightLeft,
  Navigation,
  Compass,
  Info
} from 'lucide-react';
import { Trip, TripEvent } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { GoogleMap, Polyline, Marker, InfoWindow } from '@react-google-maps/api';

export interface SensorSpikePOI {
  id: string;
  tripId: string;
  tripName: string;
  tripColor: string;
  type: 'harsh_braking' | 'rapid_acceleration' | 'sharp_cornering' | 'overheating' | 'damage_jump' | 'g_spike';
  title: string;
  severity: 'critical' | 'warning' | 'moderate';
  value: string;
  metricType: string;
  timestamp: number;
  timeOffsetFormatted: string;
  location?: { lat: number; lng: number };
  locationName?: string;
  diagnosticAdvice: string;
}

interface TripComparisonViewProps {
  trips: Trip[];
  onSelectTrip?: (tripId: string) => void;
  mapsApiKey?: string;
  isLoaded?: boolean;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '1rem'
};

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#1e2430" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1e2430" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a99ad" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d3748" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3f4d67" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] }
];

export const TripComparisonView: React.FC<TripComparisonViewProps> = ({
  trips,
  onSelectTrip,
  mapsApiKey,
  isLoaded
}) => {
  const [selectedTripAId, setSelectedTripAId] = useState<string>(() => trips[0]?.id || '');
  const [selectedTripBId, setSelectedTripBId] = useState<string>(() => trips[1]?.id || trips[0]?.id || '');
  const [activePoiFilter, setActivePoiFilter] = useState<'all' | 'tripA' | 'tripB' | 'critical'>('all');
  const [selectedPoi, setSelectedPoi] = useState<SensorSpikePOI | null>(null);

  const tripA = useMemo(() => trips.find(t => t.id === selectedTripAId) || trips[0], [trips, selectedTripAId]);
  const tripB = useMemo(() => trips.find(t => t.id === selectedTripBId) || trips[1] || trips[0], [trips, selectedTripBId]);

  const handleSwapTrips = () => {
    const temp = selectedTripAId;
    setSelectedTripAId(selectedTripBId);
    setSelectedTripBId(temp);
  };

  // Helper to extract sensor spikes / POIs from a trip
  const extractSensorSpikes = (trip: Trip, tripLabel: string, color: string): SensorSpikePOI[] => {
    if (!trip) return [];
    const pois: SensorSpikePOI[] = [];
    const tripStart = trip.startTime;

    // 1. From recorded events
    if (trip.events && trip.events.length > 0) {
      trip.events.forEach((evt, idx) => {
        const offsetSec = Math.max(0, Math.floor((evt.timestamp - tripStart) / 1000));
        const mins = Math.floor(offsetSec / 60);
        const secs = offsetSec % 60;
        const timeOffset = `+${mins}m ${secs < 10 ? '0' : ''}${secs}s`;

        let title = 'Telemetry Spike';
        let severity: 'critical' | 'warning' | 'moderate' = 'moderate';
        let advice = 'Sensor spike observed during transit.';
        let metricType = 'Telemetry';

        if (evt.type === 'harsh_braking') {
          title = 'Severe Braking Spike';
          severity = evt.severity > 60 ? 'critical' : 'warning';
          advice = 'High G-force deceleration event detected. Increased thermal cycling on brake pads.';
          metricType = 'Accelerometer (-G)';
        } else if (evt.type === 'rapid_acceleration') {
          title = 'Rapid Throttle Burst';
          severity = evt.severity > 60 ? 'warning' : 'moderate';
          advice = 'Sudden torque surge detected. Spikes fuel consumption and driveline stress.';
          metricType = 'Accelerometer (+G)';
        } else if (evt.type === 'sharp_cornering') {
          title = 'High Lateral Turn Scrub';
          severity = 'warning';
          advice = 'High angular rotation velocity. Induces uneven outer tire tread scrub.';
          metricType = 'Gyroscope (°/s)';
        } else if (evt.type === 'overheating') {
          title = 'Engine Temp Threshold Spike';
          severity = 'critical';
          advice = 'Coolant temperature spiked above normal envelope. Inspect cooling system.';
          metricType = 'OBD-II ECT Sensor';
        }

        pois.push({
          id: `${trip.id}-evt-${idx}`,
          tripId: trip.id,
          tripName: tripLabel,
          tripColor: color,
          type: evt.type,
          title,
          severity,
          value: `Severity ${evt.severity}/100`,
          metricType,
          timestamp: evt.timestamp,
          timeOffsetFormatted: timeOffset,
          location: evt.location,
          diagnosticAdvice: advice
        });
      });
    }

    // 2. From damage spikes in damageHistory
    if (trip.damageHistory && trip.damageHistory.length > 1) {
      for (let i = 1; i < trip.damageHistory.length; i++) {
        const prev = trip.damageHistory[i - 1];
        const curr = trip.damageHistory[i];
        const jump = curr.score - prev.score;
        if (jump >= 18) {
          const offsetSec = Math.max(0, Math.floor((curr.timestamp - tripStart) / 1000));
          const mins = Math.floor(offsetSec / 60);
          const secs = offsetSec % 60;

          // Find approximate coordinate from nearest waypoint
          let location = undefined;
          if (trip.waypoints && trip.waypoints.length > 0) {
            const nearest = trip.waypoints.reduce((closest, wp) => {
              const diff1 = Math.abs(wp.timestamp - curr.timestamp);
              const diff2 = Math.abs(closest.timestamp - curr.timestamp);
              return diff1 < diff2 ? wp : closest;
            }, trip.waypoints[0]);
            location = { lat: nearest.lat, lng: nearest.lng };
          }

          pois.push({
            id: `${trip.id}-dmg-${i}`,
            tripId: trip.id,
            tripName: tripLabel,
            tripColor: color,
            type: 'damage_jump',
            title: 'Abrupt Surface Impact Spike',
            severity: jump > 28 ? 'critical' : 'warning',
            value: `+${Math.round(jump)} Damage Pts`,
            metricType: 'Suspension & Chassis Wear',
            timestamp: curr.timestamp,
            timeOffsetFormatted: `+${mins}m ${secs < 10 ? '0' : ''}${secs}s`,
            location,
            diagnosticAdvice: 'Sudden high impact recorded, typical of pothole strikes or expansion joint impacts.'
          });
        }
      }
    }

    return pois.sort((a, b) => a.timestamp - b.timestamp);
  };

  const poisTripA = useMemo(() => extractSensorSpikes(tripA, 'Trip A', '#38bdf8'), [tripA]);
  const poisTripB = useMemo(() => extractSensorSpikes(tripB, 'Trip B', '#a855f7'), [tripB]);

  const allPois = useMemo(() => {
    return [...poisTripA, ...poisTripB].sort((a, b) => b.severity.localeCompare(a.severity));
  }, [poisTripA, poisTripB]);

  const filteredPois = useMemo(() => {
    if (activePoiFilter === 'tripA') return poisTripA;
    if (activePoiFilter === 'tripB') return poisTripB;
    if (activePoiFilter === 'critical') return allPois.filter(p => p.severity === 'critical');
    return allPois;
  }, [activePoiFilter, poisTripA, poisTripB, allPois]);

  // Normalized comparative damage curve for chart
  const comparativeChartData = useMemo(() => {
    const pointsCount = 10;
    const data = [];

    const getScoreAtPct = (trip: Trip, pct: number) => {
      if (!trip || !trip.damageHistory || trip.damageHistory.length === 0) {
        return Math.round(trip?.averageDamageScore || 20);
      }
      const history = trip.damageHistory;
      const idx = Math.min(history.length - 1, Math.floor((pct / 100) * history.length));
      return history[idx].score;
    };

    for (let i = 0; i <= pointsCount; i++) {
      const pct = (i / pointsCount) * 100;
      data.push({
        progressPct: `${Math.round(pct)}%`,
        tripA: tripA ? getScoreAtPct(tripA, pct) : 0,
        tripB: tripB ? getScoreAtPct(tripB, pct) : 0,
      });
    }
    return data;
  }, [tripA, tripB]);

  if (!tripA || !tripB) {
    return (
      <div className="glass-card p-8 rounded-3xl text-center space-y-3">
        <GitCompare className="mx-auto text-car-accent/60" size={32} />
        <h4 className="text-white font-bold">Trip Comparison Requires At Least 2 Trips</h4>
        <p className="text-xs text-white/50 max-w-md mx-auto">
          Record more driving journeys or explore the provided demo trips to view side-by-side road wear, sensor spikes, and comparative analytics.
        </p>
      </div>
    );
  }

  const scoreDiff = tripB.averageDamageScore - tripA.averageDamageScore;
  const isTripABetter = tripA.averageDamageScore < tripB.averageDamageScore;
  const winnerTrip = isTripABetter ? 'Trip A' : 'Trip B';
  const pctDiff = Math.abs(Math.round(((tripB.averageDamageScore - tripA.averageDamageScore) / (tripB.averageDamageScore || 1)) * 100));

  const tripADurationMin = Math.round(((tripA.endTime || tripA.startTime + 600000) - tripA.startTime) / 60000);
  const tripBDurationMin = Math.round(((tripB.endTime || tripB.startTime + 600000) - tripB.startTime) / 60000);

  return (
    <div className="space-y-6">
      {/* Selector Header Bar */}
      <div className="glass-card p-5 rounded-3xl border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-car-accent/10 rounded-xl text-car-accent">
              <GitCompare size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Trip Comparison & Sensor Spike Analysis</h3>
              <p className="text-xs text-white/50">Compare route wear metrics and pinpoint severe sensor spikes</p>
            </div>
          </div>

          <button
            onClick={handleSwapTrips}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-mono text-white/70 hover:text-white transition-all cursor-pointer"
            title="Swap Trip A and Trip B"
          >
            <ArrowRightLeft size={14} className="text-car-accent" />
            <span>Swap A ⇄ B</span>
          </button>
        </div>

        {/* Trip Dropdown Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
          {/* Trip A Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-sky-400 font-bold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                Trip A (Baseline)
              </span>
              <span className="text-white/40">Score: {Math.round(tripA.averageDamageScore)}</span>
            </div>
            <select
              value={selectedTripAId}
              onChange={(e) => setSelectedTripAId(e.target.value)}
              className="w-full bg-black/40 border border-sky-400/30 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-400 transition-colors"
            >
              {trips.map((t, idx) => (
                <option key={t.id} value={t.id} className="bg-zinc-900 text-white">
                  Trip {idx + 1}: {new Date(t.startTime).toLocaleDateString()} ({t.distance.toFixed(1)} mi, Score {Math.round(t.averageDamageScore)})
                </option>
              ))}
            </select>
          </div>

          {/* Trip B Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-purple-400 font-bold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                Trip B (Comparison)
              </span>
              <span className="text-white/40">Score: {Math.round(tripB.averageDamageScore)}</span>
            </div>
            <select
              value={selectedTripBId}
              onChange={(e) => setSelectedTripBId(e.target.value)}
              className="w-full bg-black/40 border border-purple-400/30 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-400 transition-colors"
            >
              {trips.map((t, idx) => (
                <option key={t.id} value={t.id} className="bg-zinc-900 text-white">
                  Trip {idx + 1}: {new Date(t.startTime).toLocaleDateString()} ({t.distance.toFixed(1)} mi, Score {Math.round(t.averageDamageScore)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Comparative Verdict Banner */}
      <div className={cn(
        "p-5 rounded-3xl border flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-md relative overflow-hidden",
        isTripABetter 
          ? "bg-sky-500/10 border-sky-500/20 text-sky-200" 
          : "bg-purple-500/10 border-purple-500/20 text-purple-200"
      )}>
        <div className="flex items-center gap-3.5 z-10">
          <div className={cn(
            "p-3 rounded-2xl",
            isTripABetter ? "bg-sky-500/20 text-sky-300" : "bg-purple-500/20 text-purple-300"
          )}>
            <Sparkles size={22} />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm uppercase tracking-wide">
              {winnerTrip} demonstrated lower mechanical wear
            </h4>
            <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
              {winnerTrip} produced {pctDiff}% less wear on suspension and brakes, with {Math.abs(poisTripA.length - poisTripB.length)} fewer severe sensor spikes.
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-2 font-mono z-10 shrink-0">
          <span className="text-xs uppercase tracking-wider text-white/50">Delta:</span>
          <span className={cn(
            "text-xl font-bold",
            scoreDiff > 0 ? "text-emerald-400" : "text-amber-400"
          )}>
            {scoreDiff > 0 ? `+${scoreDiff.toFixed(0)}` : scoreDiff.toFixed(0)} pts
          </span>
        </div>
      </div>

      {/* Side-by-Side Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4 rounded-2xl space-y-1">
          <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">Average Damage Score</span>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-xl font-bold font-mono text-sky-400">{Math.round(tripA.averageDamageScore)}</span>
            <span className="text-xs text-white/20">vs</span>
            <span className="text-xl font-bold font-mono text-purple-400">{Math.round(tripB.averageDamageScore)}</span>
          </div>
          <div className="text-[9px] text-white/40 font-mono">Lower is better</div>
        </div>

        <div className="glass-card p-4 rounded-2xl space-y-1">
          <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">Route Distance</span>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-xl font-bold font-mono text-sky-400">{tripA.distance.toFixed(1)} <span className="text-xs font-normal">mi</span></span>
            <span className="text-xs text-white/20">vs</span>
            <span className="text-xl font-bold font-mono text-purple-400">{tripB.distance.toFixed(1)} <span className="text-xs font-normal">mi</span></span>
          </div>
          <div className="text-[9px] text-white/40 font-mono">Total mileage</div>
        </div>

        <div className="glass-card p-4 rounded-2xl space-y-1">
          <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">Trip Duration</span>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-xl font-bold font-mono text-sky-400">{tripADurationMin} <span className="text-xs font-normal">min</span></span>
            <span className="text-xs text-white/20">vs</span>
            <span className="text-xl font-bold font-mono text-purple-400">{tripBDurationMin} <span className="text-xs font-normal">min</span></span>
          </div>
          <div className="text-[9px] text-white/40 font-mono">Total time active</div>
        </div>

        <div className="glass-card p-4 rounded-2xl space-y-1">
          <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">Sensor Data Spikes</span>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-xl font-bold font-mono text-sky-400">{poisTripA.length}</span>
            <span className="text-xs text-white/20">vs</span>
            <span className="text-xl font-bold font-mono text-purple-400">{poisTripB.length}</span>
          </div>
          <div className="text-[9px] text-white/40 font-mono">Points of Interest detected</div>
        </div>
      </div>

      {/* Comparative Damage Progression Graph */}
      <div className="glass-card p-6 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="text-car-accent" size={18} />
            <div>
              <h4 className="text-sm font-bold text-white">Normalized Route Wear Progression</h4>
              <p className="text-[10px] text-white/40">Damage score trajectory from 0% (start) to 100% (finish)</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              <span className="text-white/60">Trip A</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
              <span className="text-white/60">Trip B</span>
            </div>
          </div>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparativeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="progressPct" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 10 }} />
              <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 10 }} domain={[0, 'auto']} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
                labelStyle={{ fontSize: '11px', color: '#94a3b8' }}
              />
              <Line 
                type="monotone" 
                dataKey="tripA" 
                name="Trip A Score" 
                stroke="#38bdf8" 
                strokeWidth={2.5} 
                dot={{ r: 3, fill: '#38bdf8' }} 
              />
              <Line 
                type="monotone" 
                dataKey="tripB" 
                name="Trip B Score" 
                stroke="#a855f7" 
                strokeWidth={2.5} 
                dot={{ r: 3, fill: '#a855f7' }} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Points of Interest: Sensor Data Spikes Section */}
      <div className="glass-card p-6 rounded-3xl space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="text-amber-400" size={18} />
              Points of Interest (Sensor Data Spikes)
            </h4>
            <p className="text-xs text-white/50 mt-0.5">
              Anomalies flagged from high G-force deceleration, rapid lateral scrub, and chassis shock
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5 text-[10px] font-mono">
            <button
              onClick={() => setActivePoiFilter('all')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all",
                activePoiFilter === 'all' ? "bg-white/15 text-white font-bold" : "text-white/50 hover:text-white"
              )}
            >
              All ({allPois.length})
            </button>
            <button
              onClick={() => setActivePoiFilter('tripA')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-sky-400",
                activePoiFilter === 'tripA' ? "bg-sky-500/20 font-bold" : "opacity-60 hover:opacity-100"
              )}
            >
              Trip A ({poisTripA.length})
            </button>
            <button
              onClick={() => setActivePoiFilter('tripB')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-purple-400",
                activePoiFilter === 'tripB' ? "bg-purple-500/20 font-bold" : "opacity-60 hover:opacity-100"
              )}
            >
              Trip B ({poisTripB.length})
            </button>
            <button
              onClick={() => setActivePoiFilter('critical')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-rose-400",
                activePoiFilter === 'critical' ? "bg-rose-500/20 font-bold" : "opacity-60 hover:opacity-100"
              )}
            >
              Critical
            </button>
          </div>
        </div>

        {/* POI List */}
        {filteredPois.length === 0 ? (
          <div className="p-8 text-center text-xs text-white/40 italic rounded-2xl border border-white/5 bg-black/20">
            No sensor data spikes detected matching current filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredPois.map((poi) => (
              <div
                key={poi.id}
                onClick={() => setSelectedPoi(selectedPoi?.id === poi.id ? null : poi)}
                className={cn(
                  "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 text-left",
                  selectedPoi?.id === poi.id 
                    ? "bg-black/70 border-car-accent shadow-lg shadow-car-accent/10" 
                    : "bg-black/30 border-white/5 hover:border-white/20"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        poi.severity === 'critical' ? "bg-rose-500 animate-pulse" : poi.severity === 'warning' ? "bg-amber-400" : "bg-sky-400"
                      )} />
                      <span className="text-xs font-bold text-white font-mono">{poi.title}</span>
                    </div>
                    <span 
                      className="text-[9px] font-mono px-2 py-0.5 rounded-md border"
                      style={{ color: poi.tripColor, borderColor: `${poi.tripColor}40`, backgroundColor: `${poi.tripColor}15` }}
                    >
                      {poi.tripName}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-white/50">
                    <span>{poi.timeOffsetFormatted}</span>
                    <span>·</span>
                    <span className="text-white/80 font-bold">{poi.value}</span>
                    <span>·</span>
                    <span className="text-white/40">{poi.metricType}</span>
                  </div>

                  <p className="text-xs text-white/70 mt-2 leading-relaxed">
                    {poi.diagnosticAdvice}
                  </p>
                </div>

                {poi.location && (
                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[9px] font-mono text-white/40">
                    <span className="flex items-center gap-1">
                      <MapPin size={10} className="text-car-accent" />
                      {poi.location.lat.toFixed(4)}, {poi.location.lng.toFixed(4)}
                    </span>
                    <span className="text-car-accent">Click to inspect POI</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Selected POI Details Modal / Expansion */}
        {selectedPoi && selectedPoi.location && (
          <div className="p-4 rounded-2xl bg-car-accent/10 border border-car-accent/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5 font-mono">
                <MapPin size={14} className="text-car-accent" />
                Spike POI Inspection: {selectedPoi.title} ({selectedPoi.tripName})
              </span>
              <button 
                onClick={() => setSelectedPoi(null)}
                className="text-white/40 hover:text-white text-xs font-mono cursor-pointer"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-white/80 leading-relaxed">
              Recorded at coordinate ({selectedPoi.location.lat.toFixed(5)}, {selectedPoi.location.lng.toFixed(5)}) at time offset {selectedPoi.timeOffsetFormatted}. {selectedPoi.diagnosticAdvice}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TripComparisonView;
