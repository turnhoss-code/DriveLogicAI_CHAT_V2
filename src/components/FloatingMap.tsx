import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Navigation, X, Minimize2, Search, ArrowRight, Key, AlertCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NavigationState } from '../types';
import { cn } from '../lib/utils';
import { GoogleMap, Marker, Polyline, TrafficLayer } from '@react-google-maps/api';
import { calculateRoute, RouteCalculationResult, DEFAULT_NY_LOCATION } from '../lib/routeService';

interface FloatingMapProps {
  navigation: NavigationState;
  setNavigation: (nav: NavigationState) => void;
  mapsApiKey: string;
  isLoaded: boolean;
  loadError?: Error;
  authError?: string | null;
  onOpenSettings?: () => void;
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


export default function FloatingMap({ navigation, setNavigation, mapsApiKey, isLoaded, loadError, authError, onOpenSettings }: FloatingMapProps) {
  const [isMinimized, setIsMinimized] = useState(!navigation.isActive);
  const [isMini, setIsMini] = useState(true);
  const [size, setSize] = useState({ width: 280, height: 320 }); 
  const [fromInput, setFromInput] = useState(navigation.from);
  const [toInput, setToInput] = useState(navigation.to);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [calculatedRoute, setCalculatedRoute] = useState<RouteCalculationResult | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);

  const resizeRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback((e: MouseEvent | TouchEvent) => {
    if (!resizeRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const rect = resizeRef.current.getBoundingClientRect();
    const newWidth = Math.max(200, window.innerWidth - clientX - 16); // 16px margin
    const newHeight = Math.max(150, window.innerHeight - clientY - 96); // 96px bottom offset
    
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

  // Assume isLoaded is passed as a prop from App.tsx or we rely on a global context. For now, since App.tsx loads it, window.google.maps should be available if we give it a moment, but passing it is better. Wait, we need to add isLoaded prop.

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

    // Initial fetch
    runCalculateRoute();

    // Re-calculate route periodically (every 2 minutes)
    const intervalId = setInterval(runCalculateRoute, 120000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [isLoaded, navigation.from, navigation.to, navigation.waypoints, location]);

  const handleStart = () => {
    setNavigation({ ...navigation, from: fromInput, to: toInput });
  };

  useEffect(() => {
    if (navigation.isActive && isMinimized) {
      setIsMinimized(false);
    }
  }, [navigation.isActive]);

  return (
    <motion.div
      ref={resizeRef}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        width: isMinimized ? 64 : (isMini ? 160 : size.width),
        height: isMinimized ? 64 : (isMini ? 160 : size.height),
      }}
      className={cn(
        "fixed bottom-20 right-4 z-50 glass-card rounded-3xl overflow-hidden border border-car-accent/30 shadow-2xl transition-all duration-300",
        isMinimized && "rounded-full"
      )}
    >
      {isMinimized ? (
        <button
          onClick={() => {
            setIsMinimized(false);
            if (!navigation.isActive) setNavigation({ ...navigation, isActive: true });
          }}
          className="w-full h-full flex items-center justify-center text-car-accent hover:bg-white/5 transition-colors"
        >
          <Navigation size={24} className="animate-pulse" />
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
          <div className="p-3 bg-car-accent/10 flex items-center justify-between border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <Navigation size={14} className="text-car-accent shrink-0" />
              {!isMini && <span className="text-[10px] font-bold uppercase tracking-widest text-white/80 truncate">Live Navigation</span>}
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsMini(!isMini)} 
                className="p-1 hover:bg-white/10 rounded-lg text-white/40"
                title={isMini ? "Expand" : "Mini View"}
              >
                <Minimize2 size={12} className={cn(isMini && "rotate-180")} />
              </button>
              {!isMini && (
                <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
                  <div className="w-3 h-0.5 bg-current rounded-full" />
                </button>
              )}
              <button onClick={() => { setIsMinimized(true); setNavigation({ ...navigation, isActive: false }); }} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Inputs - Hidden in Mini Mode */}
          {!isMini && (
            <div className="p-3 space-y-2 bg-black/20 shrink-0">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-car-success" />
                <input
                  type="text"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setNavigation({ ...navigation, from: fromInput })}
                  placeholder="From..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 pl-8 pr-4 text-[10px] text-white placeholder:text-white/20 focus:outline-none focus:border-car-accent/50"
                />
              </div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-car-danger" />
                <input
                  type="text"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setNavigation({ ...navigation, to: toInput })}
                  placeholder="To..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 pl-8 pr-4 text-[10px] text-white placeholder:text-white/20 focus:outline-none focus:border-car-accent/50"
                />
              </div>
            </div>
          )}

          {/* Map View */}
          <div className="flex-1 relative bg-[#151619] overflow-hidden">
            {routeError && (
              <div className="absolute top-2 left-2 right-12 bg-car-danger/90 backdrop-blur-sm border border-car-danger/50 p-1.5 rounded-lg text-white z-30 flex items-center gap-1.5 shadow-lg">
                <AlertTriangle className="shrink-0 text-white" size={11} />
                <span className="text-[9px] font-bold tracking-tight line-clamp-2">{routeError}</span>
              </div>
            )}
            {isLoaded && mapsApiKey ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={location || DEFAULT_NY_LOCATION}
                zoom={isMini ? 13 : 15}
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
                {location && <Marker position={location} icon={{ path: (window.google?.maps?.SymbolPath?.CIRCLE ?? 0), scale: 8, fillColor: "#4285F4", fillOpacity: 1, strokeWeight: 2, strokeColor: "#FFFFFF" }} />}
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

            {(eta || distance) && !isMini && (
              <div className="absolute bottom-3 left-3 right-3 p-2 glass-card rounded-xl border border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[7px] uppercase tracking-widest text-white/40">ETA</p>
                  <p className="text-[10px] font-bold text-white">{eta || '--'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[7px] uppercase tracking-widest text-white/40">Dist</p>
                  <p className="text-[10px] font-bold text-car-accent">{distance || '--'}</p>
                </div>
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
                "absolute top-2 right-2 p-1.5 rounded-lg border transition-all z-20",
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
