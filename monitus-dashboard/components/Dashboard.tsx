"use client";

import { useEffect, useState } from "react";
import LineChart from "./LineChart";

type Sensor = {
  name: string;
  unit: string;
  label: string;
  values: (number | null)[];
  missing: boolean;
};

type Demo = {
  id: string;
  outcome: "caught" | "quiet" | "missed";
  fault: number;
  faultName: string;
  well: string;
  file: string;
  startTime: string;
  durationMinutes: number;
  threshold: number;
  persistence: number;
  t: number[];
  phase: number[];
  risk: (number | null)[];
  sensors: Sensor[];
  alarmMinute: number | null;
  developingStartMinute: number | null;
  fullStartMinute: number | null;
  warningMinutes: number | null;
  predictedFault: number | null;
  predictedFaultName: string | null;
  why: string[];
};

type FaultScore = {
  id: number;
  name: string;
  recordings: number;
  caught: number;
  caughtEarly: number | null;
  medianWarningMinutes: number | null;
};

type Summary = {
  setting: { threshold: number; persistence: number };
  falseAlarmsPerDay: number;
  realWells: number;
  faults: FaultScore[];
  demos: { id: string; title: string; outcome: string }[];
};

type Speed = {
  label: string;
  minutesPerSecond: number | null;
};

const GITHUB_URL = "https://github.com/your-username/monitus";
const LINKEDIN_URL = "https://www.linkedin.com/in/your-profile";
const DATASET_URL = "https://github.com/petrobras/3W";
const TICK_MS = 50;
const SPEEDS: Speed[] = [
  { label: "Auto (about 20 seconds)", minutesPerSecond: null },
  { label: "1 hour per second", minutesPerSecond: 60 },
  { label: "6 hours per second", minutesPerSecond: 360 },
  { label: "1 day per second", minutesPerSecond: 1440 },
];
const PHASE_LABELS = ["Normal operation", "Fault developing", "Fault in full swing"];

const formatDuration = (minutes: number | null | undefined): string => {
  if (minutes == null) return "n/a";
  const total = Math.round(minutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (mins || !parts.length) parts.push(`${mins} min`);
  return parts.join(" ");
};

const formatPercent = (value: number | null | undefined): string =>
  value == null ? "n/a" : `${Math.round(value * 100)}%`;

const lastIndexAtOrBefore = (t: number[], minute: number): number => {
  let lo = 0;
  let hi = t.length - 1;
  let answer = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (t[mid] <= minute) {
      answer = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer;
};

const readingAt = (values: (number | null)[], index: number, unit: string): string => {
  const value = values[index];
  return value == null ? "no reading" : `${value.toFixed(1)} ${unit}`;
};

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : "Something went wrong.");

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div className="metric">
    <p className="metric-label">{label}</p>
    <p className="metric-value">{value}</p>
  </div>
);

const StatusCard = ({ demo, minute, cursorIndex }: { demo: Demo; minute: number; cursorIndex: number }) => {
  const phase = demo.phase[cursorIndex];
  const alarmOn = demo.alarmMinute != null && minute >= demo.alarmMinute;
  const fullReached = demo.fullStartMinute != null && minute >= demo.fullStartMinute;
  const finished = minute >= demo.t[demo.t.length - 1];

  if (alarmOn) {
    return (
      <div className="status status-alert" role="status">
        <p className="status-title">Alert: trouble developing</p>
        {demo.predictedFaultName && <p>Most likely: {demo.predictedFaultName}</p>}
        {demo.why.length > 0 && (
          <ul className="why">
            {demo.why.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        <p className="status-note">
          {fullReached
            ? `Full swing reached. Monitus warned ${formatDuration(demo.warningMinutes)} ahead.`
            : "The fault hasn't reached full swing yet."}
        </p>
      </div>
    );
  }

  if (demo.outcome === "missed" && finished) {
    return (
      <div className="status status-watch" role="status">
        <p className="status-title">No alert raised</p>
        <p>
          Monitus missed this case. {demo.faultName} is a known weak spot: in these sensors it looks very
          similar to normal operation. The scorecard below shows every weak spot.
        </p>
      </div>
    );
  }

  if (demo.outcome === "quiet" && finished) {
    return (
      <div className="status status-ok" role="status">
        <p className="status-title">No alerts</p>
        <p>Monitus stayed quiet through {formatDuration(demo.durationMinutes)} of normal operation.</p>
      </div>
    );
  }

  if (phase > 0) {
    return (
      <div className="status status-watch" role="status">
        <p className="status-title">{PHASE_LABELS[phase]} (expert label)</p>
        <p>Monitus hasn&apos;t raised an alert yet.</p>
      </div>
    );
  }

  return (
    <div className="status" role="status">
      <p className="status-title">Monitoring</p>
      <p>All readings look normal so far.</p>
    </div>
  );
};

const Scorecard = ({ summary }: { summary: Summary }) => {
  const byId = new Map(summary.faults.map((fault) => [fault.id, fault]));
  const valve = byId.get(2);
  const hydrate = byId.get(8);

  return (
    <section className="card">
      <h2>Results on wells the model never saw</h2>
      <p className="muted">
        Five-fold cross-validation across {summary.realWells} real wells. Every score comes from wells held out of
        training.
      </p>
      <div className="metrics">
        <MetricCard label="False alarms per day" value={summary.falseAlarmsPerDay.toFixed(2)} />
        <MetricCard label="Valve closures caught early" value={formatPercent(valve?.caughtEarly)} />
        <MetricCard label="Hydrates caught early" value={formatPercent(hydrate?.caughtEarly)} />
        <MetricCard label="Median hydrate warning" value={formatDuration(hydrate?.medianWarningMinutes)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fault</th>
              <th>Real recordings</th>
              <th>Caught early</th>
              <th>Caught at all</th>
              <th>Median warning</th>
            </tr>
          </thead>
          <tbody>
            {summary.faults.map((fault) => (
              <tr key={fault.id}>
                <td>{fault.name}</td>
                <td>{fault.recordings}</td>
                <td>{fault.caughtEarly == null ? "No developing phase" : formatPercent(fault.caughtEarly)}</td>
                <td>{formatPercent(fault.caught)}</td>
                <td>{formatDuration(fault.medianWarningMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Alarm setting: {Math.round(summary.setting.threshold * 100)}% confidence held for{" "}
        {summary.setting.persistence} minutes. It was chosen on these same results, so the numbers are slightly
        optimistic. Faults with only a few real recordings are uncertain.
      </p>
    </section>
  );
};

const About = () => (
  <section className="card about">
    <h2>About Monitus</h2>
    <p>
      Monitus watches five pressure and temperature sensors on offshore wells and learns the patterns that appear
      before faults such as hydrate blockages, valve closures and scaling. It is decision support: it warns
      engineers early and never controls anything.
    </p>
    <p>
      Built on Petrobras&apos; public <a href={DATASET_URL}>3W dataset</a> (data licensed CC BY 4.0). Not
      affiliated with or endorsed by Petrobras or any operator. It was trained on Brazilian wells, so an operator
      would retrain it on its own data before use.
    </p>
    <p>
      Built by Otuagha Grace · <a href={GITHUB_URL}>Code on GitHub</a> · <a href={LINKEDIN_URL}>LinkedIn</a>
    </p>
  </section>
);

const Dashboard = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [demoId, setDemoId] = useState<string | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/summary.json")
      .then((response) => {
        if (!response.ok) throw new Error("Couldn't load the results. Run export_demo.py first.");
        return response.json() as Promise<Summary>;
      })
      .then((data) => {
        setSummary(data);
        if (data.demos[0]) setDemoId(data.demos[0].id);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!demoId) return;
    let cancelled = false;
    fetch(`/data/demo-${demoId}.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Couldn't load this recording.");
        return response.json() as Promise<Demo>;
      })
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

  const end = demo ? demo.t[demo.t.length - 1] : 0;
  const finished = demo != null && minute >= end;
  const minutesPerSecond = SPEEDS[speedIndex].minutesPerSecond ?? Math.max(1, end / 20);
  const cursorIndex = demo ? lastIndexAtOrBefore(demo.t, minute) : 0;

  useEffect(() => {
    if (!playing || !demo || finished) return;
    const step = (minutesPerSecond * TICK_MS) / 1000;
    const timer = setInterval(() => {
      setMinute((current) => Math.min(end, current + step));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, demo, finished, minutesPerSecond, end]);

  const selectDemo = (id: string) => {
    setPlaying(false);
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

  const buttonLabel = finished ? "Replay" : playing ? "Pause" : "Play";

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Monitus</p>
        <h1>Early warning for offshore oil wells</h1>
        <p className="lead">
          Replay real well recordings and see when Monitus would have raised the alarm, compared with what experts
          later labelled.
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      {summary && (
        <section className="card">
          <div className="controls">
            <label>
              Recording
              <select value={demoId ?? ""} onChange={(event) => selectDemo(event.target.value)}>
                {summary.demos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Speed
              <select value={speedIndex} onChange={(event) => setSpeedIndex(Number(event.target.value))}>
                {SPEEDS.map((speed, index) => (
                  <option key={speed.label} value={index}>
                    {speed.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="play" onClick={handlePlay}>
              {buttonLabel}
            </button>
          </div>

          {demo ? (
            <>
              <p className="meta">
                Well {demo.well} · {demo.faultName} · recorded {demo.startTime.slice(0, 10)} · elapsed{" "}
                {formatDuration(minute)} of {formatDuration(end)}
              </p>
              <input
                type="range"
                className="scrub"
                min={0}
                max={end}
                step={1}
                value={Math.round(minute)}
                onChange={(event) => {
                  setPlaying(false);
                  setMinute(Number(event.target.value));
                }}
                aria-label="Replay position"
              />
              <StatusCard demo={demo} minute={minute} cursorIndex={cursorIndex} />
              <div className="legend">
                <span>
                  <i className="swatch swatch-developing" /> Fault developing (expert label)
                </span>
                <span>
                  <i className="swatch swatch-full" /> Fault in full swing
                </span>
                <span>
                  <i className="swatch swatch-alarm" /> Monitus alert
                </span>
              </div>
              <div className="charts">
                {demo.sensors.map((sensor) => (
                  <div className="chart-row" key={sensor.name}>
                    <div className="chart-label">
                      <span className="sensor-name">{sensor.name}</span>
                      <span className="sensor-desc">{sensor.label}</span>
                      {!sensor.missing && (
                        <span className="sensor-value">{readingAt(sensor.values, cursorIndex, sensor.unit)}</span>
                      )}
                    </div>
                    {sensor.missing ? (
                      <div className="missing">Sensor missing in this recording. Monitus works with the rest.</div>
                    ) : (
                      <LineChart
                        t={demo.t}
                        values={sensor.values}
                        phase={demo.phase}
                        cursorIndex={cursorIndex}
                        cursorMinute={minute}
                        alarmMinute={demo.alarmMinute}
                      />
                    )}
                  </div>
                ))}
                <div className="chart-row">
                  <div className="chart-label">
                    <span className="sensor-name">Trouble risk</span>
                    <span className="sensor-desc">How sure Monitus is that something is wrong</span>
                    <span className="sensor-value">{formatPercent(demo.risk[cursorIndex])}</span>
                  </div>
                  <LineChart
                    t={demo.t}
                    values={demo.risk}
                    phase={demo.phase}
                    cursorIndex={cursorIndex}
                    cursorMinute={minute}
                    alarmMinute={demo.alarmMinute}
                    domain={[0, 1]}
                    threshold={demo.threshold}
                    height={64}
                    variant="risk"
                  />
                </div>
              </div>
              <p className="note">
                Dashed line: alarm threshold ({Math.round(demo.threshold * 100)}% confidence, held{" "}
                {demo.persistence} minutes).
              </p>
            </>
          ) : (
            <p className="muted">Loading recording…</p>
          )}
        </section>
      )}

      {summary && <Scorecard summary={summary} />}
      <About />
    </main>
  );
};

export default Dashboard;