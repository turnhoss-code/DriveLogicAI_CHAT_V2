import { Trip } from '../types';

export const INITIAL_SEED_TRIPS: Trip[] = [
  {
    id: 'trip-ny-fdr-jfk',
    startTime: Date.now() - 1000 * 60 * 60 * 3, // 3 hours ago
    endTime: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 18, // 18 min trip
    distance: 8.4,
    averageDamageScore: 32,
    waypoints: [
      { lat: 40.7484, lng: -73.9857, timestamp: Date.now() - 1000 * 60 * 60 * 3 }, // Empire State / Midtown NY
      { lat: 40.7300, lng: -73.9740, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 2 }, // FDR Drive South
      { lat: 40.7128, lng: -73.9900, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 5 }, // Lower East Side / Manhattan Bridge
      { lat: 40.6920, lng: -73.9850, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 8 }, // Downtown Brooklyn
      { lat: 40.6650, lng: -73.9200, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 11 }, // Eastern Pkwy
      { lat: 40.6480, lng: -73.8300, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 15 }, // Belt Pkwy East
      { lat: 40.6413, lng: -73.7781, timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 18 }  // JFK Airport NY
    ],
    events: [
      {
        type: 'harsh_braking',
        severity: 68,
        timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 5,
        location: { lat: 40.7128, lng: -73.9900 }
      },
      {
        type: 'rapid_acceleration',
        severity: 58,
        timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 11,
        location: { lat: 40.6650, lng: -73.9200 }
      },
      {
        type: 'sharp_cornering',
        severity: 52,
        timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 15,
        location: { lat: 40.6480, lng: -73.8300 }
      }
    ],
    damageHistory: [
      { timestamp: Date.now() - 1000 * 60 * 60 * 3, score: 10 },
      { timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 5, score: 58 },
      { timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 8, score: 28 },
      { timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 11, score: 48 },
      { timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 15, score: 32 },
      { timestamp: Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 18, score: 32 }
    ]
  },
  {
    id: 'trip-albany-saratoga',
    startTime: Date.now() - 1000 * 60 * 60 * 26, // Yesterday
    endTime: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 25, // 25 min trip
    distance: 14.2,
    averageDamageScore: 22,
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
      { timestamp: Date.now() - 1000 * 60 * 60 * 26, score: 8 },
      { timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 6, score: 36 },
      { timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 18, score: 28 },
      { timestamp: Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 25, score: 16 }
    ]
  }
];
