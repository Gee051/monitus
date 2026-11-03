"use client";

import { useEffect, useRef, useState } from "react";
import LineChart from "./LineChart";
import RiskDial from "./RiskDial";
import type { Demo, Sensor, Summary } from "../lib/monitus";
import {
  DEMO_LABELS,
  errorMessage,
  formatDuration,
  formatWarning,
  lastIndexAtOrBefore,
  loadJson,
} from "../lib/monitus";

type Speed = { label: string; minutesPerSecond: number | null };

const TICK_MS = 50;
const RISK_DOMAIN: [number, number] = [0, 1];
const SPEEDS: Speed[] = [
  { label: "Whole recording in 20 s", minutesPerSecond: null },
  { label: "1 hour a second", minutesPerSecond: 60 },
  { label: "6 hours a second", minutesPerSecond: 360 },
  { label: "1 day a second", minutesPerSecond: 1440 },
];

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);

const isNotRecorded = (sensor: Sensor): boolean =>
  sensor.missing && (!sensor.note || sensor.note.startsWith("No signal"));

const statusWord = (sensor: Sensor): string => {
  if (isNotRecorded(sensor)) return "no data";
  return sensor.note?.startsWith("Read zero") ? "offline" : "faulty";
};

const missingText = (sensor: Sensor, sensors: Sensor[]): string => {
  if (!isNotRecorded(sensor)) return sensor.note ?? "This sensor was faulty in this recording.";
  const scoredFrom = sensors.filter((s) => !isNotRecorded(s)).length;
  return `No data recorded for this well. Monitus scored it from the other ${countWord(scoredFrom)}.`;
};

const readingAt = (values: (number | null)[], index: number): string => {
  const value = values[index];
  return value == null ? "--" : value.toFixed(1);
};

type StatusProps = { demo: Demo; minute: number; cursorIndex: number; finished: boolean };

const Status = ({ demo, minute, cursorIndex, finished }: StatusProps) => {
  const phase = demo.phase[cursorIndex] ?? 0;
  const alarmOn = demo.alarmMinute != null && minute >= demo.alarmMinute;
  const fullReached = demo.fullStartMinute != null && minute >= demo.fullStartMinute;

  if (alarmOn) {
    return (
      <div className="status status-alarm" role="status">
        <p className="status-title">
          <span className="lamp" aria-hidden="true" /> Alarm: trouble developing
        </p>
        {demo.predictedFaultName && (
          <p className="status-line">
            {demo.predictedFault === demo.fault
              ? `Looks like: ${demo.predictedFaultName}`
              : `First guess: ${demo.predictedFaultName}. Right that something was wrong, wrong about which fault.`}
          </p>
        )}
        {demo.why.length > 0 && (
          <>
            <p className="status-sub">What moved in the last hour</p>
            <ul className="why">
              {demo.why.map((reason) => (
                <li key={reason}>{reason.replace(/ in the last hour$/, "")}</li>
              ))}
            </ul>
          </>
        )}
        <p className="status-note">
          {fullReached
            ? `Full swing reached. Monitus raised the alarm ${formatWarning(demo.warningMinutes)} earlier.`
            : "The fault hasn't reached full swing yet."}
        </p>
      </div>
    );
  }

  if (demo.outcome === "missed" && finished) {
    return (
      <div className="status status-missed" role="status">
        <p className="status-title">No alarm raised</p>
        <p className="status-line">
          This one got past Monitus. {demo.faultName} barely moves these five sensors, so it looks a lot like normal
          running. The results below show every weak spot.
        </p>
      </div>
    );
  }

  if (demo.outcome === "quiet" && finished) {
    return (
      <div className="status status-quiet" role="status">
        <p className="status-title">No alarms</p>
        <p className="status-line">
          Monitus stayed quiet through {formatDuration(demo.t[demo.t.length - 1] - demo.t[0])} of normal running.
        </p>
      </div>
    );
  }

  if (phase > 0) {
    return (
      <div className="status status-developing" role="status">
        <p className="status-title">{phase === 1 ? "Fault developing" : "Fault in full swing"}</p>
        <p className="status-line">Experts later labelled this stretch. Monitus hasn&apos;t raised an alarm yet.</p>
      </div>
    );
  }

  return (
    <div className="status" role="status">
      <p className="status-title">Monitoring</p>
      <p className="status-line">All readings look normal so far.</p>
    </div>
  );
};

const Replay = ({ summary }: { summary: Summary }) => {
  const [demoId, setDemoId] = useState<string | null>(() => summary.demos[0]?.id ?? null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const autoplayed = useRef(false);

  useEffect(() => {
    if (!demoId) return;
    let cancelled = false;
    loadJson<Demo>(`/data/demo-${demoId}.json`)
      .then((data) => {
        if (!cancelled) setDemo(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [demoId]);

  useEffect(() => {
    const node = consoleRef.current;
    if (!demo || !node || autoplayed.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          autoplayed.current = true;
          setPlaying(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [demo]);

  const start = demo ? demo.t[0] : 0;
  const end = demo ? demo.t[demo.t.length - 1] : 0;
  const shown = Math.min(end, Math.max(minute, start));
  const finished = demo != null && shown >= end;
  const minutesPerSecond = SPEEDS[speedIndex].minutesPerSecond ?? Math.max(1, (end - start) / 20);
  const cursorIndex = demo ? lastIndexAtOrBefore(demo.t, shown) : 0;

  useEffect(() => {
    if (!playing || !demo || finished) return;
    const step = (minutesPerSecond * TICK_MS) / 1000;
    const timer = setInterval(() => {
      setMinute((current) => Math.min(end, Math.max(current, start) + step));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, demo, finished, minutesPerSecond, start, end]);

  const selectDemo = (id: string) => {
    if (id === demoId) return;
    autoplayed.current = true;
    setPlaying(true);
    setDemo(null);
    setMinute(0);
    setDemoId(id);
  };

  const handlePlay = () => {
    if (!demo) return;
    if (finished) {
      setMinute(0);
      setPlaying(true);
      return;
    }
    setPlaying((current) => !current);
  };

  const alarmOn = demo != null && demo.alarmMinute != null && shown >= demo.alarmMinute;
  const buttonLabel = finished ? "Replay" : playing ? "Pause" : "Play";

  return (
    <section id="replay" className="section" aria-labelledby="replay-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="replay-title">Replay a real well</h2>
          <p>
            Pick a recording and press play. The shaded stretches are what experts labelled afterwards. The red line is
            the moment Monitus raised the alarm, using only what it had seen up to then.
          </p>
        </div>

        <div className={`console${alarmOn ? " console-alarm" : ""}`} ref={consoleRef}>
          <div className="console-tabs" role="group" aria-label="Recordings">
            {summary.demos.map((item) => {
              const label = DEMO_LABELS[item.id] ?? { short: item.title, tag: "" };
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === demoId}
                  className={`tab tab-${item.outcome}`}
                  onClick={() => selectDemo(item.id)}
                >
                  <span className="tab-name">{label.short}</span>
                  <span className="tab-tag">{label.tag}</span>
                </button>
              );
            })}
          </div>

          {error && <p className="console-error">{error}</p>}

          {demo ? (
            <>
              <div className="console-bar">
                <button type="button" className="play" onClick={handlePlay} aria-label={buttonLabel}>
                  <span className={`play-icon ${playing && !finished ? "is-pause" : ""}`} aria-hidden="true" />
                  <span className="play-text">{buttonLabel}</span>
                </button>
                <div className="scrubber">
                  <input
                    type="range"
                    min={start}
                    max={end}
                    step={1}
                    value={Math.round(shown)}
                    onChange={(event) => {
                      setPlaying(false);
                      setMinute(Number(event.target.value));
                    }}
                    aria-label="Replay position"
                  />
                  <div className="clock">
                    <span>{formatDuration(shown)}</span>
                    <span className="clock-total">of {formatDuration(end)}</span>
                  </div>
                </div>
                <label className="speed">
                  <span>Speed</span>
                  <select value={speedIndex} onChange={(event) => setSpeedIndex(Number(event.target.value))}>
                    {SPEEDS.map((speed, index) => (
                      <option key={speed.label} value={index}>
                        {speed.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="console-body">
                <div className="strips">
                  {demo.sensors.map((sensor) => (
                    <div className="strip" key={sensor.name}>
                      <div className="strip-label">
                        <span className="strip-name">{sensor.name}</span>
                        <span className="strip-desc">{sensor.label}</span>
                      </div>
                      {sensor.missing ? (
                        <div className="strip-missing">{missingText(sensor, demo.sensors)}</div>
                      ) : (
                        <LineChart
                          t={demo.t}
                          values={sensor.values}
                          phase={demo.phase}
                          revealMinute={shown}
                          cursorMinute={shown}
                          alarmMinute={demo.alarmMinute}
                        />
                      )}
                      <div className="strip-value">
                        {sensor.missing ? (
                          <span className="value-off">{statusWord(sensor)}</span>
                        ) : (
                          <>
                            <span className="value-number">{readingAt(sensor.values, cursorIndex)}</span>
                            <span className="value-unit">{sensor.unit}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="strip strip-risk">
                    <div className="strip-label">
                      <span className="strip-name">Trouble risk</span>
                      <span className="strip-desc">Alarm when above the dashed line for {demo.persistence} minutes</span>
                    </div>
                    <LineChart
                      t={demo.t}
                      values={demo.risk}
                      phase={demo.phase}
                      revealMinute={shown}
                      cursorMinute={shown}
                      alarmMinute={demo.alarmMinute}
                      domain={RISK_DOMAIN}
                      threshold={demo.threshold}
                      height={72}
                      variant="risk"
                    />
                    <div className="strip-value" />
                  </div>
                </div>

                <aside className="console-side">
                  <RiskDial risk={demo.risk[cursorIndex] ?? null} threshold={demo.threshold} alarmOn={alarmOn} />
                  <Status demo={demo} minute={shown} cursorIndex={cursorIndex} finished={finished} />
                  <dl className="facts">
                    <div>
                      <dt>Well</dt>
                      <dd>{demo.well}</dd>
                    </div>
                    <div>
                      <dt>Recorded</dt>
                      <dd>{demo.startTime.slice(0, 10)}</dd>
                    </div>
                    <div>
                      <dt>Expert label</dt>
                      <dd>{demo.faultName}</dd>
                    </div>
                  </dl>
                </aside>
              </div>
            </>
          ) : (
            !error && <div className="console-loading">Loading recording</div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Replay;
