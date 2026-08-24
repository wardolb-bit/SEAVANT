# SEAVANT

**Maritime Operations Platform by Ward Maritime**

SEAVANT is a clean-sheet maritime operations platform built around one question:

> What does the watchstander need to know next?

## Product principles

- Voyage-aware, not page-aware
- Time-centric, not only position-centric
- Quiet by default; surface only meaningful change
- Human-in-command; software prioritizes and explains
- One operational state shared by navigation, weather, traffic, watch, and arrival
- Reuse proven NavDash integration code selectively, without inheriting its screen architecture

## Core domains

- **Vessel** — position, COG, SOG, heading, sensors, source health
- **Voyage** — departure, destination, route, progress, ETA, voyage phase
- **Environment** — weather, warnings, route forecast, sea state
- **Awareness** — what matters now and next
- **Watch** — meaningful changes, events, and handover

## Alpha 0.1

The first prototype intentionally contains only:

1. Voyage Overview
2. Live operational picture placeholder
3. What Matters Next
4. Watch summary preview

The current NavDash repository remains untouched and serves only as a donor/reference implementation for proven integrations.
