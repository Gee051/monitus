import type { FaultScore, Summary } from "../lib/monitus";
import { formatPercent, formatWarning } from "../lib/monitus";

const rank = (fault: FaultScore) => fault.caughtEarly ?? fault.caught - 1;

const Row = ({ fault }: { fault: FaultScore }) => {
  const early = fault.caughtEarly;
  const value = early ?? fault.caught;
  const strong = (early ?? 0) >= 0.3;

  return (
    <li className={`fault ${strong ? "fault-strong" : "fault-weak"}`}>
      <div className="fault-name">
        <span>{fault.name}</span>
        <span className="fault-count">
          {fault.recordings} real recording{fault.recordings === 1 ? "" : "s"}
        </span>
      </div>
      <div className="fault-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(0.5, value * 100)}%` }} />
      </div>
      <div className="fault-figure">
        <span className="fault-percent">{formatPercent(value)}</span>
        <span className="fault-caption">{early == null ? "caught at all" : "caught early"}</span>
      </div>
      <div className="fault-warning">
        {fault.medianWarningMinutes != null && early != null && early > 0 ? (
          <>
            <span className="fault-percent">{formatWarning(fault.medianWarningMinutes)}</span>
            <span className="fault-caption">median warning</span>
          </>
        ) : (
          <span className="fault-caption">
            {early == null ? "No developing stage in the labels" : "No early warning yet"}
          </span>
        )}
      </div>
    </li>
  );
};

const Results = ({ summary }: { summary: Summary }) => {
  const faults = [...summary.faults].sort((a, b) => rank(b) - rank(a));

  return (
    <section id="results" className="section section-paper" aria-labelledby="results-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="results-title">How often it catches each fault</h2>
          <p>
            Every number comes from wells held out of training, across {summary.realWells} real wells. The alarm fires
            at {Math.round(summary.setting.threshold * 100)}% confidence held for {summary.setting.persistence} minutes,
            which keeps false alarms to {summary.falseAlarmsPerDay.toFixed(2)} a day.
          </p>
        </div>

        <ol className="faults">
          {faults.map((fault) => (
            <Row key={fault.id} fault={fault} />
          ))}
        </ol>

        <div className="limits">
          <h3>What it can&apos;t do yet</h3>
          <ul>
            <li>
              Flow instability, severe slugging and hydrates in the service line barely show in these five sensors, so
              Monitus mostly misses them.
            </li>
            <li>
              Some faults have only 4 or 6 real recordings, so their scores could swing a lot with more data.
            </li>
            <li>
              The alarm setting was tuned on these same results, so the headline numbers are slightly optimistic.
            </li>
            <li>It learned from Brazilian wells. An operator would retrain it on its own fields before relying on it.</li>
          </ul>
        </div>
      </div>
    </section>
  );
};

export default Results;
