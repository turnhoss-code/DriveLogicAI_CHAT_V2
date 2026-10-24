import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, 
  Navigation, 
  X, 
  Maximize2, 
  Minimize2, 
  Gauge, 
  Activity, 
  Crosshair, 
  Square, 
  AlertTriangle, 
  Radio, 
  Key,
  Flame,
  Clock,
  Flag,
  ChevronDown,
  Edit2,
  Check,
  Zap,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { Trip, OBDData, NavigationState } from '../types';
import { cn } from '../lib/utils';
import { parseLocationToCoords, calculateDistanceMeters, generateCurvedPath, calculateRoute, DEFAULT_NY_LOCATION, LatLngPoint } from '../lib/routeService';

interface ActiveTripMapOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  isRecording: boolean;
  currentTrip: Partial<Trip> | null;
  obdData: OBDData;
  isLoaded: boolean;
  loadError?: Error;
  authError?: string | null;
  mapsApiKey: string;
  onStopTrip?: () => void;
  onOpenSettings?: () => void;
  navigation?: NavigationState;
  onUpdateNavigation?: (nav: NavigationState) => void;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#1a1d24" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1d24" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a9ba8" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#00F0FF" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#607274" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#1e2922" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2d3748" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a202c" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a0aec0" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3b4252" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2e3440" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f172a" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#334155" }],
  },
];

export const ActiveTripMapOverlay: React.FC<ActiveTripMapOverlayProps> = ({
  isOpen,
  onClose,
  isRecording,
  currentTrip,
  obdData,
  isLoaded,
  loadError,
  authError,
  mapsApiKey,
  onStopTrip,
  onOpenSettings,
  navigation,
  onUpdateNavigation,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Dynamic destination handling (defaults to navigation.to or JFK Airport, NY)
  const defaultDest = navigation?.to || 'JFK Airport, NY';
  const [selectedDestination, setSelectedDestination] = useState<string>(defaultDest);
  const [customDestInput, setCustomDestInput] = useState<string>(defaultDest);
  const [isEditingDest, setIsEditingDest] = useState(false);

  // Keep destination in sync if navigation prop changes
  useEffect(() => {
    if (navigation?.to) {
      setSelectedDestination(navigation.to);
      setCustomDestInput(navigation.to);
    }
  }, [navigation?.to]);

  const waypoints = currentTrip?.waypoints || [];
  const currentPos = waypoints.length > 0 
    ? { lat: waypoints[waypoints.length - 1].lat, lng: waypoints[waypoints.length - 1].lng }
    : DEFAULT_NY_LOCATION; // NY State default fallback

  const startPos = waypoints.length > 0
    ? { lat: waypoints[0].lat, lng: waypoints[0].lng }
    : null;

  // Resolve destination coordinates based on selected destination
  const destinationCoords = useMemo<LatLngPoint>(() => {
    return parseLocationToCoords(selectedDestination, currentPos);
  }, [selectedDestination, currentPos.lat, currentPos.lng]);

  // Compute realistic road curved path ahead to destination
  const fallbackCurvedPath = useMemo(() => {
    return generateCurvedPath([currentPos, destinationCoords], 20);
  }, [currentPos.lat, currentPos.lng, destinationCoords.lat, destinationCoords.lng]);

  // Real-time calculated driving route path
  const [calculatedDrivingPath, setCalculatedDrivingPath] = useState<LatLngPoint[]>([]);

  useEffect(() => {
    let isCancelled = false;
    calculateRoute({
      origin: currentPos,
      destination: destinationCoords
    }, currentPos).then((res) => {
      if (!isCancelled && res.success && res.path && res.path.length > 0) {
        setCalculatedDrivingPath(res.path);
      }
    }).catch((err) => {
      console.warn("ActiveTripMapOverlay route calculation notice:", err);
    });

    return () => {
      isCancelled = true;
    };
  }, [currentPos.lat, currentPos.lng, destinationCoords.lat, destinationCoords.lng]);

  const remainingRouteAheadPath = calculatedDrivingPath.length > 0 ? calculatedDrivingPath : fallbackCurvedPath;

  // Calculate remaining distance in miles (using geodesic distance with a 1.25x road grid winding factor)
  const remainingDistanceMiles = useMemo(() => {
    const rawMeters = calculateDistanceMeters(currentPos, destinationCoords);
    const roadMiles = (rawMeters * 1.25) / 1609.34;
    return Math.max(0.1, Number(roadMiles.toFixed(2)));
  }, [currentPos.lat, currentPos.lng, destinationCoords.lat, destinationCoords.lng]);

  // Current vehicle speed in MPH
  const rawSpeedKmh = obdData.speed || 0;
  const speedMph = Math.round(rawSpeedKmh * 0.621371);

  // Effective speed for ETA: when stationary (< 3 mph), use trip avgSpeed or standard 28 mph baseline
  const isStoppedOrIdling = speedMph < 3;
  const effectiveSpeedMph = isStoppedOrIdling
    ? Math.max(15, Math.round((currentTrip?.avgSpeed || 0) * 0.621371) || 28)
    : speedMph;

  // Dynamic duration calculation: Duration (hours) = Remaining Distance (miles) / Speed (mph)
  const durationHours = remainingDistanceMiles / effectiveSpeedMph;
  const durationSeconds = Math.round(durationHours * 3600);
  const durationMinutes = Math.round(durationSeconds / 60);

  // Clock time update every second for live arrival timestamp
  const [currentClockTime, setCurrentClockTime] = useState(Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setCurrentClockTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const etaDate = new Date(currentClockTime + durationSeconds * 1000);
  const etaClockTime = etaDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const etaDurationText = useMemo(() => {
    if (remainingDistanceMiles <= 0.1) return 'Arrived';
    if (durationMinutes < 1) return '< 1 min';
    if (durationMinutes < 60) return `${durationMinutes} min`;
    const hrs = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    return `${hrs}h ${mins}m`;
  }, [remainingDistanceMiles, durationMinutes]);

  // Calculate elapsed timer
  useEffect(() => {
    if (!isOpen || !isRecording) {
      setElapsedSeconds(0);
      return;
    }

    const start = currentTrip?.startTime || Date.now();
    const updateElapsed = () => {
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - start) / 1000)));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isRecording, currentTrip?.startTime]);

  // Auto-pan to vehicle if followVehicle is enabled
  useEffect(() => {
    if (map && followVehicle && waypoints.length > 0) {
      const latest = waypoints[waypoints.length - 1];
      map.panTo({ lat: latest.lat, lng: latest.lng });
    }
  }, [map, followVehicle, waypoints.length]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const distanceMiles = (currentTrip?.distance || 0).toFixed(2);
  const peakG = (currentTrip?.maxGForce || 1.0).toFixed(2);
  const eventsCount = currentTrip?.events?.length || 0;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        id="active-trip-map-overlay-root"
        className={cn(
          "fixed z-[65] transition-all duration-300",
          isExpanded 
            ? "inset-2 sm:inset-6 flex flex-col" 
            : "bottom-4 right-4 sm:bottom-6 sm:right-6 w-[92vw] sm:w-[440px] h-[520px] max-h-[85vh]"
        )}
      >
        <motion.div
          id="active-trip-map-card"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full h-full glass-card rounded-3xl border border-car-accent/40 shadow-2xl flex flex-col overflow-hidden bg-[#0c0d12]/95 backdrop-blur-xl relative"
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 bg-car-card/90 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-car-danger/20 border border-car-danger/40 text-car-danger">
                <span className="w-2 h-2 rounded-full bg-car-danger animate-ping shrink-0" />
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase">
                  {isRecording ? 'LIVE TRIP ROUTE' : 'MAP VIEW'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-white/70 font-mono text-xs">
                <Clock size={12} className="text-car-accent" />
                <span>{formatTimer(elapsedSeconds)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                id="btn-toggle-follow-vehicle"
                type="button"
                onClick={() => {
                  setFollowVehicle(prev => !prev);
                  if (!followVehicle && map && waypoints.length > 0) {
                    const latest = waypoints[waypoints.length - 1];
                    map.panTo({ lat: latest.lat, lng: latest.lng });
                    map.setZoom(16);
                  }
                }}
                className={cn(
                  "p-1.5 rounded-xl border text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer",
                  followVehicle 
                    ? "bg-car-accent/20 border-car-accent/40 text-car-accent" 
                    : "bg-white/5 border-white/10 text-white/40 hover:text-white"
                )}
                title={followVehicle ? "Following vehicle" : "Follow vehicle disabled"}
              >
                <Crosshair size={13} className={cn(followVehicle && "animate-spin-slow")} />
                <span className="hidden sm:inline">{followVehicle ? 'Recenter ON' : 'Follow'}</span>
              </button>

              <button
                id="btn-toggle-expand-map"
                type="button"
                onClick={() => setIsExpanded(prev => !prev)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
                title={isExpanded ? "Restore compact view" : "Expand to fullscreen"}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>

              <button
                id="btn-close-trip-map-overlay"
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-car-danger/20 border border-white/10 hover:border-car-danger/40 text-white/60 hover:text-car-danger transition-colors cursor-pointer"
                title="Close overlay"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Quick HUD Telematics Strip with Dynamic ETA */}
          <div className="px-3 py-2 bg-black/40 border-b border-white/5 grid grid-cols-5 gap-1.5 sm:gap-2 text-center shrink-0 font-mono">
            <div className="bg-white/[0.02] p-1.5 rounded-xl border border-white/5">
              <span className="text-[7.5px] uppercase tracking-widest text-white/40 block">SPEED</span>
              <span className="text-xs font-bold text-car-accent">{speedMph} <span className="text-[8px] font-normal text-white/50">MPH</span></span>
            </div>
            <div className="bg-white/[0.02] p-1.5 rounded-xl border border-white/5">
              <span className="text-[7.5px] uppercase tracking-widest text-white/40 block">REM DIST</span>
              <span className="text-xs font-bold text-white">{remainingDistanceMiles.toFixed(1)} <span className="text-[8px] font-normal text-white/50">MI</span></span>
            </div>
            <div className="bg-car-accent/10 p-1.5 rounded-xl border border-car-accent/30 text-car-accent">
              <span className="text-[7.5px] uppercase tracking-widest text-car-accent/80 block font-bold">DYNAMIC ETA</span>
              <span className="text-xs font-bold text-white block">{etaClockTime}</span>
              <span className="text-[8px] text-car-accent/70 block leading-tight">{etaDurationText}</span>
            </div>
            <div className="bg-white/[0.02] p-1.5 rounded-xl border border-white/5">
              <span className="text-[7.5px] uppercase tracking-widest text-white/40 block">DISTANCE</span>
              <span className="text-xs font-bold text-white">{distanceMiles} <span className="text-[8px] font-normal text-white/50">MI</span></span>
            </div>
            <div className="bg-white/[0.02] p-1.5 rounded-xl border border-white/5">
              <span className="text-[7.5px] uppercase tracking-widest text-white/40 block">MAX G</span>
              <span className="text-xs font-bold text-car-warning">{peakG}G</span>
            </div>
          </div>

          {/* Real-time Google Map Container */}
          <div className="flex-1 relative bg-[#151619] overflow-hidden min-h-[220px]">
            {authError || loadError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-car-darker/90 z-20">
                <AlertTriangle className="text-car-danger mb-2" size={28} />
                <p className="text-xs font-bold text-white mb-1">Google Maps Initialization Error</p>
                <p className="text-[10px] text-white/60 mb-3 max-w-xs leading-relaxed">
                  {authError || loadError?.message || "Google Maps billing or authentication error detected."}
                </p>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="px-3.5 py-1.5 bg-car-accent text-black font-bold rounded-xl text-xs transition-transform active:scale-95 cursor-pointer"
                  >
                    Open Settings
                  </button>
                )}
              </div>
            ) : !mapsApiKey ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-car-darker/90 z-20">
                <Key className="text-car-warning mb-2" size={28} />
                <p className="text-xs font-bold text-white mb-1">Maps API Key Required</p>
                <p className="text-[10px] text-white/40 mb-3 max-w-xs">
                  Please configure an active Google Maps Platform API key in Settings.
                </p>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="px-3.5 py-1.5 bg-car-accent text-black font-bold rounded-xl text-xs transition-transform active:scale-95 cursor-pointer"
                  >
                    Configure in Settings
                  </button>
                )}
              </div>
            ) : !isLoaded ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-car-darker/90 z-20">
                <Radio className="text-car-accent animate-pulse mb-2" size={28} />
                <p className="text-xs font-bold text-white mb-1">Loading Google Maps...</p>
                <p className="text-[10px] text-white/40">Initializing real-time GPS positioning</p>
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={currentPos}
                zoom={16}
                onLoad={(mapInstance) => setMap(mapInstance)}
                onUnmount={() => setMap(null)}
                onDragStart={() => setFollowVehicle(false)}
                options={{
                  styles: darkMapStyles,
                  disableDefaultUI: true,
                  zoomControl: true,
                }}
              >
                {/* Start Marker */}
                {startPos && (
                  <Marker
                    position={startPos}
                    title="Trip Start"
                    icon={{
                      path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                      scale: 7,
                      fillColor: "#10B981", // emerald
                      fillOpacity: 1,
                      strokeColor: "#FFFFFF",
                      strokeWeight: 2,
                    }}
                  />
                )}

                {/* Real-time Traveled Path Polyline */}
                {waypoints.length > 1 && (
                  <Polyline
                    path={waypoints
                      .map(w => ({ lat: Number(w.lat), lng: Number(w.lng) }))
                      .filter(w => !isNaN(w.lat) && !isNaN(w.lng))}
                    options={{
                      strokeColor: '#00F0FF', // glowing car accent
                      strokeOpacity: 0.95,
                      strokeWeight: 5,
                      geodesic: true,
                    }}
                  />
                )}

                {/* Current Vehicle Position Marker */}
                {currentPos && (
                  <Marker
                    position={currentPos}
                    title="Current Vehicle Location"
                    icon={{
                      path: (window.google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW ?? 1),
                      scale: 7,
                      fillColor: "#00F0FF",
                      fillOpacity: 1,
                      strokeColor: "#FFFFFF",
                      strokeWeight: 2,
                      rotation: 0,
                    }}
                  />
                )}

                {/* Destination Marker */}
                {destinationCoords && (
                  <Marker
                    position={destinationCoords}
                    title={`Destination: ${selectedDestination}`}
                    icon={{
                      path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                      scale: 8,
                      fillColor: "#F59E0B", // amber destination pin
                      fillOpacity: 1,
                      strokeColor: "#FFFFFF",
                      strokeWeight: 2,
                    }}
                  />
                )}

                {/* Remaining Route Ahead Polyline to Destination */}
                {currentPos && destinationCoords && remainingRouteAheadPath.length > 0 && (
                  <Polyline
                    path={remainingRouteAheadPath
                      .map(w => ({ lat: Number(w.lat), lng: Number(w.lng) }))
                      .filter(w => !isNaN(w.lat) && !isNaN(w.lng))}
                    options={{
                      strokeColor: '#818CF8', // indigo route ahead
                      strokeOpacity: 0.85,
                      strokeWeight: 4,
                      geodesic: true,
                    }}
                  />
                )}

                {/* Harsh Event Markers */}
                {currentTrip?.events?.map((evt, idx) => evt.location ? (
                  <Marker
                    key={`overlay-evt-${idx}`}
                    position={evt.location}
                    title={`Event: ${evt.type}`}
                    icon={{
                      path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                      scale: 6,
                      fillColor: "#EF4444",
                      fillOpacity: 1,
                      strokeColor: "#FFFFFF",
                      strokeWeight: 1.5,
                    }}
                  />
                ) : null)}
              </GoogleMap>
            )}

            {/* Live GPS Status Pill */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-full border border-white/10 text-[9px] font-mono text-white/80 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-car-success animate-pulse" />
              <span>{waypoints.length > 0 ? 'GPS CONNECTED' : 'AWAITING COORDS'}</span>
            </div>

            {/* Event Alert Pill if recent harsh event */}
            {eventsCount > 0 && (
              <div className="absolute top-11 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-car-danger/80 backdrop-blur-md rounded-full border border-car-danger text-[9px] font-mono text-white shadow-lg pointer-events-none">
                <Flame size={11} className="text-white" />
                <span>{eventsCount} HARSH {eventsCount === 1 ? 'EVENT' : 'EVENTS'}</span>
              </div>
            )}

            {/* Small Persistent Real-time Speed Overlay Widget (Top-Right Corner) */}
            <div 
              id="active-trip-speed-overlay-widget"
              data-testid="speed-overlay-widget"
              className="absolute top-3 right-3 z-30 bg-black/90 backdrop-blur-md rounded-2xl border border-car-accent/60 px-3 py-1.5 shadow-2xl font-mono flex items-center gap-2.5 select-none pointer-events-auto"
            >
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-car-accent tracking-tighter leading-none">
                    {speedMph}
                  </span>
                  <span className="text-[10px] font-bold text-white/70 tracking-wider">MPH</span>
                </div>
                <div className="text-[8px] text-white/50 tracking-wider font-semibold">
                  {Math.round(rawSpeedKmh)} KM/H
                </div>
              </div>

              <div className="h-7 w-[1px] bg-white/15" />

              <div className="flex flex-col gap-0.5 min-w-[56px]">
                <div className="flex items-center gap-1">
                  <Gauge size={11} className={speedMph > 75 ? "text-car-danger animate-pulse" : speedMph > 0 ? "text-car-accent" : "text-white/40"} />
                  <span className={cn(
                    "text-[8px] font-bold uppercase tracking-wider",
                    speedMph > 75 ? "text-car-danger" : speedMph > 0 ? "text-car-accent" : "text-white/40"
                  )}>
                    {speedMph > 75 ? 'HIGH SPEED' : speedMph > 0 ? 'CRUISING' : 'IDLING'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[8px] text-white/60">
                  <Activity size={10} className="text-car-success" />
                  <span>{obdData.rpm || 0} RPM</span>
                </div>
              </div>
            </div>

            {/* Dynamic ETA Floating HUD Card (Positioned directly beneath speed widget) */}
            <div 
              id="dynamic-eta-floating-card"
              className="absolute top-[74px] right-3 z-20 w-[220px] sm:w-[250px] bg-black/85 backdrop-blur-md rounded-2xl border border-car-accent/35 p-2.5 shadow-2xl font-mono"
            >
              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-white/10">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-car-accent animate-ping" />
                  <span className="text-[9px] font-bold tracking-widest text-car-accent uppercase">DYNAMIC ETA</span>
                </div>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-[8px] text-white/80">
                  <Zap size={9} className="text-car-accent" />
                  <span>{speedMph > 0 ? `${speedMph} MPH` : `0 MPH (idling)`}</span>
                </div>
              </div>

              {/* Main ETA readout */}
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-none">
                    {etaClockTime}
                  </div>
                  <div className="text-[10px] text-car-accent font-semibold flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    <span>{etaDurationText} duration</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs sm:text-sm font-bold text-white block font-mono">
                    {remainingDistanceMiles.toFixed(1)} <span className="text-[9px] font-normal text-white/50">MI</span>
                  </span>
                  <span className="text-[7.5px] uppercase tracking-widest text-white/40 block">REMAINING</span>
                </div>
              </div>

              {/* Dynamic Calculation Subtext */}
              <div className="mt-1.5 pt-1.5 border-t border-white/5 flex items-center justify-between text-[8px] text-white/60">
                <div className="flex items-center gap-1 truncate max-w-[140px]">
                  <Flag size={9} className="text-amber-400 shrink-0" />
                  <span className="truncate text-white/80 font-medium" title={selectedDestination}>{selectedDestination}</span>
                </div>
                <button
                  id="btn-edit-eta-dest"
                  type="button"
                  onClick={() => setIsEditingDest(prev => !prev)}
                  className="text-car-accent hover:underline flex items-center gap-0.5 cursor-pointer text-[8px]"
                >
                  <Edit2 size={8} />
                  <span>{isEditingDest ? 'Close' : 'Change'}</span>
                </button>
              </div>

              {/* Dynamic Calculation Speed Notice */}
              <div className="mt-1 text-[7.5px] leading-tight">
                {speedMph >= 3 ? (
                  <span className="text-car-success/90">⚡ Scaled live to {speedMph} MPH speed</span>
                ) : (
                  <span className="text-car-warning/90">⚡ Stopped • calculated @ {effectiveSpeedMph} MPH avg</span>
                )}
              </div>

              {/* Destination Editor & Quick Presets */}
              {isEditingDest && (
                <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
                  <div className="flex gap-1">
                    <input
                      id="input-eta-custom-destination"
                      type="text"
                      value={customDestInput}
                      onChange={(e) => setCustomDestInput(e.target.value)}
                      placeholder="Enter destination..."
                      className="flex-1 bg-black/60 border border-white/20 rounded-lg px-2 py-1 text-[9px] text-white focus:outline-none focus:border-car-accent"
                    />
                    <button
                      id="btn-apply-eta-custom-dest"
                      type="button"
                      onClick={() => {
                        if (customDestInput.trim()) {
                          setSelectedDestination(customDestInput.trim());
                          if (onUpdateNavigation && navigation) {
                            onUpdateNavigation({ ...navigation, to: customDestInput.trim() });
                          }
                        }
                        setIsEditingDest(false);
                      }}
                      className="px-2 py-1 bg-car-accent text-black rounded-lg text-[9px] font-bold cursor-pointer hover:bg-car-accent/80 transition-colors"
                    >
                      <Check size={11} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['JFK Airport', 'Manhattan, NYC', 'Albany, NY', 'Buffalo, NY'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setSelectedDestination(preset);
                          setCustomDestInput(preset);
                          if (onUpdateNavigation && navigation) {
                            onUpdateNavigation({ ...navigation, to: preset });
                          }
                          setIsEditingDest(false);
                        }}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[7.5px] transition-colors cursor-pointer",
                          selectedDestination === preset
                            ? "bg-car-accent text-black font-bold"
                            : "bg-white/10 hover:bg-car-accent/20 text-white/70"
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Dock / Action Bar */}
          <div className="p-3 bg-car-card/90 border-t border-white/10 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-xl bg-car-accent/15 border border-car-accent/30 flex items-center justify-center text-car-accent shrink-0">
                <Navigation size={14} />
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-bold text-white truncate font-mono">
                  {currentTrip?.id ? `TRIP #${currentTrip.id.toUpperCase()}` : 'ACTIVE TELEMETRY'}
                  <span className="ml-1.5 text-car-accent font-normal">• ETA {etaClockTime} ({etaDurationText})</span>
                </p>
                <p className="text-[9px] text-white/40 truncate font-mono">
                  {remainingDistanceMiles.toFixed(1)} mi remaining to {selectedDestination} ({waypoints.length} GPS pts logged)
                </p>
              </div>
            </div>

            {isRecording && onStopTrip && (
              <button
                id="btn-overlay-stop-trip"
                type="button"
                onClick={onStopTrip}
                className="px-3 py-1.5 bg-car-danger hover:bg-car-danger/80 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 shadow-lg shadow-car-danger/20 cursor-pointer shrink-0"
              >
                <Square size={11} fill="currentColor" />
                <span>Stop Trip</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
