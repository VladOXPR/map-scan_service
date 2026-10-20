export function DistancePill({ label }: { label: string }) {
  return (
    <span className="cuub-distance-pill">
      <img src="/assets/illustrations/Station.png" alt="" width={18} height={22} />
      <span>{label}</span>
    </span>
  );
}
