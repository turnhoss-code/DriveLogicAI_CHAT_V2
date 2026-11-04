import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, Construction, Siren, CloudRain, RefreshCw, ExternalLink, Compass, Search, ChevronDown, ChevronUp, Radio, Car, Volume2, Activity, Shield } from 'lucide-react';
import { RoadHazard, RoadHazardType, TrafficHazardsResponse } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LiveHazardRadarProps {
  data: TrafficHazardsResponse | null;
  isLoading: boolean;
  onRefresh: (location?: string) => void;
  onSelectHazard?: (hazard: RoadHazard) => void;
  selectedHazardId?: string | null;
  className?: string;
}

export const LiveHazardRadar: React.FC<LiveHazardRadarProps> = ({
  data,
  isLoading,
  onRefresh,
  onSelectHazard,
  selectedHazardId,
  className
}) => {
  const [activeFilter, setActiveFilter] = useState<RoadHazardType | 'all'>('all');
  const [searchLocation, setSearchLocation] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const hazards = data?.hazards || [];
  const filteredHazards = hazards.filter(h => activeFilter === 'all' || h.type === activeFilter);

  const counts: Record<string, number> = {
    all: hazards.length,
    dispatch_911: hazards.filter(h => h.type === 'dispatch_911').length,
    crime_radar: hazards.filter(h => h.type === 'crime_radar').length,
    prior_trip_damage: hazards.filter(h => h.type === 'prior_trip_damage').length,
    speed_trap: hazards.filter(h => h.type === 'speed_trap').length,
    accident: hazards.filter(h => h.type === 'accident').length,
    roadwork: hazards.filter(h => h.type === 'roadwork').length,
    emergency_vehicle: hazards.filter(h => h.type === 'emergency_vehicle').length,
    weather_hazard: hazards.filter(h => h.type === 'weather_hazard').length,
  };

  const getHazardIcon = (type: RoadHazardType) => {
    switch (type) {
      case 'dispatch_911':
        return <Siren size={14} className="text-red-400 animate-pulse" />;
      case 'crime_radar':
        return <Shield size={14} className="text-pink-400" />;
      case 'prior_trip_damage':
        return <Activity size={14} className="text-purple-400" />;
      case 'speed_trap':
        return <ShieldAlert size={14} className="text-amber-400" />;
      case 'accident':
        return <AlertTriangle size={14} className="text-rose-400" />;
      case 'roadwork':
        return <Construction size={14} className="text-orange-400" />;
      case 'emergency_vehicle':
        return <Siren size={14} className="text-cyan-400 animate-pulse" />;
      case 'weather_hazard':
        return <CloudRain size={14} className="text-blue-400" />;
      default:
        return <Car size={14} className="text-white/60" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">Critical</span>;
      case 'high':
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 uppercase tracking-wider">High</span>;
      case 'moderate':
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">Moderate</span>;
      default:
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">Advisory</span>;
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLocation.trim()) {
      onRefresh(searchLocation.trim());
    }
  };

  const triggerVerbalBriefing = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('drivelogic:proactive-scan', {
          detail: {
            location: searchLocation || data?.location || 'Binghamton, NY',
            verbalAlert: data?.verbalAlert,
            sources: data?.sources,
          },
        })
      );
    }
  };

  const quickLocations = ["Binghamton, NY", "I-81 Corridor", "NY-17 / I-86", "Vestal Pkwy", "Johnson City, NY"];

  return (
    <div className={cn("bg-[#1e232d]/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col", className)}>
      {/* Header bar */}
      <div className="p-3 bg-black/30 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <Radio size={16} className="text-rose-400 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white tracking-wide uppercase">911 • Crime Radar • Waze & Trip Intelligence</span>
              <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                911 CAD • Crime Radar • Grounded
              </span>
            </div>
            <p className="text-[10px] text-white/50 truncate">
              {data?.location ? `Active Scan Zone: ${data.location}` : 'Scraping 911 CAD, Crime Radar, Waze, Weather & Prior Trips...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={triggerVerbalBriefing}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
            title="Have DriveLogic (Eclipse Voice) verbally announce upcoming problems from all sources"
          >
            <Volume2 size={12} className="text-emerald-400" />
            <span className="hidden sm:inline">Speak Alert</span>
          </button>
          <button
            type="button"
            onClick={() => onRefresh(searchLocation || data?.location)}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            title="Rescrape 911 CAD, Crime Radar, Waze & Weather"
          >
            <RefreshCw size={13} className={cn(isLoading && "animate-spin text-car-accent")} />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title={isExpanded ? "Collapse Radar" : "Expand Radar"}
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col overflow-hidden"
          >
            {/* Scraped Data Sources Live Status Strip */}
            {data?.scrapedFeeds && data.scrapedFeeds.length > 0 && (
              <div className="px-2.5 py-1.5 bg-black/50 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[9px] font-mono text-white/40 uppercase shrink-0">Scraped Sources:</span>
                {data.scrapedFeeds.map((feed, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-mono text-white/80 flex items-center gap-1 shrink-0"
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", feed.status === 'live' ? "bg-emerald-400 animate-pulse" : "bg-sky-400")} />
                    <span>{feed.source}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Search location bar */}
            <form onSubmit={handleSearchSubmit} className="p-2.5 bg-black/20 border-b border-white/5 flex flex-col gap-2">
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    value={searchLocation}
                    onChange={(e) => setSearchLocation(e.target.value)}
                    placeholder="Search highway, corridor, or city for 911 & Crime Radar..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-car-accent transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !searchLocation.trim()}
                  className="px-3 py-1.5 bg-car-accent text-black font-bold text-xs rounded-lg hover:bg-car-accent/90 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Scan 911 & Web
                </button>
              </div>

              {/* Quick corridor chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-[10px] text-white/40 font-mono shrink-0">Corridors:</span>
                {quickLocations.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => {
                      setSearchLocation(loc);
                      onRefresh(loc);
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] shrink-0 transition-all font-mono cursor-pointer",
                      data?.location === loc
                        ? "bg-car-accent/20 border border-car-accent text-car-accent font-bold"
                        : "bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/20"
                    )}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </form>

            {/* Filter Tabs */}
            <div className="p-2 border-b border-white/5 flex gap-1 overflow-x-auto no-scrollbar bg-black/10">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all cursor-pointer",
                  activeFilter === 'all'
                    ? "bg-car-accent text-black font-bold shadow-sm"
                    : "bg-white/5 text-white/60 hover:text-white"
                )}
              >
                <span>All</span>
                <span className="px-1 rounded bg-black/20 text-[9px]">{counts.all}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('dispatch_911')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all cursor-pointer",
                  activeFilter === 'dispatch_911'
                    ? "bg-red-500 text-white font-bold shadow-sm"
                    : "bg-white/5 text-white/60 hover:text-white"
                )}
              >
                <Siren size={11} className={activeFilter === 'dispatch_911' ? 'text-white' : 'text-red-400'} />
                <span>911 Calls</span>
                <span className="px-1 rounded bg-black/20 text-[9px]">{counts.dispatch_911}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('crime_radar')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all cursor-pointer",
                  activeFilter === 'crime_radar'
                    ? "bg-pink-500 text-white font-bold shadow-sm"
                    : "bg-white/5 text-white/60 hover:text-white"
                )}
              >
                <Shield size={11} className={activeFilter === 'crime_radar' ? 'text-white' : 'text-pink-400'} />
                <span>Crime Radar</span>
                <span className="px-1 rounded bg-black/20 text-[9px]">{counts.crime_radar}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('prior_trip_damage')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all cursor-pointer",
                  activeFilter === 'prior_trip_damage'
                    ? "bg-purple-500 text-white font-bold shadow-sm"
                    : "bg-white/5 text-white/60 hover:text-white"
                )}
              >
                <Activity size={11} className={activeFilter === 'prior_trip_damage' ? 'text-white' : 'text-purple-400'} />
                <span>Prior Trip Logs</span>
                <span className="px-1 rounded bg-black/20 text-[9px]">{counts.prior_trip_damage}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('speed_trap')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all cursor-pointer",
                  activeFilter === 'speed_trap'
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "bg-white/5 text-white/60 hover:text-white"
                )}
              >
                <ShieldAlert size={11} className={activeFilter === 'speed_trap' ? 'text-black' : 'text-amber-400'} />
                <span>Waze Traps</span>
                <span className="px-1 rounded bg-black/20 text-[9px]">{counts.speed_trap}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('accident')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all cursor-pointer",
                  activeFilter === 'accident'
                    ? "bg-rose-500 text-white font-bold shadow-sm"
                    : "bg-white/5 text-white/60 hover:text-white"
                )}
              >
                <AlertTriangle size={11} className={activeFilter === 'accident' ? 'text-white' : 'text-rose-400'} />
                <span>Accidents</span>
                <span className="px-1 rounded bg-black/20 text-[9px]">{counts.accident}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('roadwork')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all cursor-pointer",
                  activeFilter === 'roadwork'
                    ? "bg-orange-500 text-black font-bold shadow-sm"
                    : "bg-white/5 text-white/60 hover:text-white"
                )}
              >
                <Construction size={11} className={activeFilter === 'roadwork' ? 'text-black' : 'text-orange-400'} />
                <span>Roadwork</span>
                <span className="px-1 rounded bg-black/20 text-[9px]">{counts.roadwork}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('weather_hazard')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all cursor-pointer",
                  activeFilter === 'weather_hazard'
                    ? "bg-blue-500 text-white font-bold shadow-sm"
                    : "bg-white/5 text-white/60 hover:text-white"
                )}
              >
                <CloudRain size={11} className={activeFilter === 'weather_hazard' ? 'text-white' : 'text-blue-400'} />
                <span>Weather</span>
                <span className="px-1 rounded bg-black/20 text-[9px]">{counts.weather_hazard}</span>
              </button>
            </div>

            {/* Weather & Road Surface Bar */}
            {data?.weather && (
              <div className="p-2.5 bg-black/40 border-b border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <CloudRain size={14} />
                  </div>
                  <div>
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span>{data.weather.tempF}°F</span>
                      <span className="text-[10px] text-white/60">• {data.weather.condition}</span>
                    </div>
                    <div className="text-[10px] text-amber-300/90 font-mono">
                      Surface: {data.weather.roadSurface}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] text-white/50">
                  <div>Vis: {data.weather.visibility}</div>
                  <div>Wind: {data.weather.windSpeed}</div>
                </div>
              </div>
            )}

            {/* DriveLogic Eclipse Verbal Notification Preview Banner */}
            {(data?.verbalAlert || data?.summary) && (
              <div className="p-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-white/85 leading-relaxed flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Volume2 size={14} className="text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 font-bold block">
                      DriveLogic (Eclipse Voice) Hands-Free Verbal Briefing:
                    </span>
                    <p className="text-[11px] text-white/85 mt-0.5">
                      {data.verbalAlert || data.summary}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={triggerVerbalBriefing}
                  className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[9.5px] font-mono font-bold shrink-0 cursor-pointer"
                >
                  Speak Now
                </button>
              </div>
            )}

            {/* Incident List */}
            <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
              {filteredHazards.length === 0 ? (
                <div className="p-6 text-center text-white/40 text-xs font-mono">
                  No active incidents reported for this category in the current scan zone.
                </div>
              ) : (
                filteredHazards.map((hazard) => {
                  const isSelected = selectedHazardId === hazard.id;
                  return (
                    <div
                      key={hazard.id}
                      onClick={() => onSelectHazard?.(hazard)}
                      className={cn(
                        "p-2.5 hover:bg-white/5 transition-all cursor-pointer flex flex-col gap-1.5",
                        isSelected && "bg-white/10 border-l-2 border-car-accent"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className="p-1 rounded bg-black/40 border border-white/10 shrink-0">
                            {getHazardIcon(hazard.type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs text-white leading-tight">
                                {hazard.title}
                              </span>
                              {hazard.callCode && (
                                <span className="px-1.5 py-0.2 rounded bg-white/10 border border-white/15 text-[8.5px] font-mono text-white/80">
                                  {hazard.callCode}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-car-accent font-mono block">
                              {hazard.location}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {getSeverityBadge(hazard.severity)}
                          {hazard.reportedDelayMinutes !== undefined && hazard.reportedDelayMinutes > 0 && (
                            <span className="text-[9px] font-mono text-rose-300 font-bold">
                              +{hazard.reportedDelayMinutes}m delay
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-white/70 leading-snug">
                        {hazard.description}
                      </p>

                      <div className="flex items-center justify-between text-[9px] text-white/40 font-mono pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-amber-300/80">Source: {hazard.source}</span>
                          {hazard.direction && <span>Dir: {hazard.direction}</span>}
                          {hazard.verifiedCount && <span>{hazard.verifiedCount} confirmations</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span>{hazard.timestamp}</span>
                          <span className="text-car-accent hover:underline flex items-center gap-0.5">
                            <Compass size={9} /> Focus Map
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Web Sources Citations */}
            {data?.sources && data.sources.length > 0 && (
              <div className="p-2 bg-black/50 border-t border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[9px] text-white/40 font-mono shrink-0">Web & 911 Grounding:</span>
                {data.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] text-white/60 hover:text-car-accent flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10 shrink-0 transition-colors"
                  >
                    <span className="truncate max-w-[140px]">{src.title}</span>
                    <ExternalLink size={8} />
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
export default LiveHazardRadar;
