# Implementation Plan: 10-Trip Damage & Vibration Trend Chart, Expanded GPS Hazard/Weather/Telemetry HUD, and Overlay Layout Fixes

## Overview
1. **10-Trip Damage & Vibration Trend Chart (`src/components/TripDamageVibrationTrendChart.tsx`)**: A Recharts dual-axis line chart visualizing trip damage scores and average accelerometer vibration levels (RMS G) over the last 10 trips to identify emerging vehicle issues, placed below the Live Damage Score gauge and above Trip History.
2. **Waze & Web In-Route Hazard Icons + Discreet Weather & Speed/RPM HUD on Expanded GPS Maps (`FloatingMap.tsx` & `GPSTab.tsx`)**: Auto-populate Waze/511/web hazard icons for **speed traps**, **road work**, and **emergency site locations** directly along the active route, paired with a discreet translucent HUD displaying live **weather data** and **speed/RPM telemetry** whenever the GPS navigation map is expanded.
3. **Overlay & Layout Collision Fixes (`LiveChatAssistant.tsx`, `FloatingMap.tsx`, `OBDTab.tsx`, `DamageLogTab.tsx`, `App.tsx`)**: Position floating buttons on opposite sides above the bottom navigation bar with generous page padding (`pb-40`) and keep pre-existing gauges unobstructed at the top of their tabs.

---

## 1. Recharts 10-Trip Damage & Vibration Trend Sub-Component (`src/components/TripDamageVibrationTrendChart.tsx`)
- **Data Processing**:
  - Take the last 10 trips from `trips` (ordered oldest to newest) and compute each trip's **Damage Score** (`0–100`), **Average Vibration RMS (`G`)**, and **Peak Shock (`G`)**.
  - Compute a trend diagnostic badge comparing the most recent 3 trips to earlier trips (e.g., *"Stable Chassis Trend"* vs. *"Emerging Issue: Rising Vibration — Inspect Suspension / Wheel Bearings"*).
- **Recharts LineChart**:
  - Dual Y-Axes (`yAxisId="score"` for Damage Score `0–100`, `yAxisId="vibration"` for Average Vibration `G`).
  - Two distinct `Line` series with custom dark-cockpit tooltip and threshold `ReferenceLine`.

---

## 2. Auto-Populated Waze/Web In-Route Icons + Discreet Weather & Speed/RPM HUD (`src/services/hazardService.ts`, `src/components/FloatingMap.tsx`, `src/components/GPSTab.tsx`)
- **In-Route Coordinate Anchoring**:
  - Enhance `fetchLiveTrafficHazards` / route hazard mapping so that when a route (`calculatedRoute.path`) is active, Waze and web-sourced hazards (**Speed Traps** `👮`, **Road Work** `🚧`, **Emergency Site Locations** `🚑`, **Accidents** `💥`, and **Weather Hazards** `🌧️`) are automatically snapped/interpolated along the active route polyline so icons appear directly in-route.
- **Discreet Expanded Map HUD (`FloatingMap.tsx` & `GPSTab.tsx`)**:
  - Pass `speed={obdData.speed}` and `rpm={obdData.rpm}` from `App.tsx` into both `FloatingMap` and `GPSTab`.
  - When the GPS navigation map is expanded (`!isMini` in `FloatingMap` or expanded view in `GPSTab`):
    - Auto-populate distinct map markers for **Speed Traps**, **Road Work**, and **Emergency Sites** along the route with clickable `InfoWindow` popups showing the Waze/web source, delay, and alert details.
    - Render a **discreet, low-profile translucent HUD strip** along the edge of the expanded map displaying:
      - **Live Speed (`MPH`) & Engine (`RPM`)** micro-badges
      - **Live Route Weather** (Temp `°F`, sky/road condition, and surface traction)
      - **In-Route Hazard Counts** (Speed Traps, Road Work, Emergency Sites)

---

## 3. Overlay & Card Layout Fixes (`DamageLogTab.tsx`, `OBDTab.tsx`, `LiveChatAssistant.tsx`, `App.tsx`)
- **Preserve Pre-Existing Gauges**:
  - In `DamageLogTab.tsx`, keep the **Live Damage Score** circular gauge and live sensor waveforms at the top, followed by `TripDamageVibrationTrendChart`, the **Accelerometer Vibration & Trip Damage Plotter**, and **Saved Trip Damage Logs**.
  - In `OBDTab.tsx`, keep the **Vehicle Health Index** and **RPM/Speed** gauges at the top, placing the **ELM327 BLE Auto-Sense Protocol Engine** card below them.
- **Non-Overlapping Floating Controls**:
  - Dock the **Drive Logic Live** launcher at `fixed bottom-20 left-4 z-40` and the **Floating Map** launcher at `fixed bottom-20 right-4 z-40` (above the bottom navigation bar on opposite sides) and increase `<main>` bottom padding to `pb-40`.
