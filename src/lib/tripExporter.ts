import { Trip } from '../types';

/**
 * Downloads a text or blob content as a file in the user's browser
 */
function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports a single trip as a comprehensive, well-structured JSON file
 * containing all trip metadata, waypoints, and harsh event logs.
 */
export function exportTripAsJSON(trip: Trip): void {
  const startTime = trip.startTime;
  const endTime = trip.endTime || (trip.waypoints && trip.waypoints.length > 0 
    ? trip.waypoints[trip.waypoints.length - 1].timestamp 
    : startTime);
  const durationSeconds = Math.round((endTime - startTime) / 1000);

  const exportPayload = {
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    source: 'DriveLogic AI - Telematics & OBD-II Diagnostics Engine',
    tripSummary: {
      tripId: trip.id,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationSeconds,
      durationMinutes: +(durationSeconds / 60).toFixed(1),
      distanceMiles: +trip.distance.toFixed(2),
      distanceKm: +(trip.distance * 1.60934).toFixed(2),
      averageDamageScore: Math.round(trip.averageDamageScore || 0),
      totalWaypoints: trip.waypoints?.length || 0,
      totalEvents: trip.events?.length || 0,
    },
    eventsSummary: {
      harshBrakingCount: trip.events?.filter(e => e.type === 'harsh_braking').length || 0,
      rapidAccelerationCount: trip.events?.filter(e => e.type === 'rapid_acceleration').length || 0,
      sharpCorneringCount: trip.events?.filter(e => e.type === 'sharp_cornering').length || 0,
      overheatingCount: trip.events?.filter(e => e.type === 'overheating').length || 0,
    },
    waypoints: (trip.waypoints || []).map((wp, idx) => ({
      index: idx + 1,
      timestamp: wp.timestamp,
      isoTime: new Date(wp.timestamp).toISOString(),
      elapsedSeconds: Math.round((wp.timestamp - startTime) / 1000),
      latitude: wp.lat,
      longitude: wp.lng,
    })),
    events: (trip.events || []).map((evt, idx) => ({
      index: idx + 1,
      id: evt.id || `evt_${idx}`,
      type: evt.type,
      typeLabel: evt.type.replace(/_/g, ' ').toUpperCase(),
      severity: Math.round(evt.severity),
      timestamp: evt.timestamp,
      isoTime: new Date(evt.timestamp).toISOString(),
      elapsedSeconds: Math.round((evt.timestamp - startTime) / 1000),
      latitude: evt.location?.lat ?? null,
      longitude: evt.location?.lng ?? null,
      note: evt.note || null,
    })),
    damageHistory: trip.damageHistory || [],
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const dateSlug = new Date(trip.startTime).toISOString().slice(0, 10);
  const filename = `trip_${trip.id || dateSlug}_telematics.json`;

  downloadFile(filename, jsonString, 'application/json;charset=utf-8');
}

/**
 * Exports a single trip's waypoints and event logs as a CSV file
 * easily openable in Microsoft Excel, Google Sheets, or Python Pandas.
 */
export function exportTripAsCSV(trip: Trip): void {
  const startTime = trip.startTime;
  const rows: string[] = [];

  // CSV Header
  const headers = [
    'trip_id',
    'record_type', // 'WAYPOINT' | 'EVENT'
    'index',
    'timestamp_ms',
    'iso_datetime',
    'elapsed_seconds',
    'latitude',
    'longitude',
    'event_type',
    'severity_score',
    'notes'
  ];
  rows.push(headers.join(','));

  const cleanField = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // 1. Add Waypoints
  (trip.waypoints || []).forEach((wp, idx) => {
    const elapsedSec = Math.round((wp.timestamp - startTime) / 1000);
    const row = [
      cleanField(trip.id),
      'WAYPOINT',
      idx + 1,
      wp.timestamp,
      new Date(wp.timestamp).toISOString(),
      elapsedSec,
      wp.lat.toFixed(6),
      wp.lng.toFixed(6),
      '', // event_type
      '', // severity_score
      ''  // notes
    ];
    rows.push(row.join(','));
  });

  // 2. Add Event Logs
  (trip.events || []).forEach((evt, idx) => {
    const elapsedSec = Math.round((evt.timestamp - startTime) / 1000);
    const lat = evt.location?.lat != null ? evt.location.lat.toFixed(6) : '';
    const lng = evt.location?.lng != null ? evt.location.lng.toFixed(6) : '';
    const row = [
      cleanField(trip.id),
      'EVENT',
      idx + 1,
      evt.timestamp,
      new Date(evt.timestamp).toISOString(),
      elapsedSec,
      lat,
      lng,
      cleanField(evt.type),
      Math.round(evt.severity),
      cleanField(evt.note || '')
    ];
    rows.push(row.join(','));
  });

  const csvContent = rows.join('\r\n');
  const dateSlug = new Date(trip.startTime).toISOString().slice(0, 10);
  const filename = `trip_${trip.id || dateSlug}_telematics.csv`;

  downloadFile(filename, csvContent, 'text/csv;charset=utf-8');
}
