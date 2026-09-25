---
name: vaults.cash
description: Robinhood-simple earning on Uniswap, drawn as a cash drawer at night
colors:
  drawer-black: "#0b0d0b"
  felt: "#141714"
  till: "#1b1f1b"
  seam: "#262b26"
  bill-white: "#f4f6f4"
  ledger-gray: "#8b938b"
  fresh-bill: "#7cd44a"
  crisp-bill: "#8ee55c"
  deep-ink: "#2f7a1e"
  red-flag: "#ff5c5c"
typography:
  display:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "clamp(3rem, 6vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.04em"
  figure:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
rounded:
  xl: "12px"
  "2xl": "16px"
  "3xl": "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.fresh-bill}"
    textColor: "#000000"
    rounded: "{rounded.pill}"
    padding: "12px 32px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.crisp-bill}"
  button-secondary:
    backgroundColor: "{colors.till}"
    textColor: "{colors.bill-white}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.seam}"
  button-danger:
    backgroundColor: "rgba(255, 92, 92, 0.15)"
    textColor: "{colors.red-flag}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  chip:
    backgroundColor: "{colors.till}"
    textColor: "{colors.ledger-gray}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    typography: "{typography.label}"
  chip-accent:
    backgroundColor: "rgba(124, 212, 74, 0.15)"
    textColor: "{colors.fresh-bill}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-negative:
    backgroundColor: "rgba(255, 92, 92, 0.15)"
    textColor: "{colors.red-flag}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.felt}"
    textColor: "{colors.bill-white}"
    rounded: "{rounded.3xl}"
    padding: "20px"
  row:
    backgroundColor: "{colors.felt}"
    textColor: "{colors.bill-white}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.drawer-black}"
    textColor: "{colors.bill-white}"
    rounded: "{rounded.xl}"
    padding: "8px"
  nav-tab-active:
    backgroundColor: "{colors.till}"
    textColor: "{colors.bill-white}"
    rounded: "{rounded.pill}"
    padding: "6px 16px"
  select-trigger:
    backgroundColor: "{colors.felt}"
    textColor: "{colors.ledger-gray}"
    rounded: "{rounded.pill}"
    padding: "0 10px 0 14px"
    height: "36px"
---

# Design System: vaults.cash

## Overview

**Creative North Star: "The Cash Drawer"**

vaults.cash looks like the inside of a cash drawer at night: a near-black
felt bed, one green that reads as money, and every figure printed where a
teller can read it at a glance. Surfaces are slabs that sit on the felt
(lifted, not floating), controls are pills you can press, and numbers are
the loudest thing on any screen. Nothing shouts, because a drawer with real
money in it doesn't need to.

The mood is playful but precise. Motion is allowed to have character (a
menu pops, a bill escapes, a tick lands with a spring) but only where it
explains something, and never on a number. The app is phone-first and
task-first: one bright action per screen, plain words next to every risk,
and the fee written down before anyone signs.

Confirmed anti-references: no gradient text, no glass-as-decoration, no hype
metrics, no invented proof, no stock-photo hands holding phones.

**Key Characteristics:**
- Near-black tonal layering with a single money-green accent
- Tabular figures everywhere a number lives; mono for prices, ranges, addresses
- Pills for everything interactive; big radii for everything that contains
- Lifted cards on a felt bed; stronger lift only for things that float
- One authored motion moment per surface, spring-eased, reduced-motion safe

## Colors

A drawer palette: black felt, white bills, one green, one red flag.

### Primary
- **Fresh Bill** (#7cd44a): the money green. Primary actions, earned fees, the
  in-range dot, active filters. Rare by design: it marks what pays.
- **Crisp Bill** (#8ee55c): the same green a shade brighter, only as the hover
  or pressed state of a Fresh Bill surface.
- **Deep Ink** (#2f7a1e): green for large areas and watermark artwork where
  Fresh Bill would glare (landing backdrops, the fee ticks' shadow).

### Neutral
- **Drawer Black** (#0b0d0b): the page. Also the well behind inputs and the
  signing-steps list, so entry fields read as cut into the surface.
- **Felt** (#141714): the resting surface for cards, rows, and the confirm
  card's siblings. Most of any screen is felt.
- **Till** (#1b1f1b): one step up: raised panels inside cards, secondary
  buttons, chips, the active nav pill, sheets and menus.
- **Seam** (#262b26): hairline borders on menus, the hover state of till
  surfaces, scrollbar thumbs, dividers.
- **Bill White** (#f4f6f4): primary text and figures.
- **Ledger Gray** (#8b938b): secondary text, labels, placeholder ink, inactive
  tabs. Never for a number that matters.

### Semantic
- **Red Flag** (#ff5c5c): out-of-range, errors, idle pools, log out. Always on
  a 15% tint of itself, never as a filled button.

### Named Rules
**The One Green Rule.** Fresh Bill appears on at most one action per screen
and on figures that represent money earned. If two things are green, one of
them is wrong.

**The Tinted Semantic Rule.** Red and green state chips sit on a 15% tint of
their own hue, never on gray. Gray is for things that are merely secondary.

## Typography

**Display Font:** Geist (with -apple-system, sans-serif)
**Body Font:** Geist
**Figure/Mono Font:** Geist Mono (with ui-monospace)

**Character:** one sans for everything readable, tight and confident at
display size, neutral at body size; a mono cousin for anything a teller would
double-check. Tabular numerals are on globally, so columns of money align
without effort.

### Hierarchy
- **Display** (700, clamp(3rem, 6vw, 4.5rem), 1.05, -0.025em): landing
  headline only; balanced wrapping.
- **Headline** (700, 1.875rem, 1.15, -0.02em): page and pair titles
  ("cbETH / ETH", "Account"). The quote symbol sits in Ledger Gray after a
  gray slash.
- **Title** (600, 1.125rem, 1.3): section headings and sheet titles.
- **Money** (700, 2.25rem to 2.5rem, tight tracking): the big number on a
  card or sheet; Geist, not mono, because it is a headline, not a ledger.
- **Body** (400, 0.875rem, 1.5): explanations, notes, disclosures; 65 to
  75 characters per line.
- **Label** (500, 0.6875rem, 0.04em, uppercase for stat labels): stat
  captions and chips.
- **Figure** (Geist Mono, 0.875rem, tnum): prices, ranges, addresses,
  calldata. Anything you could copy into another tool.

### Named Rules
**The Ledger Rule.** A number the user might act on is set in Geist Mono
with tabular figures. Prose numbers (a "$5 minimum" in a sentence) stay in
Geist.

## Layout

A single centered column, 768px max (the app shell), 16px side gutters, with
a sticky translucent header. Phones get a bottom tab bar (Pools, Portfolio,
Account) and sheets that rise from the bottom; from 640px up, sheets center
and the pool list becomes a five-column table (pool, price, liquidity, 24h
volume, est. APR). Marketing pages use a 672px reading column.

Spacing is a 4px scale. Inside a card: 20px padding, 8px between related
controls, 12px between groups, 16px above a section label. Between cards:
8px in a list, 32px between sections. Headings carry more space above than
below.

## Elevation & Depth

Lifted, quietly. The felt bed is flat; everything that contains sits on it
with a soft, downward shadow so it reads as a slab rather than a painted
rectangle. Things that float (menus, sheets) get a longer, darker shadow
plus a hairline seam so they separate from the cards beneath them. Depth
never comes from gradients or glows.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 8px 24px -16px rgb(0 0 0 / 0.7), inset 0 1px 0 rgb(255 255 255 / 0.04)`): cards, rows, stat tiles at rest. The inset hairline is the top edge catching light.
- **Elevated** (`box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.65), 0 2px 8px rgb(0 0 0 / 0.35)`): menus, popovers, sheets.

### Named Rules
**The Slab Rule.** Shadows have an offset and a blur, always downward. A
zero-offset halo is decoration and is not part of this system.

## Shapes

Two silhouettes: the pill and the slab. Anything you press is a pill (9999px):
buttons, chips, filters, select triggers, nav tabs. Anything that contains is
a slab with large corners: 24px for cards and sheets, 16px for list rows,
panels and menus, 12px for inputs and menu items. Borders are rare; a 1px
Seam hairline only where a floating surface needs an edge. The token mark is
a circle; pair marks overlap with the base token on top.

## Components

### Buttons
- **Shape:** full pill (9999px); primary is 12px tall padding, secondary 8px.
- **Primary:** Fresh Bill background, black text, 600 weight. One per screen.
- **Hover / Focus / Press:** hover to Crisp Bill; keyboard focus draws a 2px
  Fresh Bill ring 2px outside; press scales to 98% for 120ms. Disabled drops
  to 40% opacity with a not-allowed cursor.
- **Secondary:** Till background, Bill White text; hover to Seam.
- **Danger:** Red Flag text on a 15% Red Flag tint; hover to 25%.
- **Copy:** buttons name the outcome with the amount when there is one
  ("Withdraw $5.79", "Minimum $5.00"), never "Submit".

### Chips
- **Style:** pill, 11px medium, 2px by 8px padding. Neutral chips are Ledger
  Gray on Till; outline chips (chain names) are a Seam hairline with gray text.
- **State:** Fresh Bill on 15% green for earning/steady; Red Flag on 15% red
  for out-of-range, idle, errors. Chips inform; they are not buttons.

### Cards / Containers
- **Corner Style:** 24px (cards, sheets); 16px (rows, inner panels).
- **Background:** Felt at rest; Till for a panel nested inside a card.
- **Shadow Strategy:** card lift at rest; elevated only when floating.
- **Border:** none on cards; 1px Seam on menus.
- **Internal Padding:** 20px cards, 16px rows, 12px inner panels.

### Inputs / Fields
- **Style:** Drawer Black well, 12px corners, no border; the big deposit
  amount is a bare 1.875rem bold field after a "$".
- **Focus:** the global 2px Fresh Bill ring.
- **Placeholder:** Ledger Gray at 55%.

### Select
- **Trigger:** pill on Felt, gray text, chevron that rotates 180° when open;
  hover and open states move to Till and white text.
- **Menu:** Till, 16px corners, Seam hairline, elevated shadow, 4px inner
  padding; options are 12px-radius rows with a green check on the current
  choice and an optional gray hint line. Arrow keys, Home/End, Enter, Escape.

### Sheet (signature)
- Bottom sheet on phones (24px top corners, a 40px drag handle, safe-area
  padding), centered card from 640px; Till surface, elevated shadow, 60%
  black scrim with a light blur. Title, the money line, a definition list of
  what the user gets and pays, a plain sentence on what happens, the
  "What you're signing" disclosure, then Keep it / primary action.

### Range Bar (signature)
- A log-scale track in Till with the user's band in Fresh Bill and a white
  dot for the current price; bounds and "now" are Geist Mono captions.

### Navigation
- Desktop: three pills in the header, active on Till; mobile: fixed bottom
  bar with icon plus 10px label, active in Fresh Bill.

## Do's and Don'ts

### Do:
- **Do** put the fee, the minimum you receive, and the chain on every confirm
  sheet before the button.
- **Do** set money in tabular figures and copyable values in Geist Mono.
- **Do** use one green action per screen and let it be the only saturated
  thing in view.
- **Do** lift cards with the card-lift shadow and reserve the elevated
  shadow for menus and sheets.
- **Do** give every custom control keyboard behavior and the accent focus
  ring; sheets trap focus and restore it.
- **Do** respect reduced motion; the pop and rise animations switch off.

### Don't:
- **Don't** use gradient text, glass panels as decoration, or glows in place
  of shadows.
- **Don't** invent proof: no testimonials, TVL badges, "audited" claims or
  APY promises anywhere in the UI.
- **Don't** use emoji or unicode glyphs as icons; draw SVG at 14 to 16px in
  a 1.75 stroke.
- **Don't** hide which chain money is on, and don't show an amount without
  its currency.
- **Don't** put a colored left border on cards or alerts; state lives in the
  chip, not the frame.
