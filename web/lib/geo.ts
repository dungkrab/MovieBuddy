export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
export const todayTH = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export const validDate = (d?: string | null) => {
  const t = todayTH(); const max = new Date(Date.parse(t) + 6 * 864e5).toISOString().slice(0, 10);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= t && d <= max ? d : t;
};
