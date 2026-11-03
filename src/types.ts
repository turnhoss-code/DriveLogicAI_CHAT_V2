/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NavigationState {
  from: string;
  to: string;
  isActive: boolean;
  waypoints?: { lat: number; lng: number }[];
}

export interface OBDData {
  rpm: number;
  speed: number;
  coolantTemp: number;
  throttlePos: number;
  load: number;
  voltage: number;
  dtcs: string[];
  readiness: {
    misfire: boolean;
    fuelSystem: boolean;
    components: boolean;
    catalyst: boolean;
    evap: boolean;
    oxygenSensor: boolean;
  };
  timestamp: number;
  detectedProtocol?: string;
  deviceName?: string;
  protocolStatus?: 'idle' | 'scanning' | 'auto_sensing' | 'locked';
}

export interface TripEvent {
  id?: string;
  type: 'harsh_braking' | 'rapid_acceleration' | 'sharp_cornering' | 'overheating';
  severity: number;
  timestamp: number;
  location?: { lat: number; lng: number };
  note?: string;
}

export interface Trip {
  id: string;
  startTime: number;
  endTime?: number;
  waypoints: { lat: number; lng: number; timestamp: number }[];
  events: TripEvent[];
  customMarkers?: { lat: number; lng: number; note: string; timestamp: number }[];
  averageDamageScore: number;
  damageHistory: DamagePoint[];
  distance: number;
  maxGForce?: number;
  avgSpeed?: number;
  speedSamples?: number[];
}

export interface DamagePoint {
  id?: string;
  score: number;
  timestamp: number;
  gForce?: number;
  vibrationRms?: number;
  lat?: number;
  lng?: number;
  speed?: number;
  severity?: 'minor' | 'moderate' | 'severe';
  label?: string;
  axis?: { x: number; y: number; z: number };
}

export interface SensorPoint {
  accel: number;
  gyro: number;
  vibrationRms?: number;
  x?: number;
  y?: number;
  z?: number;
  timestamp: number;
}

export interface MaintenanceTask {
  id: string;
  name: string;
  type: 'oil_change' | 'tire_rotation' | 'brake_pads' | 'air_filter' | 'custom';
  intervalMiles: number;
  intervalMonths: number;
  lastCompletedMiles: number;
  lastCompletedDate: number;
}

export interface PostCommandActions {
  changeTab: 'none' | 'speakTab' | 'triggerSim';
  setNavigation: 'none' | 'autoRecord' | 'switchTab';
  diagnoseVehicle: 'none' | 'switchOBD' | 'speakHealth';
  toggleRecording: 'none' | 'switchGPS' | 'speakStatus';
}

export type SubscriptionTier = 'free' | 'pro' | 'premium';

export interface SubscriptionPlan {
  id: SubscriptionTier;
  name: string;
  price: string;
  period: string;
  numericPrice: number;
  description: string;
  badge?: string;
  features: string[];
  recommended?: boolean;
}

export type RoadHazardType =
  | 'speed_trap'
  | 'accident'
  | 'roadwork'
  | 'emergency_vehicle'
  | 'weather_hazard'
  | 'traffic_jam'
  | 'dispatch_911'
  | 'crime_radar'
  | 'prior_trip_damage';

export interface ScrapedFeedStatus {
  source: string;
  category: '911_cad' | 'crime_radar' | 'waze' | 'dot_511' | 'weather' | 'prior_trips' | 'prior_chats';
  status: 'live' | 'synced';
  incidentsCount: number;
  lastScraped: string;
}

export interface RoadHazard {
  id: string;
  type: RoadHazardType;
  title: string;
  location: string;
  coordinates: { lat: number; lng: number };
  severity: 'low' | 'moderate' | 'high' | 'critical';
  description: string;
  source: string; // e.g. "Crime Radar App", "911 CAD Dispatch", "Waze Community", "511NY", "Prior Trip Vibration Log"
  timestamp: string; // e.g. "2 min ago" or "Live"
  reportedDelayMinutes?: number;
  direction?: 'NB' | 'SB' | 'EB' | 'WB' | 'Both';
  verifiedCount?: number;
  callCode?: string; // e.g. "911-CAD #4812 / 10-50", "CRIME-RADAR ALERT"
}

export interface TrafficHazardsResponse {
  summary: string;
  verbalAlert?: string;
  audio?: string | null;
  location: string;
  hazards: RoadHazard[];
  weather?: {
    tempF: number;
    condition: string;
    roadSurface: string;
    visibility: string;
    windSpeed: string;
    hazards?: string[];
  };
  scrapedFeeds?: ScrapedFeedStatus[];
  sources: { title: string; uri: string }[];
  lastUpdated: number;
}


