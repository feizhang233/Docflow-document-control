---
version: alpha
name: "DocFlow"
description: "A precise engineering document-control cockpit with quiet Art Design Pro-inspired depth and motion."
colors:
  primary: "#5B7CFA"
  primaryStrong: "#4263EB"
  cyan: "#22B8CF"
  ink: "#172033"
  muted: "#667085"
  canvas: "#F4F6FA"
  surface: "#FFFFFF"
  border: "#E7EAF0"
  success: "#12A474"
  warning: "#D98B22"
  danger: "#E5484D"
  focus: "#8EA8FF"
typography:
  display:
    fontFamily: "Inter, SF Pro Display, Avenir Next, Segoe UI, sans-serif"
    lineHeight: "1.15"
  sans:
    fontFamily: "Inter, SF Pro Text, Avenir Next, Segoe UI, sans-serif"
    lineHeight: "1.5"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    lineHeight: "1.45"
rounded:
  DEFAULT: "0.625rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
spacing:
  control: "2.5rem"
  page-gutter: "1.75rem"
  panel-gap: "1.25rem"
  sidebar: "15.5rem"
components:
  button: { }
  card: { }
  dialog: { }
  drawer: { }
  table: { }
  input: { }
  navigation: { }
---

# DocFlow Design System

## Overview

### Creative North Star

DocFlow should feel like an engineer's document tray translated into a calm digital control room: indexed sheets, precise status marks, clear ownership, and a visible route from issue to approval. Art Design Pro is the interaction reference for its crisp shell, restrained elevation, electric-blue accents, and coordinated page motion; DocFlow retains its own engineering-document vocabulary and density.

### Product context and register

- **Audience and primary job:** Document controllers, project administrators, engineers, and reviewers locating records, checking issue progress, and maintaining package metadata.
- **Target market(s) and evidence:** International engineering projects; the repository currently exposes English UI and NFS/FST/FBP project workflows.
- **Locale(s) and language policy:** English UI using `en-GB` date presentation. Domain identifiers remain exactly as stored.
- **Usage scene:** Repeated desktop use with wide tables, occasional tablet/mobile access, time-sensitive review, and high information density.
- **Register:** Product. Familiar operations and auditability lead; expression is reserved for login, page arrival, active navigation, and summary surfaces.
- **Memorable signature:** A thin luminous “document route” that connects project, submission, workflow, and transmittal states without changing domain behavior.
- **Restraint:** Registers, forms, destructive decisions, and settings use quiet surfaces, stable geometry, and minimal motion.
- **Anti-references:** No generic gradient KPI dashboard, spreadsheet imitation, glass-heavy sci-fi console, or playful consumer-app styling.
- **Token ownership/runtime mapping:** Runtime CSS variables in `frontend/src/styles/index.css` remain canonical. This file mirrors accepted values. Shared components consume semantic variables; the premium static audit and visual browser checks are the drift gate.

## Colors

`primary` and `primaryStrong` carry navigation, focus-adjacent emphasis, and safe primary actions. `cyan` appears only as a secondary route/status accent. `ink`, `muted`, `canvas`, `surface`, and `border` form the low-contrast operational shell. `success`, `warning`, and `danger` are semantic and always paired with text or icons. Dark mode remaps surfaces and text while preserving these roles.

## Typography

The product uses an Inter/SF Pro/Avenir/Segoe system stack for a native enterprise rhythm. Display roles use stronger weight and tighter tracking; body and controls remain sentence case. Document, transmittal, and workflow numbers use the mono stack with tabular numerals. Uppercase is limited to small utility labels and never used for sentences.

## Layout

The desktop shell uses a 248px persistent sidebar, a 64px sticky top bar, and a flexible content canvas. The content gutter is 28px and panel gaps are 20px. Register tables retain horizontal comparison through explicit overflow rather than becoming lossy cards. Below 900px the sidebar becomes an overlay drawer; below 700px headers and toolbars stack while actions remain reachable.

## Elevation & Depth

Hierarchy comes from tonal surfaces, 1px borders, and small cool shadows. Static cards never float dramatically. Popovers, dialogs, and drawers receive stronger elevation because they occupy a higher interaction layer. The login illustration may use a controlled ambient glow; data tables may not.

## Shapes

Controls use 8–10px radii, cards 12–16px, and major dialog/drawer surfaces up to 20px. Status badges remain compact rounded rectangles rather than pills unless the content is a binary state. Icons use 1.75–2px strokes with square optical alignment.

## Components

### Foundational visual states

Every action defines default, hover, focus-visible, pressed, disabled, and busy states. Selection adds a blue-tinted surface plus a non-colour indicator. Loading reserves the final surface footprint and uses the shared spinner; no skeleton system is selected. Errors remain visible near the affected region.

### Buttons and actions

Primary actions are solid blue; neutral actions are bordered or ghost. Warning represents reversible abandonment/termination and danger represents permanent deletion. Busy state preserves width and height. Icon-only actions always have accessible names.

### Navigation and data display

The active sidebar item uses a soft blue surface, bright icon, and a 3px route marker. Tables use sticky headers, tabular identifiers, visible overflow, stable pagination, and compact/comfortable density variants. Charts keep text legends as the accessible alternative.

### Forms and overlays

Fields share 40px control height, visible labels, blue focus rings, and inline errors. Native selects and the native date input are intentional: platform-owned popups are accepted for this internal English desktop tool. Dialogs and drawers use the global layer contract and keep headers/actions reachable while bodies scroll.

### Iconography

Lucide is the canonical icon family. Icons are supplemental to text except for familiar utility controls with accessible names. Filled decorative icon sets must not be introduced.

### Motion

Page content enters once with a 240ms opacity/12px translate sequence. Cards may stagger by 45ms on first arrival. Hover feedback is 160–200ms; dialogs and drawers use 220–280ms spatial transitions. Reorders retain dnd-kit motion. Reduced-motion mode removes transforms and stagger delays and keeps only a short opacity transition.

### Content and data visualization

Copy is direct and operational: “Save document”, “Permanently delete”, and “Retry”. Action and feedback verbs stay aligned. Counts use tabular numerals; timestamps state their context; charts always expose labels and counts.

## Do's and Don'ts

- **Do:** Let project, document, workflow, and transmittal states define the visual hierarchy.
- **Do:** Reuse semantic variables and shared overlay/form behavior across every route.
- **Don't:** change Workflow numbering, comments/state, Aconex matching, or external workflow APIs as part of a visual migration.
- **Don't:** trade table legibility, keyboard focus, or stable geometry for decorative animation.
