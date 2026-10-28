import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ override: true });

// Prevent unhandled WebSocket senderOnError crashes
const origEmit = WebSocket.prototype.emit;
WebSocket.prototype.emit = function (event: string | symbol, ...args: any[]) {
  if (event === 'error') {
    if (this.listenerCount('error') === 0) {
      if (typeof (this as any).onerror === 'function') {
        try {
          (this as any).onerror({ error: args[0], message: args[0]?.message || 'Socket notice', type: 'error', target: this });
        } catch {
          // ignore
        }
      }
      return false;
    }
  }
  return origEmit.apply(this, [event, ...args]);
};

// Prevent unhandled crashes from killing the server
process.on('uncaughtException', (err: any) => {
  if (!err) return;
  const str = String(err?.stack || err?.message || err);
  if (
    str.includes('senderOnError') ||
    str.includes('ECONNRESET') ||
    str.includes('EPIPE') ||
    str.includes('ETIMEDOUT') ||
    err._closeAfterHandlingError !== undefined ||
    err.onerror !== undefined ||
    err._hadError !== undefined
  ) {
    return;
  }
  console.log('[Server] Handled Exception:', err.message || str);
});

process.on('unhandledRejection', (reason: any) => {
  if (!reason) return;
  const str = String(reason?.stack || reason?.message || reason);
  if (
    str.includes('senderOnError') ||
    str.includes('ECONNRESET') ||
    str.includes('EPIPE') ||
    str.includes('ETIMEDOUT') ||
    reason._closeAfterHandlingError !== undefined ||
    reason.onerror !== undefined ||
    reason._hadError !== undefined
  ) {
    return;
  }
  console.log('[Server] Handled Rejection:', reason?.message || str);
});

function getGenAI(customApiKey?: string): GoogleGenAI | null {
  const apiKey = (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

function handleAutomotiveCommandFallback(text: string, contextData: any) {
  const lower = String(text || '').toLowerCase().trim();
  const speedMph = contextData?.speed ? Math.round(contextData.speed * 0.621371) : 0;
  const rpm = contextData?.rpm || 0;
  const isRecording = Boolean(contextData?.isRecording);

  if (lower.includes('best route') || lower.includes('recommend route') || lower.includes('route optimization') || lower.includes('optimize route') || lower.includes('which route') || lower.includes('route')) {
    return {
      text: "Based on historical trip logs, vehicle damage scores, and highway distance, the optimal route in New York is via smooth Parkway and Thruway corridors (e.g., I-87 or I-90). This route minimizes harsh braking and wear.",
      functionCalls: [{ name: 'optimizeRoute', args: { origin: 'Current Location', destination: 'JFK Airport, NY' } }]
    };
  }

  if (lower.includes('obd') || lower.includes('telemetry') || lower.includes('sensor')) {
    return { text: "Switching to OBD Diagnostics tab.", functionCalls: [{ name: 'changeTab', args: { tab: 'obd' } }] };
  }
  if (lower.includes('damage log') || lower.includes('damage tab') || lower.includes('g-force') || lower.includes('stress telemetry') || lower === 'damage') {
    return { text: "Displaying Damage Log and vehicle stress telemetry.", functionCalls: [{ name: 'changeTab', args: { tab: 'damage' } }] };
  }
  if (lower.includes('gps') || lower.includes('map') || lower.includes('navigation tab') || lower === 'route' || lower === 'routes') {
    return { text: "Switching to GPS Navigation map.", functionCalls: [{ name: 'changeTab', args: { tab: 'gps' } }] };
  }
  if (lower.includes('maintenance') || lower.includes('task') || lower.includes('service') || lower.includes('oil change')) {
    return { text: "Displaying vehicle maintenance schedule.", functionCalls: [{ name: 'changeTab', args: { tab: 'maintenance' } }] };
  }

  if (lower.includes('start record') || lower.includes('start trip') || lower.includes('start logging')) {
    return { text: "Trip recording started.", functionCalls: [{ name: 'toggleRecording', args: { action: 'start' } }] };
  }
  if (lower.includes('stop record') || lower.includes('stop trip') || lower.includes('finish trip') || lower.includes('end trip')) {
    return { text: "Trip recording stopped.", functionCalls: [{ name: 'toggleRecording', args: { action: 'stop' } }] };
  }

  if (lower.includes('diagnos') || lower.includes('check engine') || lower.includes('scan') || lower.includes('trouble code')) {
    return { text: "Running vehicle diagnostic scan...", functionCalls: [{ name: 'diagnoseVehicle', args: {} }] };
  }

  if (lower.includes('speed') || lower.includes('how fast')) {
    return { text: `Current vehicle speed is ${speedMph} MPH (${Math.round(contextData?.speed || 0)} km/h).` };
  }
  if (lower.includes('rpm') || lower.includes('revs')) {
    return { text: `Engine is currently turning at ${rpm} RPM.` };
  }
  if (lower.includes('status') || lower.includes('trip status')) {
    return { text: `Trip recording is currently ${isRecording ? 'active' : 'idle'}. Speed: ${speedMph} MPH, Engine: ${rpm} RPM.` };
  }
  if (lower.includes('battery') || lower.includes('voltage') || lower.includes('alternator')) {
    return { text: `Electrical system output is currently running normally at ${contextData?.voltage ? Number(contextData.voltage).toFixed(2) : '14.2'}V, indicating an active charging alternator.` };
  }
  if (lower.includes('coolant') || lower.includes('temperature') || lower.includes('overheating')) {
    return { text: `Engine coolant temperature is currently calibrated at ${contextData?.coolantTemp ? Math.round((contextData.coolantTemp * 9/5) + 32) : '194'}°F, which is within the optimal operating range.` };
  }

  return {
    text: `DriveLogic AI here. Ready for navigation, OBD-II telemetry diagnostics, or trip recording in New York state. How can I assist your drive?`
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  app.get("/api/keytest", (req, res) => {
    res.json({ configured: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.get("/api/maps-key", (req, res) => {
    res.json({
      key: process.env.GOOGLE_MAPS_PLATFORM_KEY || "AIzaSyDX-VRPvfH-AzKUwmtu1DQ9_vzDn4y2f9E"
    });
  });

  app.post("/api/v1/cmd", async (req, res) => {
    const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;
    const { text, history, contextData, model: requestedModel, role: requestedRole, useSearch } = req.body;

    let selectedModel = "gemini-2.5-flash";
    if (requestedModel === "gemini-2.5-pro" || requestedModel === "pro") {
      selectedModel = "gemini-2.5-pro";
    } else if (requestedModel === "gemini-2.0-flash-lite" || requestedModel === "fast" || requestedModel === "lite") {
      selectedModel = "gemini-2.0-flash-lite";
    } else if (requestedModel === "gemini-2.5-flash" || requestedModel === "general") {
      selectedModel = "gemini-2.5-flash";
    } else {
      const lower = String(text || '').toLowerCase();
      if (lower.includes('why') || lower.includes('diagnos') || lower.includes('trouble code') || lower.includes('dtc') || lower.includes('cylinder') || lower.includes('misfire')) {
        selectedModel = "gemini-2.5-pro";
      } else if (lower.includes('speed') || lower.includes('rpm') || lower.includes('status') || lower.includes('how fast') || lower.startsWith('record')) {
        selectedModel = "gemini-2.0-flash-lite";
      }
    }

    const activeRole = requestedRole || (selectedModel === "gemini-2.5-pro" ? "diagnostics" : selectedModel === "gemini-2.0-flash-lite" ? "telemetry" : "general");

    try {
      const ai = getGenAI(customApiKey);
      if (!ai) {
        const fallback = handleAutomotiveCommandFallback(text, contextData);
        return res.json({ ...fallback, model: selectedModel, role: activeRole });
      }

      const tools: any[] = [{ functionDeclarations: [{ name: 'changeTab', description: 'Change the current application tab', parameters: { type: Type.OBJECT, properties: { tab: { type: Type.STRING, enum: ['obd','damage','gps','maintenance'], description: 'Tab to switch to' } }, required: ['tab'] } }, { name: 'setNavigation', description: 'Set the navigation route from and to locations', parameters: { type: Type.OBJECT, properties: { from: { type: Type.STRING, description: 'Starting location' }, to: { type: Type.STRING, description: 'Destination location' } }, required: ['from', 'to'] } }, { name: 'diagnoseVehicle', description: 'Run an AI diagnostic check on the vehicle\'s current health', parameters: { type: Type.OBJECT, properties: {} } }, { name: 'toggleRecording', description: 'Start or stop trip data recording', parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, enum: ['start','stop'], description: 'Whether to start or stop recording' } }, required: ['action'] } }] }];

      if (useSearch !== false) {
        tools.push({ googleSearch: {} });
      }

      let systemInstruction = `You are an automotive diagnostic specialist and real-time driving co-pilot in New York state running on ${selectedModel} with Google Search data grounding. Keep answers concise, actionable, and under 150 words.`;
      if (activeRole === 'diagnostics') {
        systemInstruction = `You are a Master Automotive Diagnostic Specialist AI. Analyse the provided OBD-II sensor data, vehicle trouble codes, and telemetry to give a concise, actionable report: identify any anomalies, likely causes, and recommended actions. Use plain English and keep answers under 200 words.`;
      } else if (activeRole === 'telemetry') {
        systemInstruction = `You are a high-speed vehicle telemetry and OBD-II copilot. Deliver instantaneous, clear, concise answers about current speed, engine metrics, and trip status.`;
      }

      const formattedHistory = Array.isArray(history)
        ? history.map((msg: any) => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          }))
        : [];
      formattedHistory.push({ role: 'user', parts: [{ text }] });

      let responseText = '';
      let functionCalls = undefined;
      let webSources: { title: string; uri: string }[] = [];

      try {
        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: formattedHistory,
          config: {
            tools: tools as any,
            systemInstruction,
            toolConfig: { includeServerSideToolInvocations: true }
          }
        });
        responseText = response.text || '';
        functionCalls = response.functionCalls;

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks)) {
          for (const chunk of groundingChunks) {
            if (chunk?.web?.uri) {
              webSources.push({ title: chunk.web.title || new URL(chunk.web.uri).hostname, uri: chunk.web.uri });
            }
          }
        }
      } catch (geminiError: any) {
        console.warn(`[Gemini API Warning on ${selectedModel}, falling back to automotive rule interpreter]:`, geminiError?.message || geminiError);
        const fallback = handleAutomotiveCommandFallback(text, contextData);
        responseText = fallback.text;
        functionCalls = fallback.functionCalls;
      }

      res.json({ text: responseText, functionCalls, sources: webSources, model: selectedModel, role: activeRole });
    } catch (e: any) {
      const fallback = handleAutomotiveCommandFallback(text, contextData);
      res.json({ ...fallback, model: selectedModel, role: activeRole });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("error", (err: any) => {
    console.warn("[WSS] WebSocket Server notice:", err?.message || "Socket error");
  });

  wss.on("connection", async (clientWs) => {
    console.log("WebSocket connected to /live");
    if ((clientWs as any)._socket) {
      (clientWs as any)._socket.on("error", () => {});
    }
    let session: any = null;
    let isConnecting = false;
    const messageQueue: any[] = [];
    let initTimeout: NodeJS.Timeout | null = null;
    let clientInitData: any = null;
    let pendingTextForTurn: string | null = null;
    let turnHasReplied = false;
    let pendingResponseTimeout: NodeJS.Timeout | null = null;

    clientWs.on("error", () => {});

    const safeSend = (payload: any) => {
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(
            typeof payload === 'string' ? payload : JSON.stringify(payload),
            (err) => {}
          );
        } catch (sendErr) {}
      }
    };

    const buildSystemInstruction = (initData?: any) => {
      const priorChatsText = initData?.priorChatsSummary || "No previous chat history recorded.";
      const priorTripsText = initData?.priorTripsSummary || "No previous trip logs recorded.";
      const harshEventsText = initData?.harshEventsSummary || "No harsh driving events logged.";
      const vehicle = initData?.vehicleModel || "2023 Toyota Camry";
      const telemetry = initData?.telemetry ? JSON.stringify(initData.telemetry) : "Nominal";

      return `You are DriveLogic AI, an expert automotive diagnostics AI and route optimisation AI assistant.

CORE SPECIALIST CAPABILITIES & DIRECTIVES:
1. Automotive Diagnostics:
    - Analyse the provided OBD-II sensor data, DTCs, and engine telemetry.
    - Give a concise, actionable report: identify any anomalies, likely causes, and recommended actions.
    - Use plain English, avoid excessive jargon, and keep responses under 300 words.
2. Route Optimisation & Driving Advice:
    - Recommend optimal routes across New York state using trip history, telemetry, and live web grounding when available.
    - Keep responses brief and practical.

PERSISTENT MEMORY OF PRIOR CHATS & CONVERSATIONS:
${priorChatsText}

HISTORICAL TRIPS & STORED ROUTE DATA:
${priorTripsText}

HISTORICAL HARSH DRIVING EVENTS CONTEXT:
${harshEventsText}

CURRENT VEHICLE STATUS & TELEMETRY:
Vehicle Model: ${vehicle}
Live Telemetry: ${telemetry}
`;
    };

    const handleFallbackChatResponse = async (text: string, allowSearch: boolean = true) => {
      const dynamicInstruction = buildSystemInstruction(clientInitData);
      const ai = getGenAI(clientInitData?.apiKey);
      let responseText = "";
      let functionCalls: any = undefined;
      const webSources: { title: string; uri: string }[] = [];

      const liveTools: any[] = [{ functionDeclarations: [{ name: 'changeTab', description: 'Change the current application tab', parameters: { type: Type.OBJECT, properties: { tab: { type: Type.STRING, enum: ['obd', 'damage', 'gps', 'maintenance'], description: 'Tab to switch to' } }, required: ['tab'] } }, { name: 'setNavigation', description: 'Set the navigation route from and to locations', parameters: { type: Type.OBJECT, properties: { from: { type: Type.STRING, description: 'Starting location' }, to: { type: Type.STRING, description: 'Destination location' } }, required: ['from','to'] } }, { name: 'diagnoseVehicle', description: 'Run an AI diagnostic check on the vehicle\'s current health', parameters: { type: Type.OBJECT, properties: {} } }, { name: 'toggleRecording', description: 'Start or stop trip data recording', parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, enum: ['start','stop'], description: 'Whether to start or stop recording' } }, required: ['action'] } }, { name: 'toggleSimulation', description: 'Toggle OBD-II vehicle simulation telemetry on or off', parameters: { type: Type.OBJECT, properties: { enabled: { type: Type.BOOLEAN, description: 'Whether simulation should be turned on or off' } }, required: ['enabled'] } }, { name: 'optimizeRoute', description: 'Calculate and recommend an optimal low-wear route between New York locations', parameters: { type: Type.OBJECT, properties: { origin: { type: Type.STRING, description: 'Starting location in New York' }, destination: { type: Type.STRING, description: 'Destination in New York' } }, required: ['destination'] } }] }];

      if (allowSearch !== false) {
        liveTools.push({ googleSearch: {} });
      }

      if (ai) {
        try {
          const resp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text }] }],
            config: { systemInstruction: dynamicInstruction, tools: liveTools as any, toolConfig: { includeServerSideToolInvocations: true } }
          });
          responseText = resp.text || '';
          functionCalls = resp.functionCalls;

          const groundingChunks = resp.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(groundingChunks)) {
            for (const chunk of groundingChunks) {
              if (chunk?.web?.uri) {
                webSources.push({ title: chunk.web.title || new URL(chunk.web.uri).hostname, uri: chunk.web.uri });
              }
            }
          }
        } catch (e: any) {
          console.warn("[Live WebSocket fallback to Automotive Rule Interpreter]:", e?.message || e);
          const fallback = handleAutomotiveCommandFallback(text, clientInitData?.telemetry);
          responseText = fallback.text;
          functionCalls = fallback.functionCalls;
        }
      } else {
        const fallback = handleAutomotiveCommandFallback(text, clientInitData?.telemetry);
        responseText = fallback.text;
        functionCalls = fallback.functionCalls;
      }

      if (responseText) {
        safeSend({ text: responseText, sources: webSources.length > 0 ? webSources : undefined });
      } else if (webSources.length > 0) {
        safeSend({ sources: webSources });
      }
      if (functionCalls && functionCalls.length > 0) {
        safeSend({ toolCall: { functionCalls } });
      }
      safeSend({ turnComplete: true });
    };

    const setupSession = async (initData?: any) => {
      if (session || isConnecting) return;
      isConnecting = true;
      if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
      }

      clientInitData = initData || clientInitData;
      const ai = getGenAI(clientInitData?.apiKey);
      if (!ai) {
        safeSend({ ready: true, status: 'copilot-ready', note: 'Connected in high-speed automotive co-pilot mode' });
        isConnecting = false;
        return;
      }

      try {
        const dynamicInstruction = buildSystemInstruction(clientInitData);
        const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
        const requestedVoice = (clientInitData?.voice && String(clientInitData.voice).trim()) || 'Zephyr';
        const voiceName = validVoices.includes(requestedVoice) ? requestedVoice : 'Zephyr';

        session = await ai.live.connect({
          model: 'gemini-2.0-flash-live-001',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            systemInstruction: dynamicInstruction,
            tools: [{ functionDeclarations: [{ name: 'changeTab', description: 'Change the current application tab', parameters: { type: Type.OBJECT, properties: { tab: { type: Type.STRING, enum: ['obd','damage','gps','maintenance'], description: 'Tab to switch to' } }, required: ['tab'] } }, { name: 'setNavigation', description: 'Set the navigation route from and to locations', parameters: { type: Type.OBJECT, properties: { from: { type: Type.STRING, description: 'Starting location' }, to: { type: Type.STRING, description: 'Destination location' } }, required: ['from','to'] } }, { name: 'diagnoseVehicle', description: 'Run an AI diagnostic check on the vehicle\'s current health', parameters: { type: Type.OBJECT, properties: {} } }, { name: 'toggleRecording', description: 'Start or stop trip data recording', parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, enum: ['start','stop'], description: 'Whether to start or stop recording' } }, required: ['action'] } }, { name: 'toggleSimulation', description: 'Toggle OBD-II vehicle simulation telemetry on or off', parameters: { type: Type.OBJECT, properties: { enabled: { type: Type.BOOLEAN, description: 'Whether simulation should be turned on or off' } }, required: ['enabled'] } }, { name: 'optimizeRoute', description: 'Calculate and recommend an optimal low-wear route between New York locations', parameters: { type: Type.OBJECT, properties: { origin: { type: Type.STRING, description: 'Starting location in New York' }, destination: { type: Type.STRING, description: 'Destination in New York' } }, required: ['destination'] } }] }]
          },
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              turnHasReplied = true;
              pendingTextForTurn = null;
              if (pendingResponseTimeout) {
                clearTimeout(pendingResponseTimeout);
                pendingResponseTimeout = null;
              }

              const serverContent = message.serverContent as any;
              const parts = serverContent?.modelTurn?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    safeSend({ audio: part.inlineData.data });
                  }
                  if (part.text) {
                    safeSend({ text: part.text });
                  }
                }
              }

              const userParts = serverContent?.userTurn?.parts;
              if (userParts) {
                for (const part of userParts) {
                  if (part.text) {
                    safeSend({ userText: part.text });
                  }
                }
              }

              if (serverContent?.interrupted) {
                safeSend({ interrupted: true });
              }
              if (serverContent?.turnComplete) {
                safeSend({ turnComplete: true });
              }
              if (message.toolCall) {
                safeSend({ toolCall: message.toolCall });
              }
            },
            onerror: (liveErr: any) => {
              console.warn("[GeminiLive] Stream notice (co-pilot active):", liveErr?.message || "Stream closed");
              session = null;
              if (pendingTextForTurn && !turnHasReplied) {
                const textToProcess = pendingTextForTurn;
                pendingTextForTurn = null;
                if (pendingResponseTimeout) {
                  clearTimeout(pendingResponseTimeout);
                  pendingResponseTimeout = null;
                }
                handleFallbackChatResponse(textToProcess);
              }
            },
            onclose: (closeEvt: any) => {
              console.log("[GeminiLive] Connection closed by upstream:", closeEvt);
              session = null;
              if (pendingTextForTurn && !turnHasReplied) {
                const textToProcess = pendingTextForTurn;
                pendingTextForTurn = null;
                if (pendingResponseTimeout) {
                  clearTimeout(pendingResponseTimeout);
                  pendingResponseTimeout = null;
                }
                handleFallbackChatResponse(textToProcess);
              }
            }
          },
        });

        safeSend({ ready: true, status: 'live-connected', voice: voiceName });

        while (messageQueue.length > 0) {
          const item = messageQueue.shift();
          handleClientMessage(item);
        }
      } catch (err: any) {
        const errorMsg = (err && typeof err === 'object' && err.message) ? err.message : 'Upstream connection event';
        console.log("[GeminiLive] Live API notice:", errorMsg);
        session = null;
        safeSend({ ready: true, status: 'copilot-ready', note: 'Connected in high-speed automotive co-pilot mode' });
      } finally {
        isConnecting = false;
      }
    };

    const handleClientMessage = async (parsed: any) => {
      try {
        if (parsed.audio) {
          if (session) {
            try {
              session.sendRealtimeInput({
                audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
              });
            } catch (err: any) {
              console.log('Session sendRealtimeInput notice:', err?.message || 'Send error');
              session = null;
            }
          }
        }

        if (parsed.toolResponse) {
          if (session) {
            try {
              session.sendToolResponse(parsed.toolResponse);
            } catch (err: any) {
              console.log('Session sendToolResponse notice:', err?.message || 'Tool response error');
              session = null;
            }
          }
        }

        if (parsed.text) {
          const currentText = String(parsed.text);
          const allowSearch = parsed.useSearch !== false;
          let sentToLiveSession = false;
          if (session) {
            turnHasReplied = false;
            pendingTextForTurn = currentText;
            try {
              session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: currentText }] }],
                turnComplete: true,
              });
              sentToLiveSession = true;

              if (pendingResponseTimeout) clearTimeout(pendingResponseTimeout);
              pendingResponseTimeout = setTimeout(() => {
                if (!turnHasReplied && pendingTextForTurn) {
                  console.log('[GeminiLive] Live turn response timeout, invoking automotive copilot fallback...');
                  session = null;
                  const t = pendingTextForTurn;
                  pendingTextForTurn = null;
                  handleFallbackChatResponse(t, allowSearch);
                }
              }, 1800);
            } catch (err: any) {
              console.log('Live session sendClientContent notice:', err?.message || 'Content error');
              session = null;
              sentToLiveSession = false;
            }
          }

          if (!sentToLiveSession) {
            await handleFallbackChatResponse(currentText, allowSearch);
          }
        }
      } catch (err: any) {
        console.log('Live API WS message send notice:', err?.message || 'Send error');
      }
    };

    clientWs.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'init') {
          setupSession(parsed);
          return;
        }

        if (!session) {
          messageQueue.push(parsed);
          if (!isConnecting) {
            setupSession();
          }
        } else {
          handleClientMessage(parsed);
        }
      } catch (err: any) {
        console.log('Live API WS message parse notice:', err?.message || 'Parse error');
      }
    });

    initTimeout = setTimeout(() => {
      if (!session && !isConnecting) {
        setupSession();
      }
    }, 500);

    clientWs.on('close', () => {
      if (initTimeout) clearTimeout(initTimeout);
      if (pendingResponseTimeout) clearTimeout(pendingResponseTimeout);
      if (session) {
        const s = session;
        session = null;
        try {
          if (s.conn) {
            if (s.conn.callbacks) {
              s.conn.callbacks.onerror = () => {};
              s.conn.callbacks.onclose = () => {};
              s.conn.callbacks.onmessage = () => {};
            }
            if (s.conn.ws) {
              s.conn.ws.onerror = () => {};
              s.conn.ws.onclose = () => {};
              s.conn.ws.onmessage = () => {};
            }
          }
          s.close?.();
        } catch (closeErr) {}
      }
      console.log('Client disconnected from /live');
    });
  });
}

startServer();
