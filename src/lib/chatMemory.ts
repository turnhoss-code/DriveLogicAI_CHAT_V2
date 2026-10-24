import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Trip, TripEvent } from '../types';

export interface PersistentChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

const LOCAL_STORAGE_KEY = 'ztcd_persistent_chat_history';

/**
 * Loads persistent chat history from Firestore (if user signed in) or localStorage
 */
export async function loadChatHistory(userId?: string | null): Promise<PersistentChatMessage[]> {
  // Try local storage first for instant load
  let cached: PersistentChatMessage[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      cached = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to parse cached chat history', err);
  }

  // If user signed in, sync with Firestore
  if (userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.chatHistory && Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
          // Merge or take firestore history
          const remote: PersistentChatMessage[] = data.chatHistory;
          // Deduplicate by timestamp and id
          const combinedMap = new Map<string, PersistentChatMessage>();
          [...cached, ...remote].forEach(m => combinedMap.set(m.id || `${m.timestamp}-${m.sender}`, m));
          const sorted = Array.from(combinedMap.values()).sort((a, b) => a.timestamp - b.timestamp);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sorted));
          return sorted;
        }
      }
    } catch (err) {
      console.warn('Could not retrieve chat history from Firestore, using cache', err);
    }
  }

  return cached;
}

/**
 * Saves a new message to persistent chat history in both localStorage and Firestore
 */
export async function savePersistentMessage(
  msg: { sender: 'user' | 'ai'; text: string; id?: string; timestamp?: number },
  userId?: string | null
): Promise<PersistentChatMessage[]> {
  const newMsg: PersistentChatMessage = {
    id: msg.id || Math.random().toString(36).substring(2, 9),
    sender: msg.sender,
    text: msg.text,
    timestamp: msg.timestamp || Date.now(),
  };

  let history: PersistentChatMessage[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      history = JSON.parse(raw);
    }
  } catch (err) {
    history = [];
  }

  // Avoid duplicate consecutive identical messages within 2 seconds
  const last = history[history.length - 1];
  if (last && last.sender === newMsg.sender && last.text === newMsg.text && Math.abs(last.timestamp - newMsg.timestamp) < 3000) {
    return history;
  }

  const updated = [...history, newMsg].slice(-100); // Keep last 100 turns
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

  // Sync to Firestore if authenticated
  if (userId) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        chatHistory: updated,
        updatedAt: Date.now(),
      }).catch(async (err: any) => {
        if (err.code === 'not-found' || (err.message && err.message.includes('not found'))) {
          await setDoc(userRef, {
            chatHistory: updated,
            updatedAt: Date.now(),
            createdAt: Date.now(),
          }, { merge: true });
        }
      });
    } catch (err) {
      console.warn('Failed to sync chat message to Firestore', err);
    }
  }

  return updated;
}

/**
 * Clears persistent chat history
 */
export async function clearPersistentHistory(userId?: string | null): Promise<void> {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  if (userId) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        chatHistory: [],
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to clear chat history in Firestore', err);
    }
  }
}

/**
 * Formats prior chats into a clear summary for Gemini Live system instruction
 */
export function formatPriorChatsSummary(chats: PersistentChatMessage[], maxTurns = 12): string {
  if (!chats || chats.length === 0) {
    return "No prior chats recorded yet. This is your initial session with the driver.";
  }
  const recent = chats.slice(-maxTurns);
  return recent.map(c => {
    const role = c.sender === 'user' ? 'Driver' : 'DriveLogic AI';
    const time = new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `[${time}] ${role}: ${c.text}`;
  }).join('\n');
}

/**
 * Formats prior trips into a detailed summary for Gemini Live
 */
export function formatPriorTripsSummary(trips: Trip[], maxTrips = 5): string {
  if (!trips || trips.length === 0) {
    return "No prior trips logged yet.";
  }

  const recent = trips.slice(0, maxTrips);
  return recent.map((t, idx) => {
    const dateStr = new Date(t.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const durationMin = t.endTime ? Math.round((t.endTime - t.startTime) / 60000) : 15;
    const eventCounts = {
      braking: t.events.filter(e => e.type === 'harsh_braking').length,
      accel: t.events.filter(e => e.type === 'rapid_acceleration').length,
      cornering: t.events.filter(e => e.type === 'sharp_cornering').length,
      overheat: t.events.filter(e => e.type === 'overheating').length,
    };
    return `Trip #${idx + 1} (${dateStr}): ${t.distance.toFixed(1)} miles, ${durationMin} min duration, avg damage score ${Math.round(t.averageDamageScore || 0)}/100. Harsh events: ${eventCounts.braking} harsh brakings, ${eventCounts.accel} rapid accelerations, ${eventCounts.cornering} sharp corners.`;
  }).join('\n');
}

/**
 * Formats harsh events history across all trips for Gemini Live
 */
export function formatHarshEventsSummary(trips: Trip[]): string {
  const allEvents: { event: TripEvent; tripDate: string }[] = [];
  trips.forEach(t => {
    const tripDate = new Date(t.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    (t.events || []).forEach(e => allEvents.push({ event: e, tripDate }));
  });

  if (allEvents.length === 0) {
    return "No harsh driving events logged.";
  }

  // Sort descending by timestamp
  allEvents.sort((a, b) => b.event.timestamp - a.event.timestamp);

  const top10 = allEvents.slice(0, 10);
  return top10.map(({ event, tripDate }) => {
    const typeLabel = event.type.replace('_', ' ').toUpperCase();
    const locStr = event.location ? `at (${event.location.lat.toFixed(4)}, ${event.location.lng.toFixed(4)})` : '';
    return `- [${tripDate}] ${typeLabel}: Severity ${Math.round(event.severity)}/100 ${locStr}`;
  }).join('\n');
}
