"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import LineChart from "./LineChart";
import type { Demo, Summary } from "../lib/monitus";
import { formatHours, formatPercent, formatWarning, loadJson } from "../lib/monitus";

const HERO_SENSORS = ["P-TPT", "P-MON-CKP", "T-TPT", "P-PDG"];
const WIPE_SECONDS = 2.6;
const WIPE_DELAY = 0.3;

const pickHeroDemo = (summary: Summary): string | null =>
  summary.demos.find((d) => d.id === "hydrate")?.id ?? summary.demos.find((d) => d.outcome === "caught")?.id ?? null;

const pinStyle = (at: number): CSSProperties => {
  if (at > 85) return { left: `${at}%`, transform: "translateX(-100%)" };
  if (at < 15) return { left: `${at}%`, transform: "translateX(0)" };
  return { left: `${at}%` };
};

const HeroScreen = ({ demo }: { demo: Demo }) => {
  const working = demo.sensors.filter((s) => !s.missing);
  const sensor =
    working.find((s) => s.name === demo.heroSensor) ??
    HERO_SENSORS.map((name) => working.find((s) => s.name === name)).find(Boolean) ??
    working[0];
  if (!sensor) return null;

  const start = demo.t[0] ?? 0;
  const end = demo.t[demo.t.length - 1] ?? 1;
  const at = (minute: number) => ((minute - start) / Math.max(1, end - start)) * 100;
  const alarmAt = demo.alarmMinute != null ? at(demo.alarmMinute) : null;
  const fullAt = demo.fullStartMinute != null ? at(demo.fullStartMinute) : null;
  const revealDelay = alarmAt != null ? WIPE_DELAY + (WIPE_SECONDS * alarmAt) / 100 : WIPE_DELAY + WIPE_SECONDS;

  const style = {
    "--wipe-seconds": `${WIPE_SECONDS}s`,
    "--wipe-delay": `${WIPE_DELAY}s`,
    "--reveal-delay": `${revealDelay.toFixed(2)}s`,
  } as CSSProperties;

  return (
    <figure className="hero-screen" style={style}>
      <div className="screen-head">
        <span className="screen-title">{demo.faultName}</span>
        <span className="screen-sub">
          Well {demo.well}. {sensor.label} ({sensor.name})
        </span>
      </div>
      <div className="hero-plot">
        <LineChart
          t={demo.t}
          values={sensor.values}
          phase={demo.phase}
          alarmMinute={demo.alarmMinute}
          height={220}
          variant="hero"
          wipe
        />
        {alarmAt != null && fullAt != null && (
          <div className="warning-span" style={{ left: `${alarmAt}%`, width: `${Math.max(0, fullAt - alarmAt)}%` }}>
            <span className="warning-label">{formatWarning(demo.warningMinutes)} of warning</span>
          </div>
        )}
        {alarmAt != null && (
          <span className="pin pin-alarm" style={pinStyle(alarmAt)}>
            Monitus alarm
          </span>
        )}
        {fullAt != null && (
          <span className="pin pin-full" style={pinStyle(fullAt)}>
            {demo.fault === 8 || demo.fault === 9 ? "Line blocked" : "Full swing"}
          </span>
        )}
      </div>
      <figcaption className="screen-foot">
        <span>
          <i className="key key-developing" aria-hidden="true" /> Fault developing (expert label)
        </span>
        <span>
          <i className="key key-full" aria-hidden="true" /> Full swing
        </span>
        <span>Replayed from a real Petrobras recording the model never saw in training</span>
      </figcaption>
    </figure>
  );
};

const Hero = ({ summary }: { summary: Summary }) => {
  const [demo, setDemo] = useState<Demo | null>(null);
  const demoId = pickHeroDemo(summary);

  useEffect(() => {
    if (!demoId) return;
    let cancelled = false;
    loadJson<Demo>(`/data/demo-${demoId}.json`)
      .then((data) => {
        if (!cancelled) setDemo(data);
      })
      .catch(() => {
        if (!cancelled) setDemo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [demoId]);

  const byId = new Map(summary.faults.map((f) => [f.id, f]));
  const valve = byId.get(2);
  const hydrate = byId.get(8);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap">
        <div className="hero-copy">
          <h1 id="hero-title">Warning before the well stops flowing</h1>
          <p className="lead">
            Monitus reads pressure and temperature sensors on an offshore well and raises the alarm while a fault
            is still developing, often hours before it peaks.
          </p>
          <div className="actions">
            <a className="button button-primary" href="#replay">
              Watch a replay
            </a>
            <a className="button" href="#results">
              See the results
            </a>
          </div>
        </div>

        {demo ? <HeroScreen demo={demo} /> : <div className="hero-screen hero-screen-empty" aria-hidden="true" />}

        <dl className="kpis">
          <div>
            <dt>False alarms a day on normal operation</dt>
            <dd>{summary.falseAlarmsPerDay.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Safety-valve closures flagged early</dt>
            <dd>{formatPercent(valve?.caughtEarly)}</dd>
          </div>
          <div>
            <dt>Median warning before a hydrate peaks</dt>
            <dd>{formatHours(hydrate?.medianWarningMinutes)}</dd>
          </div>
          <div>
            <dt>Real wells, each tested unseen</dt>
            <dd>{summary.realWells}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
};

export default Hero;
