export type ShipTimeZone = {
  offsetHours: number;
  label: string;
};

export function shipTimeZoneFromLongitude(longitude: number): ShipTimeZone {
  const normalized = normalizeLongitude(longitude);
  const offsetHours = Math.max(-12, Math.min(12, Math.round(normalized / 15)));
  const sign = offsetHours >= 0 ? "+" : "−";
  return { offsetHours, label: `UTC${sign}${Math.abs(offsetHours)}` };
}

export function formatShipTime(value: string | number | Date, longitude: number, includeZone = false) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  const zone = shipTimeZoneFromLongitude(longitude);
  const local = new Date(date.getTime() + zone.offsetHours * 3_600_000);
  const time = `${String(local.getUTCHours()).padStart(2, "0")}${String(local.getUTCMinutes()).padStart(2, "0")}`;
  return includeZone ? `${time} LT · ${zone.label}` : time;
}

export function formatShipDateTime(value: string | number | Date, longitude: number, includeZone = true) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  const zone = shipTimeZoneFromLongitude(longitude);
  const local = new Date(date.getTime() + zone.offsetHours * 3_600_000);
  const day = String(local.getUTCDate()).padStart(2, "0");
  const month = local.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const time = `${String(local.getUTCHours()).padStart(2, "0")}${String(local.getUTCMinutes()).padStart(2, "0")}`;
  return includeZone ? `${day} ${month} ${time} LT · ${zone.label}` : `${day} ${month} ${time}`;
}

export function shipLocalInputFromUtc(value: string, longitude: number) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const zone = shipTimeZoneFromLongitude(longitude);
  return new Date(date.getTime() + zone.offsetHours * 3_600_000).toISOString().slice(0, 16);
}

export function shipLocalInputToUtc(value: string, longitude: number) {
  if (!value) return null;
  const localAsUtc = new Date(`${value}:00Z`);
  if (!Number.isFinite(localAsUtc.getTime())) return null;
  const zone = shipTimeZoneFromLongitude(longitude);
  return new Date(localAsUtc.getTime() - zone.offsetHours * 3_600_000).toISOString();
}

function normalizeLongitude(longitude: number) {
  if (!Number.isFinite(longitude)) return 0;
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}
