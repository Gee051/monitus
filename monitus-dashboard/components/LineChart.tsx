"use client";

import { useId, useMemo } from "react";

type LineChartProps = {
  t: number[];
  values: (number | null)[];
  phase: number[];
  revealMinute?: number;
  cursorMinute?: number;
  alarmMinute?: number | null;
  height?: number;
  domain?: [number, number];
  threshold?: number;
  variant?: "sensor" | "risk" | "hero";
  wipe?: boolean;
};

type Band = { phase: number; start: number; end: number };

const WIDTH = 1000;
const PAD = 6;

const buildGeometry = (
  t: number[],
  values: (number | null)[],
  phase: number[],
  height: number,
  domain: [number, number] | undefined,
) => {
  const minT = t[0] ?? 0;
  const maxT = t[t.length - 1] ?? 1;
  const span = Math.max(1, maxT - minT);
  const xOf = (minute: number) => ((minute - minT) / span) * WIDTH;

  const present = values.filter((v): v is number => v != null);
  const lo = domain ? domain[0] : Math.min(...present);
  const hi = domain ? domain[1] : Math.max(...present);
  const range = hi - lo || 1;
  const yOf = (v: number) => height - PAD - ((v - lo) / range) * (height - 2 * PAD);

  const segments = ["", "", ""];
  let prev: { x: number; y: number; phase: number } | null = null;
  for (let i = 0; i < t.length; i += 1) {
    const v = values[i];
    if (v == null) {
      prev = null;
      continue;
    }
    const point = { x: xOf(t[i]), y: yOf(v), phase: phase[i] ?? 0 };
    const coords = `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    if (!prev) {
      segments[point.phase] += `M${coords}`;
    } else if (prev.phase === point.phase) {
      segments[point.phase] += `L${coords}`;
    } else {
      segments[prev.phase] += `L${coords}`;
      segments[point.phase] += `M${prev.x.toFixed(1)} ${prev.y.toFixed(1)}L${coords}`;
    }
    prev = point;
  }

  let all = "";
  let penDown = false;
  for (let i = 0; i < t.length; i += 1) {
    const v = values[i];
    if (v == null) {
      penDown = false;
      continue;
    }
    all += `${penDown ? "L" : "M"}${xOf(t[i]).toFixed(1)} ${yOf(v).toFixed(1)}`;
    penDown = true;
  }

  const firstX = xOf(t[values.findIndex((v) => v != null)] ?? minT);
  const lastIndex = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  const lastX = xOf(t[lastIndex] ?? maxT);
  const area = all ? `${all}L${lastX.toFixed(1)} ${height}L${firstX.toFixed(1)} ${height}Z` : "";

  const bands: Band[] = [];
  let current: Band | null = null;
  for (let i = 0; i < t.length; i += 1) {
    const code = phase[i] ?? 0;
    if (code === 0) {
      current = null;
      continue;
    }
    if (!current || current.phase !== code) {
      current = { phase: code, start: t[i], end: t[i] };
      bands.push(current);
    } else {
      current.end = t[i];
    }
  }

  return { xOf, yOf, segments, all, area, bands, maxT };
};

const LineChart = ({
  t,
  values,
  phase,
  revealMinute,
  cursorMinute,
  alarmMinute = null,
  height = 56,
  domain,
  threshold,
  variant = "sensor",
  wipe = false,
}: LineChartProps) => {
  const clipId = `clip${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const geometry = useMemo(() => buildGeometry(t, values, phase, height, domain), [t, values, phase, height, domain]);
  const { xOf, yOf, segments, all, area, bands } = geometry;

  const stripHeight = height > 100 ? 6 : 4;
  const clampX = (x: number) => Math.min(WIDTH, Math.max(0, x));
  const revealX = revealMinute == null ? WIDTH : clampX(xOf(revealMinute));
  const cursorX = cursorMinute == null ? null : clampX(xOf(cursorMinute));
  const alarmVisible = alarmMinute != null && (revealMinute == null || revealMinute >= alarmMinute);

  return (
    <svg
      className={`chart chart-${variant}`}
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={revealX} height={height} className={wipe ? "wipe" : undefined} />
        </clipPath>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={WIDTH} y1={height * f} y2={height * f} className="grid" vectorEffect="non-scaling-stroke" />
      ))}
      <g clipPath={`url(#${clipId})`}>
        {bands.map((band) => {
          const x = xOf(band.start);
          const width = Math.max(1, xOf(band.end) - x);
          const kind = band.phase === 1 ? "developing" : "full";
          return (
            <g key={`${band.phase}-${band.start}`}>
              <rect x={x} y={0} width={width} height={height} className={`band-${kind}`} />
              <rect x={x} y={height - stripHeight} width={width} height={stripHeight} className={`strip-${kind}`} />
            </g>
          );
        })}
        {variant === "risk" ? (
          <>
            <path d={area} className="risk-area" />
            <path d={all} className="risk-line" vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          segments.map((d, code) =>
            d ? <path key={code} d={d} className={`trace trace-${code}`} vectorEffect="non-scaling-stroke" /> : null,
          )
        )}
      </g>
      {threshold != null && (
        <line
          x1={0}
          x2={WIDTH}
          y1={yOf(threshold)}
          y2={yOf(threshold)}
          className="threshold"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {alarmVisible && alarmMinute != null && (
        <line
          x1={xOf(alarmMinute)}
          x2={xOf(alarmMinute)}
          y1={0}
          y2={height}
          className={wipe ? "alarm-line alarm-late" : "alarm-line"}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {cursorX != null && (
        <line x1={cursorX} x2={cursorX} y1={0} y2={height} className="playhead" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
};

export default LineChart;
