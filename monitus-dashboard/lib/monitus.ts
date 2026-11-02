export type Outcome = "caught" | "quiet" | "missed";

export type Sensor = {
  name: string;
  unit: string;
  label: string;
  values: (number | null)[];
  missing: boolean;
};

export type Demo = {
  id: string;
  outcome: Outcome;
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

export type FaultScore = {
  id: number;
  name: string;
  recordings: number;
  caught: number;
  caughtEarly: number | null;
  medianWarningMinutes: number | null;
};

export type DemoListing = {
  id: string;
  title: string;
  outcome: Outcome;
};

export type Summary = {
  setting: { threshold: number; persistence: number };
  falseAlarmsPerDay: number;
  realWells: number;
  faults: FaultScore[];
  demos: DemoListing[];
};

export const DATASET_URL = "https://github.com/petrobras/3W";

export const DEMO_LABELS: Record<string, { short: string; tag: string }> = {
  hydrate: { short: "Hydrate", tag: "Caught early" },
  valve: { short: "Valve closure", tag: "Caught early" },
  scaling: { short: "Scaling", tag: "Caught early" },
  normal: { short: "Normal well", tag: "Stayed quiet" },
  missed: { short: "Service-line hydrate", tag: "Missed" },
};

export const formatDuration = (minutes: number | null | undefined): string => {
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

export const formatWarning = (minutes: number | null | undefined): string => {
  if (minutes == null) return "n/a";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
};

export const formatHours = (minutes: number | null | undefined): string => {
  if (minutes == null) return "n/a";
  if (minutes < 120) return `${Math.round(minutes)} min`;
  return `${Math.round(minutes / 60)} h`;
};

export const formatPercent = (value: number | null | undefined): string =>
  value == null ? "n/a" : `${Math.round(value * 100 - 0.001)}%`;

export const lastIndexAtOrBefore = (t: number[], minute: number): number => {
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

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : "Something went wrong while loading the data.";

export const loadJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Couldn't load ${path}. Check that the data files were deployed.`);
  return (await response.json()) as T;
};
