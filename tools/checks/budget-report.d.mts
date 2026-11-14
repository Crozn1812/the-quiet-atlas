export interface Measurement {
  mode: 'report-only';
  measuredAt: string;
  previousAt: string | null;
  metrics: Record<string, number>;
  delta: Record<string, number | null>;
}
export function recordMetrics(name: string, metrics: Record<string, number>, directory?: string): Measurement;
