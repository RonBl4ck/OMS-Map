# OMS Map Visual Reform Design

## Objective

Modernize OMS Map as one cohesive operational application while preserving its existing data sources, calculations, filters, exports, map behavior, and technician workflows.

## Product Structure

OMS Map will use one persistent application shell. The primary navigation will expose `Mapa`, `Indicadores`, `Seguimiento`, and `Llamadas` when the signed-in role permits it. The header and primary navigation remain visible while the content view changes. Full-view sections must no longer present a repeated `Volver al mapa` action.

The shell keeps the PLUZ identity, current user, data freshness, and global actions accessible without forcing each section to reproduce its own top bar. On mobile, the same information is rearranged into compact rows without horizontal clipping.

## Visual Language

- Use the existing PLUZ dark blue for the application shell and structural surfaces.
- Use PLUZ blue for selection and primary actions.
- Reserve yellow for small brand accents.
- Reserve green, amber, and red for operational states.
- Use neutral surfaces for ordinary filters; a filter must not look dangerous merely because it is available.
- Use the imported `Inter` family for interface content and `Outfit` only for product or section titles.
- Replace navigational emoji with consistent monochrome icons. Preserve the purpose-built fault marker artwork.
- Standardize control, card, badge, and modal radii through shared design tokens.

All user-facing wording must say `plazo`, never `SLA`. Internal data identifiers may remain unchanged when renaming them would create unnecessary behavioral risk.

## Map View

The map remains the default view and retains all current search types, multiselect filters, critical/reincidence filters, SED perimeter controls, layer controls, downloads, location control, marker popups, and legend content.

The desktop header will separate primary navigation from compact operational context. Search stays immediately available, while secondary filters are progressively disclosed. Active filters remain visible as removable summaries.

On mobile, the header must not overflow. Search and filters will use a bottom-sheet-like panel with compact and expanded states. The collapsed state must leave the map usable.

Dense marker areas should communicate concentration without producing an unreadable pile of icons. Marker clustering or an equivalent aggregation treatment should preserve access to individual incidents. The visual priority must emphasize incidents near or outside their allowed plazo.

## Indicators View

Indicators render inside the persistent application shell. Existing metrics, four charts, filters, sorting, search, and the detailed incident table remain functional.

The visual hierarchy will distinguish the primary operational metric from supporting metrics. Chart cards should devote more of their area to actual data and use legible direct values. Dominant categories must not make all smaller categories unreadable.

The desktop table will prioritize operational columns and allow secondary technical fields to remain accessible without overwhelming the initial viewport. Mobile will use a responsive presentation rather than requiring the full desktop table to fit the screen.

## Technician Tracking View

Tracking renders inside the persistent shell and preserves the company performance chart, operational funnel, filters, global search, sorting, export behavior, and full technician dataset.

The primary technician table must continue to show both `Primer cierre` and `Último cierre` as distinct visible columns. These values must not be merged, hidden in a secondary panel, or removed. The table must also retain technician, skill, company/contractor, zone, status, work count, time since last closure, and alert information.

Search and the most-used filters remain prominent. Secondary filters may be progressively disclosed on narrow screens. Alert presentation must show the exact elapsed time and use the term `plazo` where applicable.

## Technician and Contractor Detail

Selecting a technician row continues to open a detailed experience associated with that technician and contractor. The detail preserves:

- Contractor, skill, zone, and date context.
- Work count.
- `Primer cierre`.
- `Último cierre`.
- Activity window.
- Average time between closures.
- Chronology of closures and inactivity intervals.
- Ticket search, export, ticket metadata, and specific notes.

`Primer cierre` and `Último cierre` remain visually prominent in the detail header metrics.

On desktop, the detail may remain a large centered dialog if nested scrolling is removed or substantially reduced. The chronology should read as a coherent time sequence. Ticket notes need enough width or an expandable presentation.

On mobile, chronology becomes a vertical sequence and ticket rows become stacked cards. The user must not need simultaneous horizontal and vertical scrolling to understand a ticket.

## Motion and Interaction

Motion is brief and functional because the application is used repeatedly during operations.

- Button press feedback: 100–160 ms with subtle scale.
- Popovers and menus: 125–200 ms, origin-aware, using opacity and transform.
- Centered dialogs: 180–220 ms using opacity and an initial scale no smaller than `0.97`.
- Frequent navigation changes: immediate or nearly immediate.
- Avoid `transition: all`; animate only named properties.
- Support `prefers-reduced-motion`.
- Hover-only effects must be restricted to devices that actually support hover.

## Accessibility and Responsive Behavior

- All interactive controls require a visible keyboard focus state.
- Touch targets should be at least 44 CSS pixels where mobile layout permits.
- State cannot be communicated by color alone.
- Mobile layouts must avoid clipped navigation and nested horizontal scrolling.
- Dialogs must retain an accessible close control and sensible focus behavior.
- Data tables keep semantic table markup on desktop.

## Implementation Boundaries

The reform will modify the existing HTML, modular CSS, and only the JavaScript required for shell navigation, progressive filters, clustering/aggregation, and responsive detail behavior. It will preserve the current script order and avoid unrelated changes to authentication, data ingestion, calculations, APIs, and exports.

Existing uncommitted work in `index.html`, `server.js`, `assets/css`, `assets/js`, `assets/icons`, and `tests` belongs to the user and must be preserved.

## Validation

- Automated tests must verify persistent navigation, terminology, required technician columns, and responsive detail structure.
- Existing Node tests must continue to pass.
- Browser verification must use the local Node server with real loaded data.
- Desktop checks cover map, indicators, tracking, and technician detail.
- Mobile checks cover header overflow, map filters, indicator content, tracking, vertical chronology, and ticket cards.
- Browser console output must be checked for new errors.

