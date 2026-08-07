export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const progress = Math.min(100, Math.max(0, value));
  return <div className="mini-progress" aria-label={label} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }}/></div>;
}
