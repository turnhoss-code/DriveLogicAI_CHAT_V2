import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Navigation, X, Minimize2, Key, AlertTriangle, CloudRain, Gauge } from 'lucide-react';
import { motion } from 'motion/react';
import { NavigationState, RoadHazard, TrafficHazardsResponse } from '../types';
import { cn } from '../lib/utils';
import { GoogleMap, Marker, Polyline, TrafficLayer, InfoWindow } from '@react-google-maps/api';
import { calculateRoute, RouteCalculationResult, DEFAULT_NY_LOCATION } from '../lib/routeService';
import { fetchLiveTrafficHazards, anchorHazardsToRoute, getHazardMarkerConfig } from '../services/hazardService';

interface FloatingMapProps {
  navigation: NavigationState;
  setNavigation: (nav: NavigationState) => void;
  mapsApiKey: string;
  isLoaded: boolean;
  loadError?: Error;
  authError?: string | null;
  onOpenSettings?: () => void;
  speed?: number;
  rpm?: number;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

export default function FloatingMap({
  navigation,
  setNavigation,
  mapsApiKey,
  isLoaded,
  loadError,
  authError,
  onOpenSettings,
  speed = 0,
  rpm = 0,
}: FloatingMapProps) {
  // Start minimized as a compact floating button so it never covers pre-existing cards unless opened or routing
  const [isMinimized, setIsMinimized] = useState(true);
  const [isMini, setIsMini] = useState(false);
  const [size, setSize] = useState({ width: 320, height: 370 });
  const [fromInput, setFromInput] = useState(navigation.from);
  const [toInput, setToInput] = useState(navigation.to);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [calculatedRoute, setCalculatedRoute] = useState<RouteCalculationResult | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [hazardData, setHazardData] = useState<TrafficHazardsResponse | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<RoadHazard | null>(null);

  const resizeRef = useRef<HTMLDivElement>(null);

  // Listen for DriveLogic voice commands to expand/collapse the Floating Map
  useEffect(() => {
    const onVoiceCommand = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (detail.name === 'setNavigation') {
        if (detail.args?.mapExpanded !== undefined) {
          setIsMinimized(!detail.args.mapExpanded);
        }
      } else if (detail.name === 'showHazards') {
        if (detail.args?.visible !== false) {
          setIsMinimized(false);
        }
      }
    };
    window.addEventListener('drivelogic:command', onVoiceCommand);
    return () => window.removeEventListener('drivelogic:command', onVoiceCommand);
  }, []);

  const handleResize = useCallback((e: MouseEvent | TouchEvent) => {
    if (!resizeRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const newWidth = Math.max(240, Math.min(380, window.innerWidth - clientX - 16));
    const newHeight = Math.max(220, Math.min(460, window.innerHeight - clientY - 96));
    
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

  useEffect(() => {
    let watchId: number;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(newPos);
          if (followUser && map) {
            map.panTo(newPos);
          }
        },
        (err) => {
          console.warn("Geolocation failed or denied, using NY State fallback coordinates:", err);
          const fallbackPos = DEFAULT_NY_LOCATION;
          setLocation(fallbackPos);
          if (followUser && map) {
            map.panTo(fallbackPos);
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
      );
    }
    return () => {
      if (watchId !== undefined && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [map, followUser]);

  // Auto-fetch Waze & Web Traffic Hazards + Weather when expanded
  useEffect(() => {
    if (isMinimized) return;
    let active = true;
    const targetLoc = navigation.to || navigation.from || 'Binghamton, NY';
    fetchLiveTrafficHazards({
      location: targetLoc,
      lat: location?.lat || DEFAULT_NY_LOCATION.lat,
      lng: location?.lng || DEFAULT_NY_LOCATION.lng,
    })
      .then((res) => {
        if (active) setHazardData(res);
      })
      .catch((err) => console.warn('FloatingMap hazard fetch notice:', err));
    return () => {
      active = false;
    };
  }, [isMinimized, navigation.to, navigation.from, location?.lat, location?.lng]);

  const inRouteHazards = useMemo(() => {
    return anchorHazardsToRoute(
      hazardData?.hazards || [],
      calculatedRoute?.path,
      location || DEFAULT_NY_LOCATION
    );
  }, [hazardData?.hazards, calculatedRoute?.path, location]);

  useEffect(() => {
    if (!isLoaded || !navigation.from || !navigation.to) {
      setCalculatedRoute(null);
      setEta(null);
      setDistance(null);
      setRouteError(null);
      return;
    }

    let isCancelled = false;

    const runCalculateRoute = async () => {
      try {
        const result = await calculateRoute(
          {
            origin: navigation.from || 'Current Location',
            destination: navigation.to,
            waypoints: navigation.waypoints
          },
          location
        );

        if (!isCancelled) {
          if (result.success && result.path.length > 0) {
            setCalculatedRoute(result);
            setEta(result.durationText);
            setDistance(result.distanceText);
            setRouteError(null);
          } else {
            setCalculatedRoute(null);
            setEta(null);
            setDistance(null);
            setRouteError("Unable to calculate route.");
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn("Floating map routing notice:", err);
          setCalculatedRoute(null);
          setEta(null);
          setDistance(null);
          setRouteError("Route calculation issue.");
        }
      }
    };

    runCalculateRoute();
    const intervalId = setInterval(runCalculateRoute, 120000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [isLoaded, navigation.from, navigation.to, navigation.waypoints, location]);

  useEffect(() => {
    if (navigation.to && navigation.isActive) {
      setIsMinimized(false);
    }
  }, [navigation.to, navigation.isActive]);

  const isExpanded = !isMinimized && !isMini;
  const dispatchAndCrimeCount = inRouteHazards.filter(h => h.type === 'dispatch_911' || h.type === 'crime_radar').length;
  const speedTrapCount = inRouteHazards.filter(h => h.type === 'speed_trap').length;
  const roadWorkCount = inRouteHazards.filter(h => h.type === 'roadwork').length;
  const emergencyCount = inRouteHazards.filter(h => h.type === 'emergency_vehicle' || h.type === 'accident' || h.type === 'prior_trip_damage').length;

  return (
    <motion.div
      ref={resizeRef}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        width: isMinimized ? 48 : (isMini ? 165 : size.width),
        height: isMinimized ? 48 : (isMini ? 150 : size.height),
      }}
      className={cn(
        "fixed bottom-20 right-4 z-40 glass-card rounded-3xl overflow-hidden border border-car-accent/30 shadow-2xl transition-all duration-300",
        isMinimized && "rounded-full bg-zinc-950/90"
      )}
    >
      {isMinimized ? (
        <button
          onClick={() => {
            setIsMinimized(false);
            setIsMini(false);
            if (!navigation.isActive) setNavigation({ ...navigation, isActive: true });
          }}
          title="Expand Live GPS Navigation & Waze Hazard Radar"
          className="w-full h-full flex items-center justify-center text-car-accent hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Navigation size={20} className="animate-pulse" />
        </button>
      ) : (
        <div className="flex flex-col h-full relative">
          {/* Resize Handle (Top-Left) */}
          {!isMini && (
            <div 
              onMouseDown={startResize}
              onTouchStart={startResize}
              className="absolute top-0 left-0 w-6 h-6 cursor-nw-resize z-[60] flex items-center justify-center group"
            >
              <div className="w-1.5 h-1.5 bg-white/20 rounded-full group-hover:bg-car-accent transition-colors" />
            </div>
          )}

          {/* Header */}
          <div className="p-2.5 bg-car-accent/10 flex items-center justify-between border-b border-white/5 shrink-0">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <Navigation size={13} className="text-car-accent shrink-0" />
              {!isMini && <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 truncate">911 • Crime Radar • Waze</span>}
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsMini(!isMini)} 
                className="p-1 hover:bg-white/10 rounded-lg text-white/50 hover:text-white cursor-pointer"
                title={isMini ? "Expand Map & Waze/Weather HUD" : "Mini View"}
              >
                <Minimize2 size={12} className={cn(isMini && "rotate-180")} />
              </button>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 hover:bg-white/10 rounded-lg text-white/50 hover:text-white cursor-pointer"
                title="Minimize to Floating Icon"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Inputs - Hidden in Mini Mode */}
          {!isMini && (
            <div className="px-2.5 py-2 space-y-1.5 bg-black/40 shrink-0 border-b border-white/5">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="relative">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-car-success" />
                  <input
                    type="text"
                    value={fromInput}
                    onChange={(e) => setFromInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setNavigation({ ...navigation, from: fromInput })}
                    placeholder="Origin..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-1 pl-6 pr-2 text-[9.5px] text-white placeholder:text-white/30 focus:outline-none focus:border-car-accent/50"
                  />
                </div>
                <div className="relative">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-car-danger" />
                  <input
                    type="text"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setNavigation({ ...navigation, to: toInput, isActive: true })}
                    placeholder="Destination..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-1 pl-6 pr-2 text-[9.5px] text-white placeholder:text-white/30 focus:outline-none focus:border-car-accent/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Map View */}
          <div className="flex-1 relative bg-[#151619] overflow-hidden">
            {/* Discreet Top HUD Strip (Weather + Speed/RPM) when Expanded */}
            {isExpanded && (
              <div className="absolute top-2 left-2 right-10 z-20 flex flex-wrap items-center gap-1.5 pointer-events-none">
                <div className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-white/10 flex items-center gap-1.5 text-[9px] font-mono text-white/90 shadow">
                  <Gauge size={10} className="text-car-success shrink-0" />
                  <span className="font-bold text-car-success">{speed} MPH</span>
                  <span className="text-white/30">•</span>
                  <span className="text-car-purple font-bold">{rpm} RPM</span>
                </div>
                {hazardData?.weather && (
                  <div className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-white/10 flex items-center gap-1 text-[9px] font-mono text-sky-300 shadow truncate max-w-[180px]">
                    <CloudRain size={10} className="text-sky-400 shrink-0" />
                    <span className="font-bold">{hazardData.weather.tempF}°F</span>
                    <span className="text-white/60 truncate">{hazardData.weather.condition}</span>
                  </div>
                )}
              </div>
            )}

            {routeError && (
              <div className="absolute top-10 left-2 right-10 bg-car-danger/90 backdrop-blur-sm border border-car-danger/50 p-1.5 rounded-lg text-white z-30 flex items-center gap-1.5 shadow-lg">
                <AlertTriangle className="shrink-0 text-white" size={11} />
                <span className="text-[9px] font-bold tracking-tight line-clamp-2">{routeError}</span>
              </div>
            )}

            {isLoaded && mapsApiKey ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={location || DEFAULT_NY_LOCATION}
                zoom={isMini ? 12 : 14}
                onLoad={(map) => setMap(map)}
                onUnmount={() => setMap(null)}
                onDragStart={() => setFollowUser(false)}
                options={{
                  styles: darkMapStyles,
                  disableDefaultUI: true,
                }}
                onClick={(e) => {
                  if (e.latLng) {
                    const lat = e.latLng.lat();
                    const lng = e.latLng.lng();
                    const coordStr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

                    if (!navigation.to) {
                      setToInput(coordStr);
                      setNavigation({ ...navigation, to: coordStr, waypoints: [] });
                    } else {
                      const currentWaypoints = navigation.waypoints || [];
                      setNavigation({ 
                        ...navigation, 
                        waypoints: [...currentWaypoints, { lat, lng }]
                      });
                    }
                  }
                }}
              >
                <TrafficLayer />
                {location && (
                  <Marker
                    position={location}
                    icon={{
                      path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                      scale: 7,
                      fillColor: "#4285F4",
                      fillOpacity: 1,
                      strokeWeight: 2,
                      strokeColor: "#FFFFFF"
                    }}
                  />
                )}
                {calculatedRoute && calculatedRoute.path.length > 0 && (
                  <>
                    <Polyline
                      path={calculatedRoute.path}
                      options={{
                        strokeColor: '#2ECC71',
                        strokeOpacity: 0.85,
                        strokeWeight: 5
                      }}
                    />
                    {calculatedRoute.endLocation && (
                      <Marker
                        position={calculatedRoute.endLocation}
                        icon={{
                          path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                          scale: 6,
                          fillColor: "#EF4444",
                          fillOpacity: 1,
                          strokeWeight: 2,
                          strokeColor: "#FFFFFF"
                        }}
                      />
                    )}
                  </>
                )}

                {/* Auto-Populated Waze & Web In-Route Icons (Speed Traps, Road Work, Emergency Sites, Weather) when Expanded */}
                {isExpanded && inRouteHazards.map((hazard) => {
                  const cfg = getHazardMarkerConfig(hazard.type);
                  return (
                    <Marker
                      key={hazard.id}
                      position={hazard.coordinates}
                      onClick={() => setSelectedHazard(hazard)}
                      icon={{
                        path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0),
                        scale: 10,
                        fillColor: cfg.color,
                        fillOpacity: 0.92,
                        strokeWeight: 1.5,
                        strokeColor: "#FFFFFF",
                      }}
                      label={{
                        text: cfg.label,
                        fontSize: "10px",
                      }}
                      title={`${cfg.badge}: ${hazard.title}`}
                    />
                  );
                })}

                {isExpanded && selectedHazard && (
                  <InfoWindow
                    position={selectedHazard.coordinates}
                    onCloseClick={() => setSelectedHazard(null)}
                  >
                    <div className="p-1 max-w-[185px] text-zinc-900">
                      <p className="text-[10px] font-bold uppercase text-zinc-950 leading-tight">
                        {selectedHazard.title}
                      </p>
                      <p className="text-[9px] font-semibold text-amber-700 mt-0.5">
                        {selectedHazard.location}
                      </p>
                      <p className="text-[9px] text-zinc-600 mt-0.5 leading-snug">
                        {selectedHazard.description}
                      </p>
                      <div className="flex items-center justify-between text-[8px] font-mono text-zinc-500 mt-1 pt-1 border-t border-zinc-200">
                        <span>{selectedHazard.source}</span>
                        <span>{selectedHazard.timestamp}</span>
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                {authError || loadError ? (
                  <div className="flex flex-col items-center gap-1.5 px-2">
                    <AlertTriangle className="text-car-danger" size={18} />
                    <span className="text-[10px] text-white/80 font-bold">Maps Error</span>
                    <span className="text-[8px] text-white/50 leading-tight">Key or billing issue</span>
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="mt-1 px-2 py-0.5 bg-car-accent/80 hover:bg-car-accent text-white text-[8px] font-bold rounded cursor-pointer transition-colors"
                      >
                        Settings
                      </button>
                    )}
                  </div>
                ) : !mapsApiKey ? (
                  <div className="flex flex-col items-center gap-1">
                    <Key className="text-car-warning" size={16} />
                    <span className="text-[8px] text-white/40">Key required</span>
                  </div>
                ) : (
                  <Navigation className="text-car-accent animate-pulse" size={16} />
                )}
              </div>
            )}

            {/* Discreet Bottom In-Route Hazard & ETA Strip when Expanded */}
            {isExpanded && (
              <div className="absolute bottom-2 left-2 right-2 z-20 px-2.5 py-1.5 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 flex items-center justify-between text-[8.5px] font-mono text-white/85 pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <span title="911 Calls & Crime Radar Alerts">🚨 {dispatchAndCrimeCount}</span>
                  <span title="Speed Traps in Route">👮 {speedTrapCount}</span>
                  <span title="Road Work in Route">🚧 {roadWorkCount}</span>
                  <span title="Emergency & Prior Trip Logs">🚑 {emergencyCount}</span>
                </div>
                {(eta || distance) ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white">{eta || '--'}</span>
                    <span className="text-white/30">•</span>
                    <span className="font-bold text-car-accent">{distance || '--'}</span>
                  </div>
                ) : (
                  <span className="text-white/50">911 • Crime • Waze</span>
                )}
              </div>
            )}

            {isMini && (eta || distance) && (
              <div className="absolute bottom-2 left-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-lg flex justify-between items-center">
                <span className="text-[8px] font-bold text-white">{eta}</span>
                <span className="text-[8px] font-bold text-car-accent">{distance}</span>
              </div>
            )}

            {/* Follow Me Button */}
            <button
              onClick={() => {
                setFollowUser(true);
                if (location && map) map.panTo(location);
              }}
              className={cn(
                "absolute top-2 right-2 p-1.5 rounded-lg border transition-all z-20 cursor-pointer",
                followUser 
                  ? "bg-car-accent text-white border-car-accent" 
                  : "bg-black/60 text-white/60 border-white/10 hover:bg-black/80"
              )}
              title="Follow Me"
            >
              <Navigation size={12} className={cn(followUser && "animate-pulse")} />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

