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
  score: number;
  timestamp: number;
}

export interface SensorPoint {
  accel: number;
  gyro: number;
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

