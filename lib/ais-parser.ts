import type { VesselState } from "@/lib/seavant-state";

function sixBitCharToValue(char: string) {
  const code = char.charCodeAt(0);
  return code < 88 ? code - 48 : code - 56;
}

function payloadToBits(payload: string) {
  return payload
    .split("")
    .map((char) => sixBitCharToValue(char).toString(2).padStart(6, "0"))
    .join("");
}

function getUnsigned(bits: string, start: number, length: number) {
  return parseInt(bits.slice(start, start + length), 2);
}

function getSigned(bits: string, start: number, length: number) {
  const value = getUnsigned(bits, start, length);
  const signBit = 2 ** (length - 1);
  return value >= signBit ? value - 2 ** length : value;
}

export function decodeOwnShipAivdo(sentence: string): Partial<VesselState> | null {
  try {
    const clean = String(sentence || "").trim();
    if (!clean.startsWith("!AIVDO") && !clean.startsWith("$AIVDO")) return null;

    const parts = clean.split(",");
    if (parts.length < 7) return null;

    const total = Number(parts[1]);
    const fragment = Number(parts[2]);
    const payload = parts[5];
    const fillBits = Number((parts[6] || "0").split("*")[0] || 0);
    if (total !== 1 || fragment !== 1 || !payload) return null;

    const rawBits = payloadToBits(payload);
    const bits = fillBits > 0 ? rawBits.slice(0, -fillBits) : rawBits;
    const messageType = getUnsigned(bits, 0, 6);
    if (![1, 2, 3].includes(messageType)) return null;

    const sogRaw = getUnsigned(bits, 50, 10);
    const lonRaw = getSigned(bits, 61, 28);
    const latRaw = getSigned(bits, 89, 27);
    const cogRaw = getUnsigned(bits, 116, 12);
    const headingRaw = getUnsigned(bits, 128, 9);

    const lat = latRaw / 600000;
    const lon = lonRaw / 600000;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    return {
      position: { lat, lon },
      sog: sogRaw === 1023 ? undefined : sogRaw / 10,
      cog: cogRaw === 3600 ? undefined : cogRaw / 10,
      heading: headingRaw === 511 ? undefined : headingRaw,
      source: "live",
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
