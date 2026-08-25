export type ImportedRoute = { name?: string; waypoints: { name: string; lat: number; lon: number }[]; format: "RTZ" | "GPX" };

export function parseRouteFile(text: string, filename = "route"): ImportedRoute {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The route file is not valid XML.");
  const root = doc.documentElement.localName.toLowerCase();
  if (root === "route") return parseRtz(doc, filename);
  if (root === "gpx") return parseGpx(doc, filename);
  throw new Error("Unsupported route file. Import an RTZ or GPX file.");
}

function parseRtz(doc: Document, filename: string): ImportedRoute {
  const routeEl = doc.documentElement;
  const name = routeEl.getAttribute("routeName") || routeEl.getAttribute("name") || baseName(filename);
  const nodes = Array.from(doc.getElementsByTagNameNS("*", "waypoint"));
  const waypoints = nodes.map((wp, i) => {
    const pos = Array.from(wp.children).find((el) => el.localName === "position");
    const lat = Number(pos?.getAttribute("lat")); const lon = Number(pos?.getAttribute("lon"));
    const nameEl = Array.from(wp.children).find((el) => el.localName === "name");
    const wpName = wp.getAttribute("name") || nameEl?.textContent?.trim() || `WP${String(i + 1).padStart(2, "0")}`;
    return { name: wpName, lat, lon };
  });
  validate(waypoints);
  return { name, waypoints, format: "RTZ" };
}

function parseGpx(doc: Document, filename: string): ImportedRoute {
  const route = Array.from(doc.getElementsByTagNameNS("*", "rte"))[0];
  const track = Array.from(doc.getElementsByTagNameNS("*", "trk"))[0];
  let nodes: Element[] = [];
  if (route) nodes = Array.from(route.getElementsByTagNameNS("*", "rtept"));
  else if (track) nodes = Array.from(track.getElementsByTagNameNS("*", "trkpt"));
  else nodes = Array.from(doc.getElementsByTagNameNS("*", "wpt"));
  const nameEl = route?.getElementsByTagNameNS("*", "name")[0] || track?.getElementsByTagNameNS("*", "name")[0];
  const waypoints = nodes.map((wp, i) => ({ name: wp.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() || `WP${String(i + 1).padStart(2, "0")}`, lat: Number(wp.getAttribute("lat")), lon: Number(wp.getAttribute("lon")) }));
  validate(waypoints);
  return { name: nameEl?.textContent?.trim() || baseName(filename), waypoints, format: "GPX" };
}

function validate(points: { lat: number; lon: number }[]) {
  if (points.length < 2) throw new Error("Route must contain at least two valid route points.");
  if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180)) throw new Error("Route contains an invalid latitude or longitude.");
}
function baseName(filename: string) { return filename.replace(/\.[^.]+$/, ""); }
