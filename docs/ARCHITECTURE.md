# SEAVANT Architecture

## Intent

SEAVANT is not organized around pages. It is organized around operational domains that contribute to a single shared vessel-and-voyage state.

## Domain model

### Vessel
Own-ship position, heading, COG/SOG, sensor sources, source health, and timestamps.

### Voyage
Departure, destination, route, waypoints, phase of voyage, progress, average speed, ETA, and ETA confidence/window.

### Environment
Current and forecast weather, sea state, pressure, warnings, and route-relative forecast conditions.

### Awareness
Derived items that answer: what matters now, in six hours, in 24 hours, for the voyage, and for arrival?

### Watch
Watch start/end state, meaningful changes, distance made good, average speed, encounter summaries, and handover-ready events.

## Data flow

Adapters -> normalized domain state -> derived awareness -> user interface

Adapters may include AIS/NMEA, manually entered voyage data, official weather sources, GRIB/model data, and future vessel systems.

No UI component should directly own core navigation or voyage calculations when those calculations belong in the domain layer.

## Donor policy

NavDash1-3 is read-only reference material for SEAVANT development. Proven integrations may be ported after review, especially:

- AIS WebSocket connection logic
- Local AIS/NMEA server
- MapLibre/Leaflet integration patterns
- Bridge/day theme behavior
- Fullscreen behavior
- Weather-source routing logic

Do not port the existing large page architecture wholesale.

## Alpha milestones

### 0.1 — Product shell
Voyage overview, vessel state, awareness list, map placeholder, watch preview.

### 0.2 — Live own-ship data
Port and isolate AIS/NMEA position ingestion behind a SEAVANT adapter.

### 0.3 — Live operational map
MapLibre-based own-ship display with free pan, range/bearing, route context, and no forced snap-back.

### 0.4 — Voyage engine
Route progress, rolling-speed ETA, ETA confidence/window, waypoint timing, voyage phase.

### 0.5 — Awareness engine
Rules that derive what matters next from vessel, voyage, environment, and traffic state.

### 0.6 — Watch handover
Automatically summarize meaningful watch events and upcoming concerns.
