import { OBDData, Trip } from "../types";

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const customKey = localStorage.getItem('ztcd_gemini_api_key');
    if (customKey && customKey.trim()) {
      headers['x-gemini-api-key'] = customKey.trim();
    }
  } catch {
    // Ignore localStorage access restrictions
  }
  return headers;
}

export const processVoiceCommand = async (
  text: string, 
  contextData?: { speed: number, rpm: number, isRecording: boolean, vehicleModel?: string }, 
  history?: any[],
  options?: { model?: string; role?: string }
) => {
  try {
    const res = await fetch("/api/v1/cmd", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ 
        text, 
        contextData, 
        history,
        model: options?.model,
        role: options?.role
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return data;
  } catch (error) {
    console.warn("Voice command processing failed:", error);
    return { text: "I'm sorry, I couldn't process that command. Please check your connection." };
  }
};

export const runAIDiagnosis = async (data: OBDData, sensorHistory?: { accel: number, gyro: number, timestamp: number }[], vehicleModel?: string) => {
  try {
    const res = await fetch("/api/v1/analyze", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ data, sensorHistory, vehicleModel })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const json = await res.json();
    return json.text || "AI Diagnosis is currently unavailable.";
  } catch (error) {
    console.warn("AI Diagnosis failed:", error);
    return "AI Diagnosis is currently unavailable. Please check your API key.";
  }
};

export const fetchDTCDefinition = async (code: string) => {
  try {
    const res = await fetch("/api/v1/explain-dtc", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ code })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const json = await res.json();
    return json.text || null;
  } catch (error) {
    console.warn("DTC Definition fetch failed:", error);
    return null; // Return null so we can fallback to local definitions if needed
  }
};

export const getRouteRecommendation = async (trips: Trip[]) => {
  try {
    const res = await fetch("/api/v1/route-opt", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ trips })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const json = await res.json();
    return json.text;
  } catch (error) {
    console.warn("Route recommendation failed:", error);
    return "Route recommendations are currently unavailable.";
  }
};
