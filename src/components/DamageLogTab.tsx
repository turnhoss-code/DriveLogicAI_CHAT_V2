import React, { useState } from 'react';
import { Activity, History, AlertTriangle, ChevronRight, Clock, MapPin, ChevronDown, Download, Key, FileSpreadsheet, FileCode, Smartphone, Zap, PlusCircle, ShieldAlert } from 'lucide-react';
import { DamagePoint, Trip, SensorPoint } from '../types';
import { ResponsiveContainer, YAxis, XAxis, Tooltip, AreaChart, Area, ReferenceLine } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { GoogleMap, Polyline, Marker, InfoWindow } from '@react-google-maps/api';
import TripTimelineDetails from './TripTimelineDetails';
import { TripSummaryCard } from './TripSummaryCard';
import TripDamageVibrationTrendChart from './TripDamageVibrationTrendChart';
import { exportTripAsJSON, exportTripAsCSV } from '../lib/tripExporter';

interface DamageLogTabProps {
  score: number;
  history: DamagePoint[];
  sensorHistory: SensorPoint[];
  trips: Trip[];
  currentTrip?: Partial<Trip> | null;
  isRecording: boolean;
  mapsApiKey: string;
  isLoaded: boolean;
  loadError?: Error;
  authError?: string | null;
  onOpenSettings?: () => void;
  onUpdateTrip: (trip: Trip) => void;
  onLogDamagePoint?: (severity?: 'minor' | 'moderate' | 'severe', label?: string) => void;
  onRequestSensorPermission?: () => void;
  googleAccessToken?: string | null;
  onLinkDrive?: () => Promise<any> | void;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '0.75rem'
};

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
];

export default function DamageLogTab({ 
  score, 
  history, 
  sensorHistory, 
  trips, 
  currentTrip,
  isRecording, 
  mapsApiKey, 
  isLoaded, 
  loadError, 
  authError, 
  onOpenSettings, 
  onUpdateTrip,
  onLogDamagePoint,
  onRequestSensorPermission,
}: DamageLogTabProps) {
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [selectedPlotTripId, setSelectedPlotTripId] = useState<string>(() => trips[0]?.id || 'live');
  const [selectedEvent, setSelectedEvent] = useState<{
    type: string;
    timestamp: number;
    lat: number;
    lng: number;
    gForce?: number;
    vibrationRms?: number;
    speed?: number;
    severity?: string;
  } | null>(null);
  const [newMarkerPos, setNewMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [markerNote, setMarkerNote] = useState('');

  React.useEffect(() => {
    setSelectedEvent(null);
    setNewMarkerPos(null);
    setMarkerNote('');
  }, [expandedTripId, selectedPlotTripId]);

  const activePlotTrip: Trip | null = React.useMemo(() => {
    if (selectedPlotTripId === 'live' && isRecording && currentTrip) {
      return {
        id: currentTrip.id || 'live',
        startTime: currentTrip.startTime || Date.now(),
        waypoints: currentTrip.waypoints || [],
        events: currentTrip.events || [],
        damageHistory: currentTrip.damageHistory || history,
        averageDamageScore: score,
        distance: currentTrip.distance || 0,
      };
    }
    return trips.find(t => t.id === selectedPlotTripId) || trips[0] || null;
  }, [selectedPlotTripId, isRecording, currentTrip, trips, history, score]);

  const latestSensor = sensorHistory.length > 0 ? sensorHistory[sensorHistory.length - 1] : null;
  const currentAccelG = latestSensor ? latestSensor.accel : 0;
  const currentVibrationRms = latestSensor?.vibrationRms ?? Math.max(0, Math.abs(currentAccelG - 0.15) * 0.45);

  const handleAddMarker = (trip: Trip) => {
    if (!newMarkerPos || !markerNote.trim()) return;

    const updatedTrip: Trip = {
      ...trip,
      customMarkers: [
        ...(trip.customMarkers || []),
        { ...newMarkerPos, note: markerNote, timestamp: Date.now() }
      ]
    };

    onUpdateTrip(updatedTrip);
    setNewMarkerPos(null);
    setMarkerNote('');
  };

  const handleDeleteMarker = (trip: Trip, timestamp: number) => {
    const updatedTrip: Trip = {
      ...trip,
      customMarkers: (trip.customMarkers || []).filter(m => m.timestamp !== timestamp)
    };
    onUpdateTrip(updatedTrip);
  };

  const handleExportJSON = (trip: Trip, e: React.MouseEvent) => {
    e.stopPropagation();
    exportTripAsJSON(trip);
  };

  const handleExportCSV = (trip: Trip, e: React.MouseEvent) => {
    e.stopPropagation();
    exportTripAsCSV(trip);
  };

  const exportAllTrips = () => {
    const dataStr = JSON.stringify(trips, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `all_trips.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const exportFullReport = () => {
    const data = {
      timestamp: Date.now(),
      currentScore: score,
      liveHistory: history,
      liveSensorHistory: sensorHistory,
      trips: trips
    };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ztcd_full_report_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getScoreDetails = (s: number) => {
    if (s < 20) return { color: 'text-car-success', stroke: '#10b981', label: 'EXCELLENT', bg: 'bg-car-success/10', border: 'border-car-success/20' };
    if (s < 50) return { color: 'text-car-warning', stroke: '#f59e0b', label: 'FAIR', bg: 'bg-car-warning/10', border: 'border-car-warning/20' };
    return { color: 'text-car-danger', stroke: '#ef4444', label: 'POOR', bg: 'bg-car-danger/10', border: 'border-car-danger/20' };
  };

  const renderRoute = (trip: Trip) => {
    const { waypoints, events, damageHistory = [] } = trip;
    const geoDamagePoints = damageHistory.filter(dp => typeof dp.lat === 'number' && typeof dp.lng === 'number');

    if (waypoints.length < 2 && geoDamagePoints.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/30 p-4 text-center">
          <MapPin size={24} className="mb-1 text-car-accent/60" />
          <span className="text-[10px] uppercase font-mono">Waiting for GPS route & accelerometer damage points...</span>
        </div>
      );
    }

    if (authError || loadError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <AlertTriangle className="text-car-danger" size={20} />
          <span className="text-[10px] text-white/80 font-bold mt-1">Maps Error</span>
          <span className="text-[8px] text-white/50 max-w-xs">{authError || loadError?.message || "Google Maps billing or authentication error detected."}</span>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-1.5 px-2 py-0.5 bg-car-accent/80 hover:bg-car-accent text-white text-[9px] font-bold rounded transition-colors cursor-pointer"
            >
              Update in Settings
            </button>
          )}
        </div>
      );
    }

    if (!isLoaded || !mapsApiKey) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/30 text-center px-4">
          <Key size={20} />
          <span className="text-[9px] uppercase mt-1 font-mono">Maps API Key Required</span>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-1.5 text-[9px] text-car-accent underline cursor-pointer"
            >
              Configure in Settings
            </button>
          )}
        </div>
      );
    }

    const path = waypoints.length >= 2
      ? waypoints.map(w => ({ lat: w.lat, lng: w.lng }))
      : geoDamagePoints.map(dp => ({ lat: dp.lat!, lng: dp.lng! }));
    const startPoint = path[0];
    const endPoint = path[path.length - 1];

    const onLoadMap = (map: google.maps.Map) => {
      if (typeof window !== 'undefined' && window.google?.maps?.LatLngBounds && path.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        path.forEach(p => bounds.extend(p));
        geoDamagePoints.forEach(dp => bounds.extend({ lat: dp.lat!, lng: dp.lng! }));
        map.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
      }
    };

    return (
      <div className="relative w-full h-full rounded-xl overflow-hidden">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          options={{
            styles: darkMapStyles,
            disableDefaultUI: true,
            gestureHandling: 'cooperative',
          }}
          onLoad={onLoadMap}
          onClick={(e) => {
            if (e.latLng) {
              setNewMarkerPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            }
          }}
        >
          {path.length >= 2 && (
            <Polyline
              path={path}
              options={{
                strokeColor: "#3b82f6",
                strokeOpacity: 0.85,
                strokeWeight: 4,
              }}
            />
          )}
          {startPoint && (
            <Marker
              position={startPoint}
              icon={{
                path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                scale: 6,
                fillColor: "#10b981",
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#FFFFFF",
              }}
            />
          )}
          {endPoint && path.length > 1 && (
            <Marker
              position={endPoint}
              icon={{
                path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                scale: 6,
                fillColor: "#38bdf8",
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#FFFFFF",
              }}
            />
          )}

          {/* Accelerometer Vibration Damage Points Plotted on Route */}
          {geoDamagePoints.map((dp, idx) => {
            const severityColor =
              dp.severity === 'severe' || dp.score >= 50
                ? '#ef4444'
                : dp.severity === 'moderate' || dp.score >= 25
                ? '#f59e0b'
                : '#10b981';
            return (
              <Marker
                key={dp.id || `dp-${idx}`}
                position={{ lat: dp.lat!, lng: dp.lng! }}
                icon={{
                  path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                  scale: dp.severity === 'severe' ? 9 : dp.severity === 'moderate' ? 7.5 : 6,
                  fillColor: severityColor,
                  fillOpacity: 0.95,
                  strokeWeight: 2,
                  strokeColor: "#FFFFFF",
                }}
                onClick={() => {
                  setSelectedEvent({
                    type: dp.label || `Vibration Impact (${(dp.severity || 'moderate').toUpperCase()})`,
                    timestamp: dp.timestamp,
                    lat: dp.lat!,
                    lng: dp.lng!,
                    gForce: dp.gForce,
                    vibrationRms: dp.vibrationRms,
                    speed: dp.speed,
                    severity: dp.severity,
                  });
                }}
              />
            );
          })}

          {events.map((event, idx) => {
            if (!event.location) return null;
            return (
              <Marker
                key={`evt-${idx}`}
                position={{ lat: event.location.lat, lng: event.location.lng }}
                icon={{
                  path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                  scale: 7,
                  fillColor: event.type === 'harsh_braking' ? '#ef4444' : event.type === 'rapid_acceleration' ? '#f59e0b' : '#a855f7',
                  fillOpacity: 0.85,
                  strokeWeight: 1.5,
                  strokeColor: "#FFFFFF",
                }}
                onClick={() => {
                  setSelectedEvent({
                    type: event.type,
                    timestamp: event.timestamp,
                    lat: event.location!.lat,
                    lng: event.location!.lng
                  });
                }}
              />
            );
          })}

          {/* Custom Markers */}
          {trip.customMarkers?.map((marker, idx) => (
            <Marker
              key={`custom-${idx}`}
              position={{ lat: marker.lat, lng: marker.lng }}
              icon={{
                path: (window.google?.maps?.SymbolPath?.BACKWARD_CLOSED_ARROW ?? 3),
                scale: 5,
                fillColor: "#8b5cf6",
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#FFFFFF",
              }}
              onClick={() => {
                setSelectedEvent({
                  type: `Note: ${marker.note}`,
                  timestamp: marker.timestamp,
                  lat: marker.lat,
                  lng: marker.lng
                });
              }}
            />
          ))}

          {/* New Marker Placement */}
          {newMarkerPos && (
            <InfoWindow
              position={newMarkerPos}
              onCloseClick={() => setNewMarkerPos(null)}
            >
              <div className="p-2 min-w-[150px]">
                <p className="text-[10px] font-bold uppercase text-gray-500 mb-2">Add Note to Route</p>
                <textarea
                  autoFocus
                  value={markerNote}
                  onChange={(e) => setMarkerNote(e.target.value)}
                  placeholder="Enter note..."
                  className="w-full text-xs p-2 border rounded mb-2 text-black"
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setNewMarkerPos(null)}
                    className="text-[10px] uppercase font-bold text-gray-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAddMarker(trip)}
                    className="text-[10px] uppercase font-bold text-car-accent"
                  >
                    Save
                  </button>
                </div>
              </div>
            </InfoWindow>
          )}

          {selectedEvent && (
            <InfoWindow
              position={{ lat: selectedEvent.lat, lng: selectedEvent.lng }}
              onCloseClick={() => setSelectedEvent(null)}
              options={{
                pixelOffset: (typeof window !== 'undefined' && window.google?.maps?.Size ? new window.google.maps.Size(0, -10) : undefined),
              }}
            >
              <div className="p-1.5 text-black max-w-[210px] space-y-1">
                <p className="text-xs font-bold uppercase tracking-tight">
                  {selectedEvent.type.startsWith('Note:') ? 'Custom Note' : selectedEvent.type.replace(/_/g, ' ')}
                </p>
                {selectedEvent.type.startsWith('Note:') && (
                  <p className="text-[10px] leading-tight">{selectedEvent.type.substring(6)}</p>
                )}
                {(selectedEvent.gForce !== undefined || selectedEvent.vibrationRms !== undefined) && (
                  <div className="text-[10px] font-mono bg-gray-100 p-1.5 rounded space-y-0.5">
                    {selectedEvent.gForce !== undefined && (
                      <div>Peak Shock: <strong>{selectedEvent.gForce.toFixed(2)} G</strong></div>
                    )}
                    {selectedEvent.vibrationRms !== undefined && (
                      <div>Vibration RMS: <strong>{selectedEvent.vibrationRms.toFixed(2)} G</strong></div>
                    )}
                    {selectedEvent.speed !== undefined && (
                      <div>Vehicle Speed: <strong>{selectedEvent.speed} MPH</strong></div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center pt-1">
                  <p className="text-[9px] font-mono text-gray-500">
                    {new Date(selectedEvent.timestamp).toLocaleTimeString()}
                  </p>
                  {selectedEvent.type.startsWith('Note:') && (
                    <button
                      onClick={() => {
                        handleDeleteMarker(trip, selectedEvent.timestamp);
                        setSelectedEvent(null);
                      }}
                      className="text-[9px] text-red-500 font-bold uppercase"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    );
  };

  return (
    <div className="space-y-6 relative">
      <div className="absolute top-20 left-0 right-0 bottom-0 opacity-[0.03] pointer-events-none -z-10 mix-blend-lighten flex flex-col items-center">
        <img 
          src="https://www.rawhide.org/wp-content/uploads/2016/02/27-Dashboard-Symbols.jpg" 
          alt="Infographic backdrop" 
          className="w-full h-auto"
        />
        <p className="text-[10px] text-white/40 font-mono mt-4">Credit: rawhide.enfusendev.com</p>
      </div>

      <div className="flex items-center justify-between px-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Activity className="text-car-accent" size={24} />
          Damage & Vibration Plotter
        </h2>
        <button
          onClick={exportFullReport}
          className="flex items-center gap-2 px-3 py-1.5 bg-car-accent/10 hover:bg-car-accent/20 text-car-accent rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-car-accent/20 cursor-pointer"
        >
          <Download size={14} />
          Export Data
        </button>
      </div>

      {/* Live Damage Score & Real-Time Vibration Waveforms (Primary Gauge) */}
      <div className="glass-card p-6 rounded-3xl flex flex-col items-center gap-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(circle at center, ${getScoreDetails(score).stroke} 0%, transparent 70%)` }} />
        <div className="relative z-10">
          <svg className="w-40 h-40 transform -rotate-90 drop-shadow-2xl">
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={getScoreDetails(score).stroke} stopOpacity="0.5" />
                <stop offset="100%" stopColor={getScoreDetails(score).stroke} stopOpacity="1" />
              </linearGradient>
            </defs>
            <circle
              cx="80"
              cy="80"
              r="72"
              stroke="currentColor"
              strokeWidth="12"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="80"
              cy="80"
              r="72"
              stroke="url(#scoreGradient)"
              strokeWidth="12"
              fill="transparent"
              strokeDasharray={452}
              strokeDashoffset={452 - (452 * score) / 100}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-5xl font-bold font-mono tracking-tighter drop-shadow-md", getScoreDetails(score).color)}>
              {Math.round(score)}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-white/60 font-bold mt-1">
              {getScoreDetails(score).label}
            </span>
          </div>
        </div>
        
        <div className="w-full space-y-4 mt-2">
          {/* Accelerometer Chart */}
          <div className="space-y-1">
            <div className="flex justify-between items-center px-1">
              <span className="text-[8px] uppercase tracking-widest text-car-purple font-mono">Accelerometer Vibration (G)</span>
              <span className="text-[10px] font-mono text-white/40">
                {currentAccelG.toFixed(2)} G
              </span>
            </div>
            <div className="h-20 w-full bg-black/20 rounded-xl p-1 border border-white/5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sensorHistory}>
                  <defs>
                    <linearGradient id="colorAccel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <ReferenceLine y={1.2} stroke="#ef4444" strokeDasharray="3 3" />
                  <Area 
                    type="monotone" 
                    dataKey="accel" 
                    stroke="#A855F7" 
                    fillOpacity={1}
                    fill="url(#colorAccel)"
                    strokeWidth={2} 
                    isAnimationActive={false}
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <XAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f1012', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ padding: '0' }}
                    labelStyle={{ display: 'none' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gyroscope Chart */}
          <div className="space-y-1">
            <div className="flex justify-between items-center px-1">
              <span className="text-[8px] uppercase tracking-widest text-car-success font-mono">Gyroscope Chassis Roll (°/s)</span>
              <span className="text-[10px] font-mono text-white/40">
                {sensorHistory.length > 0 ? sensorHistory[sensorHistory.length - 1].gyro.toFixed(0) : '0'} °/s
              </span>
            </div>
            <div className="h-20 w-full bg-black/20 rounded-xl p-1 border border-white/5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sensorHistory}>
                  <defs>
                    <linearGradient id="colorGyro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="gyro" 
                    stroke="#22C55E" 
                    fillOpacity={1}
                    fill="url(#colorGyro)"
                    strokeWidth={2} 
                    isAnimationActive={false}
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <XAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f1012', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ padding: '0' }}
                    labelStyle={{ display: 'none' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* 10-Trip Damage Score & Average Vibration Trend Line Chart */}
      <TripDamageVibrationTrendChart trips={trips} />

      {/* Mobile Accelerometer Vibration Sensor & Damage Logger Card */}
      <div className="glass-card p-4 rounded-2xl border border-car-purple/25 bg-gradient-to-br from-car-purple/10 via-black/40 to-black/60 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-car-purple/15 text-car-purple border border-car-purple/30">
              <Smartphone size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Accelerometer Vibration Sensor
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ACTIVE
                </span>
              </div>
              <p className="text-[10px] text-white/50 font-mono mt-0.5">
                High-Pass Road Shock & Chassis Vibration Damage Logger
              </p>
            </div>
          </div>

          {onRequestSensorPermission && (
            <button
              onClick={onRequestSensorPermission}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-mono uppercase text-white/70 hover:text-white transition-colors cursor-pointer"
              title="Calibrate / Grant Mobile Motion Sensor Permission"
            >
              Calibrate IMU
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-white/40 font-mono block">Peak G-Force</span>
            <span className="text-base font-bold font-mono text-car-purple">
              {currentAccelG.toFixed(2)} G
            </span>
          </div>
          <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-white/40 font-mono block">Vibration RMS</span>
            <span className="text-base font-bold font-mono text-amber-400">
              {currentVibrationRms.toFixed(2)} G
            </span>
          </div>
          <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-white/40 font-mono block">Damage Points</span>
            <span className="text-base font-bold font-mono text-car-accent">
              {(activePlotTrip?.damageHistory || []).length} PTS
            </span>
          </div>
        </div>

        {onLogDamagePoint && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => onLogDamagePoint('moderate', 'Road Pothole / Suspension Jolt')}
              className="flex-1 py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <PlusCircle size={13} />
              Log Moderate Shock
            </button>
            <button
              onClick={() => onLogDamagePoint('severe', 'Severe Impact / Chassis Bottom-Out')}
              className="flex-1 py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <ShieldAlert size={13} />
              Log Severe Impact
            </button>
          </div>
        )}
      </div>

      {/* Interactive Trip Damage Plot Map & Vibration Timeline */}
      {activePlotTrip && (
        <div className="glass-card p-4 rounded-2xl border border-white/10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Zap size={14} className="text-amber-400" />
                Trip Vibration Damage Plotter
              </h3>
              <p className="text-[10px] text-white/40 font-mono">
                Geo-tagged accelerometer shock & vibration points saved for review
              </p>
            </div>
            <select
              value={selectedPlotTripId}
              onChange={(e) => setSelectedPlotTripId(e.target.value)}
              className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-car-accent"
            >
              {isRecording && <option value="live">Active Recording Trip</option>}
              {trips.map((t, i) => (
                <option key={t.id} value={t.id}>
                  Trip #{trips.length - i} • {new Date(t.startTime).toLocaleDateString()} ({t.damageHistory?.length || 0} pts)
                </option>
              ))}
            </select>
          </div>

          {/* Route Map with Plotted Damage Points */}
          <div className="h-56 w-full bg-black/40 rounded-xl border border-white/10 overflow-hidden">
            {renderRoute(activePlotTrip)}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between px-1 text-[9px] font-mono text-white/50">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Minor (&lt;1.0G)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Moderate (1.0–1.5G)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Severe (&gt;1.5G)
              </span>
            </div>
            <span>Tap map pin to inspect</span>
          </div>

          {/* Saved Damage Points List for Selected Trip */}
          {activePlotTrip.damageHistory && activePlotTrip.damageHistory.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-mono block">
                Logged Accelerometer Damage Points ({activePlotTrip.damageHistory.length})
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {activePlotTrip.damageHistory.map((dp, idx) => {
                  const sev = dp.severity || (dp.score >= 50 ? 'severe' : dp.score >= 25 ? 'moderate' : 'minor');
                  return (
                    <div
                      key={dp.id || idx}
                      onClick={() => {
                        if (typeof dp.lat === 'number' && typeof dp.lng === 'number') {
                          setSelectedEvent({
                            type: dp.label || `Vibration Impact (${sev.toUpperCase()})`,
                            timestamp: dp.timestamp,
                            lat: dp.lat,
                            lng: dp.lng,
                            gForce: dp.gForce,
                            vibrationRms: dp.vibrationRms,
                            speed: dp.speed,
                            severity: sev,
                          });
                        }
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/5 hover:border-white/15 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            "w-2.5 h-2.5 rounded-full shrink-0",
                            sev === 'severe' ? "bg-rose-500" : sev === 'moderate' ? "bg-amber-400" : "bg-emerald-400"
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white/90 truncate">
                            {dp.label || `Road Vibration Spike #${idx + 1}`}
                          </p>
                          <p className="text-[9px] font-mono text-white/40">
                            {new Date(dp.timestamp).toLocaleTimeString()}
                            {dp.speed !== undefined ? ` • ${dp.speed} MPH` : ''}
                            {typeof dp.lat === 'number' ? ` • ${dp.lat.toFixed(4)}, ${dp.lng?.toFixed(4)}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className="text-xs font-mono font-bold text-white block">
                          {(dp.gForce ?? (0.5 + dp.score / 40)).toFixed(2)} G
                        </span>
                        <span className="text-[9px] font-mono text-white/40">
                          RMS {(dp.vibrationRms ?? (0.15 + dp.score / 100)).toFixed(2)}G
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trip History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-bold flex items-center gap-2">
            <History size={18} className="text-car-accent" />
            Saved Trip Damage Logs
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/40 font-mono uppercase">{trips.length} Recorded</span>
            {trips.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={exportAllTrips}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] uppercase tracking-wider text-white/60 hover:text-white transition-all border border-white/5 hover:border-white/10 cursor-pointer"
                  title="Export all trips as JSON"
                >
                  <Download size={12} />
                  Export All
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {trips.length === 0 ? (
            <div className="glass-card p-8 rounded-2xl text-center">
              <p className="text-xs text-white/40 italic">No trips recorded yet. Start a trip to begin logging data.</p>
            </div>
          ) : (
            trips.map((trip) => {
              const details = getScoreDetails(trip.averageDamageScore);
              return (
              <motion.div
                key={trip.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => {
                  setExpandedTripId(expandedTripId === trip.id ? null : trip.id);
                  setSelectedPlotTripId(trip.id);
                }}
                className={cn(
                  "p-4 rounded-2xl flex flex-col group cursor-pointer transition-all duration-300 border backdrop-blur-md",
                  expandedTripId === trip.id ? `bg-black/60 ${details.border}` : `bg-black/40 border-white/5 hover:border-white/20`
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner",
                      details.bg, details.color
                    )}>
                      <Activity size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white/90">
                          {new Date(trip.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] text-white/40 font-mono bg-white/5 px-2 py-0.5 rounded-full">
                          {new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-white/60 font-mono">
                          <Clock size={12} className="text-car-accent" />
                          {Math.round(((trip.endTime || Date.now()) - trip.startTime) / 60000)} MIN
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-white/60 font-mono">
                          <MapPin size={12} className="text-car-cyan" />
                          {trip.distance.toFixed(1)} MI
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-white/60 font-mono">
                          <AlertTriangle size={12} className={(trip.damageHistory?.length || 0) > 0 ? "text-car-warning" : "text-white/20"} />
                          {trip.damageHistory?.length || 0} DMG PTS
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleExportCSV(trip, e)}
                      className="px-2 py-1.5 bg-white/5 hover:bg-emerald-500/20 text-white/50 hover:text-emerald-300 rounded-lg border border-white/10 hover:border-emerald-500/30 transition-colors text-[10px] font-mono flex items-center gap-1"
                      title="Export waypoints and events as CSV"
                    >
                      <FileSpreadsheet size={13} className="text-emerald-400" />
                      <span>CSV</span>
                    </button>
                    <button
                      onClick={(e) => handleExportJSON(trip, e)}
                      className="px-2 py-1.5 bg-white/5 hover:bg-sky-500/20 text-white/50 hover:text-sky-300 rounded-lg border border-white/10 hover:border-sky-500/30 transition-colors text-[10px] font-mono flex items-center gap-1"
                      title="Export full trip telemetry as JSON"
                    >
                      <FileCode size={13} className="text-sky-400" />
                      <span>JSON</span>
                    </button>
                    <div className="text-right flex flex-col items-end ml-1">
                      <div className={cn("text-lg font-bold font-mono leading-none", details.color)}>
                        {Math.round(trip.averageDamageScore)}
                      </div>
                      <div className="text-[8px] text-white/40 uppercase tracking-widest mt-1">Avg Score</div>
                    </div>
                    <div className={cn("p-1 rounded-full transition-colors", expandedTripId === trip.id ? "bg-white/10" : "")}>
                      {expandedTripId === trip.id ? (
                        <ChevronDown size={20} className="text-white" />
                      ) : (
                        <ChevronRight size={20} className="text-white/40 group-hover:text-white" />
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedTripId === trip.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
                        <TripSummaryCard trip={trip} />
                        <TripTimelineDetails
                          trip={trip}
                          mapsApiKey={mapsApiKey}
                          isLoaded={isLoaded}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
          )}
        </div>
      </div>
    </div>
  );
}

