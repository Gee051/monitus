type LineChartProps = {
  t: number[];
  values: (number | null)[];
  phase: number[];
  cursorIndex: number;
  cursorMinute: number;
  alarmMinute: number | null;
  height?: number;
  domain?: [number, number];
  threshold?: number;
  variant?: "sensor" | "risk";
};

type Band = {
  phase: number;
  start: number;
  end: number;
};

const WIDTH = 600;
const PAD = 4;

const LineChart = ({
  t,
  values,
  phase,
  cursorIndex,
  cursorMinute,
  alarmMinute,
  height = 44,
  domain,
  threshold,
  variant = "sensor",
}: LineChartProps) => {
  const minT = t[0];
  const maxT = t[t.length - 1];
  const span = Math.max(1, maxT - minT);
  const xOf = (minute: number) => ((minute - minT) / span) * WIDTH;

  const present = values.filter((v): v is number => v != null);
  const lo = domain ? domain[0] : Math.min(...present);
  const hi = domain ? domain[1] : Math.max(...present);
  const range = hi - lo || 1;
  const yOf = (v: number) => height - PAD - ((v - lo) / range) * (height - 2 * PAD);

  let path = "";
  let penDown = false;
  for (let i = 0; i <= cursorIndex; i += 1) {
    const v = values[i];
    if (v == null) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${xOf(t[i]).toFixed(1)} ${yOf(v).toFixed(1)}`;
    penDown = true;
  }

  const bands: Band[] = [];
  let current: Band | null = null;
  for (let i = 0; i <= cursorIndex; i += 1) {
    const code = phase[i];
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

  const cursorX = xOf(Math.min(cursorMinute, maxT));
  const showAlarm = alarmMinute != null && cursorMinute >= alarmMinute;

  return (
    <svg
      className={`chart chart-${variant}`}
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      {bands.map((band) => (
        <rect
          key={`${band.phase}-${band.start}`}
          x={xOf(band.start)}
          y={0}
          width={Math.max(1, xOf(band.end) - xOf(band.start))}
          height={height}
          className={band.phase === 1 ? "band-developing" : "band-full"}
        />
      ))}
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
      {showAlarm && (
        <line
          x1={xOf(alarmMinute)}
          x2={xOf(alarmMinute)}
          y1={0}
          y2={height}
          className="alarm-line"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={path}
        className={variant === "risk" ? "risk-line" : "sensor-line"}
        vectorEffect="non-scaling-stroke"
      />
      <line x1={cursorX} x2={cursorX} y1={0} y2={height} className="playhead" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export default LineChart;