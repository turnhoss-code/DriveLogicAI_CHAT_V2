import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { Trip } from '../types';
import { cn } from '../lib/utils';

interface TripDamageVibrationTrendChartProps {
  trips: Trip[];
}

interface TrendPoint {
  tripLabel: string;
  dateStr: string;
  damageScore: number;
  avgVibrationRms: number;
  peakGForce: number;
  damageCount: number;
}

export default function TripDamageVibrationTrendChart({ trips }: TripDamageVibrationTrendChartProps) {
  const trendData: TrendPoint[] = useMemo(() => {
    const recentTen = [...trips]
      .sort((a, b) => a.startTime - b.startTime)
      .slice(-10);

    return recentTen.map((trip, index) => {
      const history = trip.damageHistory || [];
      const avgScore = Math.round(trip.averageDamageScore || 0);

      let avgVibration = 0;
      let peakG = 0;

      if (history.length > 0) {
        const sumVib = history.reduce((acc, dp) => {
          const rms =
            dp.vibrationRms !== undefined
              ? dp.vibrationRms
              : dp.gForce !== undefined
              ? dp.gForce * 0.35
              : 0.14 + (dp.score / 100) * 0.42;
          return acc + rms;
        }, 0);
        avgVibration = sumVib / history.length;

        peakG = history.reduce((max, dp) => {
          const g = dp.gForce !== undefined ? dp.gForce : 0.65 + (dp.score / 100) * 1.1;
          return Math.max(max, g);
        }, 0);
      } else {
        avgVibration = 0.14 + (avgScore / 100) * 0.38;
        peakG = 0.7 + (avgScore / 100) * 0.9;
      }

      const d = new Date(trip.startTime);
      return {
        tripLabel: `T${index + 1}`,
        dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        damageScore: avgScore,
        avgVibrationRms: Number(avgVibration.toFixed(2)),
        peakGForce: Number(peakG.toFixed(2)),
        damageCount: history.length,
      };
    });
  }, [trips]);

  const diagnosticStatus = useMemo(() => {
    if (trendData.length < 2) {
      return {
        level: 'normal' as const,
        label: 'Baseline Monitoring',
        detail: 'Log additional trips to compare chassis vibration progression.',
      };
    }

    const recentSlice = trendData.slice(-3);
    const earlierSlice = trendData.slice(0, Math.max(1, trendData.length - 3));

    const recentAvgVib =
      recentSlice.reduce((acc, p) => acc + p.avgVibrationRms, 0) / recentSlice.length;
    const earlierAvgVib =
      earlierSlice.reduce((acc, p) => acc + p.avgVibrationRms, 0) / earlierSlice.length;

    const recentAvgScore =
      recentSlice.reduce((acc, p) => acc + p.damageScore, 0) / recentSlice.length;
    const earlierAvgScore =
      earlierSlice.reduce((acc, p) => acc + p.damageScore, 0) / earlierSlice.length;

    if (recentAvgVib > earlierAvgVib * 1.2 || recentAvgScore > earlierAvgScore + 12 || recentAvgVib >= 0.36) {
      return {
        level: 'warning' as const,
        label: 'Emerging Vibration Trend Detected',
        detail: 'Rising RMS vibration across recent trips — inspect wheel balance, strut mounts, or control arm bushings.',
      };
    }

    return {
      level: 'normal' as const,
      label: 'Stable Chassis & Suspension Trend',
      detail: 'Damage scores and average RMS vibration remain within normal structural thresholds.',
    };
  }, [trendData]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const point: TrendPoint = payload[0].payload;
    return (
      <div className="bg-zinc-950/95 border border-white/15 p-2.5 rounded-xl shadow-2xl backdrop-blur-md text-[10px] font-mono space-y-1">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1">
          <span className="font-bold text-white">{point.tripLabel} • {point.dateStr}</span>
          <span className="text-white/40">{point.damageCount} pts</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-rose-400">
          <span>Damage Score:</span>
          <span className="font-bold">{point.damageScore} / 100</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-purple-400">
          <span>Avg Vibration RMS:</span>
          <span className="font-bold">{point.avgVibrationRms.toFixed(2)} G</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-amber-300">
          <span>Peak Impact Shock:</span>
          <span className="font-bold">{point.peakGForce.toFixed(2)} G</span>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card p-4 rounded-2xl border border-white/10 space-y-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-car-accent/15 text-car-accent border border-car-accent/30">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              10-Trip Damage & Vibration Trend
            </h3>
            <p className="text-[10px] text-white/45 font-mono">
              Longitudinal chassis wear & emerging suspension issue detector
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase bg-white/5 text-white/60 border border-white/10 shrink-0">
          Last {trendData.length} {trendData.length === 1 ? 'Trip' : 'Trips'}
        </span>
      </div>

      {/* Diagnostic Trend Banner */}
      <div
        className={cn(
          'p-2.5 rounded-xl border flex items-start gap-2.5 text-[10px]',
          diagnosticStatus.level === 'warning'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
        )}
      >
        {diagnosticStatus.level === 'warning' ? (
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-0.5">
          <p className="font-bold uppercase tracking-wider font-mono text-[9.5px]">
            {diagnosticStatus.label}
          </p>
          <p className="text-white/70 leading-snug">{diagnosticStatus.detail}</p>
        </div>
      </div>

      {/* Dual-Axis Recharts Line Chart */}
      {trendData.length === 0 ? (
        <div className="h-44 flex flex-col items-center justify-center text-white/30 bg-black/25 rounded-xl border border-white/5">
          <Activity size={20} className="mb-1" />
          <span className="text-[10px] font-mono uppercase">No recorded trips yet</span>
        </div>
      ) : (
        <div className="h-48 w-full bg-black/30 rounded-xl p-2 border border-white/5">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 8, left: -18, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="dateStr"
                stroke="rgba(255,255,255,0.35)"
                tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="score"
                domain={[0, 100]}
                stroke="#ef4444"
                tick={{ fontSize: 9, fill: '#f87171', fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="vibration"
                orientation="right"
                domain={[0, 'auto']}
                stroke="#a855f7"
                tickFormatter={(val) => `${Number(val).toFixed(1)}G`}
                tick={{ fontSize: 9, fill: '#c084fc', fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                width={34}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                yAxisId="score"
                y={50}
                stroke="rgba(239,68,68,0.35)"
                strokeDasharray="3 3"
              />
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="damageScore"
                name="Damage Score"
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#ef4444', stroke: '#090a0f', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#ef4444', stroke: '#ffffff', strokeWidth: 1.5 }}
              />
              <Line
                yAxisId="vibration"
                type="monotone"
                dataKey="avgVibrationRms"
                name="Avg Vibration (G)"
                stroke="#a855f7"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#a855f7', stroke: '#090a0f', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#a855f7', stroke: '#ffffff', strokeWidth: 1.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-between px-1 text-[9px] font-mono text-white/55">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-rose-500 inline-block rounded-full" />
            <span>Trip Damage Score (0–100)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-purple-500 inline-block rounded-full" />
            <span>Avg Vibration RMS (G)</span>
          </span>
        </div>
        <span className="text-white/35">Tap point for peak G</span>
      </div>
    </div>
  );
}
