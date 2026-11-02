type RiskDialProps = {
  risk: number | null;
  threshold: number;
  alarmOn: boolean;
};

const R = 80;
const CX = 100;
const CY = 96;

const pointAt = (fraction: number) => {
  const angle = Math.PI * (1 - fraction);
  return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) };
};

const arc = (from: number, to: number) => {
  const a = pointAt(from);
  const b = pointAt(to);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

const RiskDial = ({ risk, threshold, alarmOn }: RiskDialProps) => {
  const value = Math.min(1, Math.max(0, risk ?? 0));
  const level = alarmOn ? "alarm" : value >= 0.5 ? "raised" : "calm";
  const tickIn = pointAt(threshold);
  const tickOut = { x: CX + (R + 12) * Math.cos(Math.PI * (1 - threshold)), y: CY - (R + 12) * Math.sin(Math.PI * (1 - threshold)) };

  return (
    <div className={`dial dial-${level}`}>
      <svg viewBox="0 0 200 108" role="img" aria-label={`Trouble risk ${Math.round(value * 100)} percent`}>
        <path d={arc(0, 1)} className="dial-track" />
        {value > 0.002 && <path d={arc(0, value)} className="dial-value" />}
        <line x1={tickIn.x} y1={tickIn.y} x2={tickOut.x} y2={tickOut.y} className="dial-tick" />
      </svg>
      <div className="dial-readout">
        <span className="dial-number">{risk == null ? "n/a" : `${Math.round(value * 100)}%`}</span>
        <span className="dial-label">Trouble risk</span>
      </div>
    </div>
  );
};

export default RiskDial;
