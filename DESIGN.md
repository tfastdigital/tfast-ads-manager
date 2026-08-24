---
name: TFast Agency Command Center
description: A compact media-operations ledger for portfolio exceptions and guarded automation.
colors:
  ink: "#111a20"
  paper: "#f6f8f6"
  surface: "#ffffff"
  graphite-line: "#dce1df"
  graphite-line-strong: "#b9c1be"
  text: "#172127"
  muted: "#5c6a70"
  signal-lime: "#b7ed16"
  signal-lime-dark: "#668900"
  healthy: "#16804a"
  watch: "#a96600"
  critical: "#c33131"
  information: "#246aa5"
typography:
  headline:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 750
    lineHeight: 1.45
    letterSpacing: "0.045em"
  body:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 750
    lineHeight: 1.45
    letterSpacing: "0.055em"
rounded:
  field: "7px"
  control: "8px"
  nav: "9px"
  surface: "10px"
  login: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    typography: "{typography.title}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    typography: "{typography.title}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "9px 10px"
    typography: "{typography.body}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
  status-pill:
    rounded: "{rounded.pill}"
    padding: "3px 8px"
    typography: "{typography.label}"
---

# Design System: TFast Agency Command Center

## Overview

**Creative North Star: "The Media Operations Ledger"**

TFast is a cool, compact operating surface where portfolio exceptions and guarded automation share one working plane. It borrows the decisiveness of an operations ledger: persistent ink navigation, flush data tables, graphite dividers, disciplined labels, and almost no decorative chrome.

The interface is dense without becoming compressed. White working surfaces sit on cool paper; dark ink establishes authority; acid lime is reserved for live state, selection, focus, and decisive automation cues. Product language and visual hierarchy keep client scope, exceptions, and approval boundaries immediately legible.

**Key Characteristics:**

- Ledger-like tables and divided metric strips instead of a generic card grid.
- Persistent dark navigation framing bright, low-noise work surfaces.
- Acid lime used as a rare operational signal, never as broad decoration.
- Compact controls, uppercase micro-labels, and strong numeric scanning.
- Responsive simplification that preserves the operating hierarchy.

## Colors

The palette pairs near-black blue-green ink with cool paper and white, using graphite rules for structure and one electric lime signal for attention and state.

### Primary

- **Operations Ink:** The sidebar, primary actions, code surfaces, and user chat messages; it supplies authority and maximum contrast.
- **Signal Lime:** The brand accent, active navigation rail, keyboard focus, and automation state. Its rarity makes it meaningful.
- **Deep Signal Lime:** Small status dots and selected tab rules where the brighter signal would be too loud.

### Secondary

- **Healthy Green:** Successful, healthy, and completed status text.
- **Watch Amber:** Needs-review and pending states.
- **Critical Red:** Errors, destructive actions, and critical states.
- **Information Blue:** Loading and informational status.

### Neutral

- **Cool Paper:** The application canvas behind working surfaces.
- **Working White:** Panels, tables, inputs, headers, and ghost controls.
- **Body Ink:** Default readable text on light surfaces.
- **Muted Slate:** Secondary copy, metadata, and inactive navigation labels.
- **Graphite Rule:** Standard panel, row, and section division.
- **Strong Graphite Rule:** Input and secondary-control outlines.

### Named Rules

**The One Signal Rule.** Signal lime marks selection, focus, live state, or the next decisive action; it does not fill large decorative areas.

**The Status Has Words Rule.** Healthy, watch, critical, and information colors always accompany readable status text or another non-color cue.

## Typography

**Display Font:** Aptos (with Segoe UI Variable, Segoe UI, system-ui, and sans-serif fallbacks)
**Body Font:** Aptos (with Segoe UI Variable, Segoe UI, system-ui, and sans-serif fallbacks)
**Label/Mono Font:** Aptos for labels; Consolas with monospace fallback for code and structured data.

**Character:** A single pragmatic sans-serif family keeps the dashboard native, quick, and trustworthy. Hierarchy comes from weight, compact sizing, and restrained tracking rather than ornamental type pairing.

### Hierarchy

- **Headline:** Heavy and tightly tracked; reserved for page identity and reduced on mobile.
- **Title:** Compact, bold, and often uppercase; used for panel and ledger headers.
- **Body:** Neutral reading size and comfortable line height for operational copy.
- **Metric:** Large, heavy, and tightly tracked for scan-first values.
- **Label:** Small, uppercase, tracked, and semibold-to-bold for columns, metadata, and controls.
- **Code:** Compact monospace on a dark ink surface for JSON and technical payloads.

### Named Rules

**The Scan Before Read Rule.** Page names, metric values, statuses, and actions establish the first scan; explanation stays muted and subordinate.

## Layout

The desktop shell uses a fixed 224px sidebar and a sticky 64px utility bar. The main working plane is centered up to 1500px with 32px horizontal page padding. Metric summaries form a six-column divided strip, while panels and ledger blocks stack with 16–18px separation. Tables stay flush within their containers and scroll horizontally when their data model cannot collapse safely.

At 1000px, metric strips reduce to three columns and four-column forms reduce to two. At 760px, the sidebar becomes an off-canvas drawer, the utility bar compresses to 58px, page padding becomes 14px, metrics reduce to two columns, and forms, connection summaries, and automation controls stack into one column. Secondary system status and table search controls yield first on small screens.

**The Shared Plane Rule.** Related metrics, rows, and workflow stages belong in divided continuous surfaces; do not fragment every datum into a floating card.

## Elevation & Depth

The system is flat by default. Depth is conveyed primarily through tonal contrast, borders, and the fixed navigation frame. A single soft ambient shadow is reserved for the mobile drawer and centered login card; buttons communicate hover with a one-pixel lift rather than heavier shadow.

### Shadow Vocabulary

- **Ambient Shell:** A broad, low-opacity shadow used only where a surface truly floats above the workspace, such as login and off-canvas navigation.

### Named Rules

**The Flat Ledger Rule.** Working panels and tables remain border-defined at rest; elevation is structural or stateful, never ornamental.

## Shapes

Forms are quietly softened: fields use 7px corners, controls 8px, navigation items 9px, and working surfaces 10px. The larger 14px radius is reserved for the isolated login card. Pills and status dots are fully rounded. Thin graphite borders and clipped panel contents keep the geometry precise.

**The Small Radius Ladder Rule.** Use the established 7–10px progression for operational UI; reserve full rounding for status tokens and circular identity marks.

## Components

### Buttons

- **Shape:** Compact rounded rectangle with an 8px radius.
- **Primary:** Operations Ink fill, white text, a matching ink border, and 9px by 14px padding.
- **Hover / Focus:** Hover lightens the ink and lifts one pixel over an 180ms ease-out; keyboard focus receives a high-visibility translucent lime outline with offset.
- **Secondary / Ghost:** White fill with body-ink text and a strong graphite border.
- **Danger:** Transparent fill with critical red text and a pale red border; destructive meaning remains textual.

### Chips

- **Style:** Fully rounded, compact status pills with tinted semantic backgrounds and dark semantic text.
- **State:** Labels are always present; color reinforces rather than replaces meaning.

### Cards / Containers

- **Corner Style:** Quietly rounded working surfaces with a 10px radius.
- **Background:** Working White on Cool Paper.
- **Shadow Strategy:** Flat and border-defined; refer to the Flat Ledger Rule.
- **Border:** One-pixel Graphite Rule.
- **Internal Padding:** Typically 16–20px; ledger tables remain flush to their container.

### Inputs / Fields

- **Style:** White field, strong graphite stroke, 7px radius, and 9px by 10px internal padding.
- **Focus:** The shared translucent lime focus outline appears outside the control.
- **Error / Disabled:** Errors use critical text with a concrete recovery message; disabled actions reduce opacity and use a waiting cursor.

### Navigation

The desktop navigation is an ink column with muted labels and thin-line icons. Hover adds a slightly lighter ink surface; active state adds white text, a darker inset surface, and a three-pixel lime rail. Mobile preserves the same navigation as a sliding drawer rather than inventing a separate hierarchy.

### Portfolio Ledger

The signature data surface uses compact uppercase column headers, 12px row text, graphite horizontal rules, and a barely tinted row hover. Summary metrics use the same container logic, divided into equal cells so the portfolio reads as one instrument panel.

### Automation Rail

The automation sequence is an ink band with explicit Connect → Sync → Analyze → Approve stages, visible state dots, and a decisive action. It keeps automated work and approval boundaries present without turning them into decorative progress theater.

## Do's and Don'ts

### Do:

- **Do** keep portfolio exceptions and decisions ahead of passive reporting.
- **Do** use continuous divided surfaces for dense, comparable operational data.
- **Do** preserve visible client scope and pair every status color with text.
- **Do** reserve lime for focus, selection, live state, and decisive workflow cues.
- **Do** collapse the shell and grids at the established 1000px and 760px breakpoints.

### Don't:

- **Don't** turn the dashboard into a gallery of floating metric cards.
- **Don't** use lime as a large background, decorative gradient, or general brand wash.
- **Don't** add ornamental shadows to ordinary panels and tables.
- **Don't** hide approval, safety, or automation state behind ambiguous icon-only controls.
- **Don't** replace compact operational labels with promotional copy or oversized display type.
