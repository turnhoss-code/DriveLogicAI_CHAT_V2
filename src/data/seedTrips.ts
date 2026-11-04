import { Trip } from '../types';

export const INITIAL_SEED_TRIPS: Trip[] = [
  {
    id: 'trip-binghamton-vestal',
    startTime: Date.now() - 1000 * 60 * 60 * 3, // 3 hours ago
    endTime: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 18, // 18 min trip
    distance: 8.4,
    averageDamageScore: 32,
    waypoints: [
      { lat: 42.0987, lng: -75.9180, timestamp: Date.now() - 1000 * 60 * 60 * 3 }, // Downtown Binghamton, NY (Court St)
      { lat: 42.1045, lng: -75.9320, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 2 }, // Main St / Front St Bridge
      { lat: 42.1156, lng: -75.9588, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 5 }, // Johnson City / NY-17 Interchange
      { lat: 42.0980, lng: -75.9710, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 8 }, // Binghamton University / NY-434
      { lat: 42.0910, lng: -76.0020, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 11 }, // Vestal Parkway East
      { lat: 42.0851, lng: -76.0538, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 15 }, // Vestal Town Square
      { lat: 42.0984, lng: -76.0494, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 18 }  // Endicott, NY
    ],
    events: [
      {
        type: 'harsh_braking',
        severity: 68,
        timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 5,
        location: { lat: 42.1156, lng: -75.9588 }
      },
      {
        type: 'rapid_acceleration',
        severity: 58,
        timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 11,
        location: { lat: 42.0910, lng: -76.0020 }
      },
      {
        type: 'sharp_cornering',
        severity: 52,
        timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 15,
        location: { lat: 42.0851, lng: -76.0538 }
      }
    ],
    damageHistory: [
      { id: 'dp-1', timestamp: Date.now() - 1000 * 60 * 60 * 3, score: 10, gForce: 0.28, vibrationRms: 0.12, lat: 42.0987, lng: -75.9180, speed: 24, severity: 'minor', label: 'Memorial Bridge Expansion Joint' },
      { id: 'dp-2', timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 5, score: 58, gForce: 1.64, vibrationRms: 0.68, lat: 42.1156, lng: -75.9588, speed: 38, severity: 'severe', label: 'Severe Pothole Shock (NY-17 / I-86 Ramp)' },
      { id: 'dp-3', timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 8, score: 28, gForce: 0.72, vibrationRms: 0.31, lat: 42.0980, lng: -75.9710, speed: 31, severity: 'moderate', label: 'Sunken Manhole Cover (NY-201)' },
      { id: 'dp-4', timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 11, score: 48, gForce: 1.32, vibrationRms: 0.54, lat: 42.0910, lng: -76.0020, speed: 44, severity: 'severe', label: 'Heavy Chassis Impact (Vestal Pkwy)' },
      { id: 'dp-5', timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 15, score: 32, gForce: 0.85, vibrationRms: 0.36, lat: 42.0851, lng: -76.0538, speed: 52, severity: 'moderate', label: 'Bridge Deck Washboarding' },
      { id: 'dp-6', timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 18, score: 18, gForce: 0.42, vibrationRms: 0.19, lat: 42.0984, lng: -76.0494, speed: 18, severity: 'minor', label: 'Speed Bump' }
    ]
  },
  {
    id: 'trip-albany-saratoga',
    startTime: Date.now() - 1000 * 60 * 60 * 26, // Yesterday
    endTime: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 25, // 25 min trip
    distance: 14.2,
    averageDamageScore: 22,
    maxGForce: 1.18,
    waypoints: [
      { lat: 42.6526, lng: -73.7562, timestamp: Date.now() - 1000 * 60 * 60 * 26 }, // Downtown Albany, NY
      { lat: 42.7483, lng: -73.8017, timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 6 }, // Albany Airport / Colonie
      { lat: 42.8400, lng: -73.7850, timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 12 }, // Clifton Park I-87
      { lat: 42.9600, lng: -73.7800, timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 18 }, // Malta Tech Park
      { lat: 43.0831, lng: -73.7846, timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 25 }  // Saratoga Springs, NY
    ],
    events: [
      {
        type: 'harsh_braking',
        severity: 42,
        timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 6,
        location: { lat: 42.7483, lng: -73.8017 }
      },
      {
        type: 'sharp_cornering',
        severity: 38,
        timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 18,
        location: { lat: 42.9600, lng: -73.7800 }
      }
    ],
    damageHistory: [
      { id: 'dp-a1', timestamp: Date.now() - 1000 * 60 * 60 * 26, score: 8, gForce: 0.31, vibrationRms: 0.14, lat: 42.6526, lng: -73.7562, speed: 28, severity: 'minor', label: 'Surface Ripple' },
      { id: 'dp-a2', timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 6, score: 36, gForce: 1.18, vibrationRms: 0.45, lat: 42.7483, lng: -73.8017, speed: 55, severity: 'moderate', label: 'Frost Heave / Highway Seam' },
      { id: 'dp-a3', timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 18, score: 28, gForce: 0.89, vibrationRms: 0.34, lat: 42.9600, lng: -73.7800, speed: 62, severity: 'moderate', label: 'Rumble Strip / Joint Impact' },
      { id: 'dp-a4', timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 25, score: 16, gForce: 0.38, vibrationRms: 0.16, lat: 43.0831, lng: -73.7846, speed: 22, severity: 'minor', label: 'Minor Road Patch' }
    ]
  }
];
