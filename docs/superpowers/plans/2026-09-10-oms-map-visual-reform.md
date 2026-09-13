# OMS Map Visual Reform — Implementation Plan

**Goal:** Convert the independent map, indicators and tracking overlays into one cohesive operational application while preserving all data and workflows.

**Constraints:** Work in the current checkout, do not commit or rewrite Git history, preserve existing dirty changes, keep `Primer cierre` and `Último cierre`, and use visible `plazo` terminology.

## Task 1: Lock the product-shell contract with tests

- Add source-level tests for the four persistent navigation entries, accessible tab state, absence of “Volver al mapa”, visible `plazo` wording, and the two closure columns.
- Run the focused test and confirm it fails before implementation.

## Task 2: Build the persistent shell

- Update `index.html` with a visible `Mapa` tab and semantic tab attributes.
- Keep one global header across every primary view and remove duplicated view return bars.
- Update `assets/js/50-navigation.js` so every view is selected through one route-like tab controller with `aria-selected`, hidden state and map resizing.
- Verify the focused tests.

## Task 3: Apply the modern visual system

- Expand tokens and shared interaction rules in `assets/css/00-foundation.css`.
- Add a final `assets/css/90-modern.css` layer for the cohesive shell, surfaces, navigation, KPI cards, filters, tables, focus states and responsive behavior.
- Keep motion brief, property-specific and compatible with reduced motion.

## Task 4: Improve operational views without losing information

- Recompose map controls as a compact toolbar and improve legend hierarchy.
- Improve Indicators chart/table density and scanning.
- Improve Tracking table and technician detail, retaining separate first/last closure values and making mobile rows readable through labels.
- Keep internal identifiers stable where renaming would risk behavior; only user-visible copy changes from SLA to plazo.

## Task 5: Verify with real local data

- Run the complete Node test suite.
- Start/use the local server and exercise Map, Indicators, Tracking and technician detail on desktop and mobile.
- Confirm real charts render, first/last closure values remain distinct, no horizontal clipping blocks key actions, and the browser console has no new errors.
- Review the final diff without committing.
