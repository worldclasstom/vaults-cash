---
name: vaults.cash
description: Robinhood-simple earning on Uniswap, drawn as a sticker-covered ledger
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
  sticker-yellow: "#ffd23f"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Geist, sans-serif"
    fontSize: "clamp(3rem, 6vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Bricolage Grotesque, Geist, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  money:
    fontFamily: "Bricolage Grotesque, Geist, sans-serif"
    fontSize: "clamp(1.875rem, 5vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Bricolage Grotesque, Geist, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
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
  sticker:
    backgroundColor: "{colors.bill-white}"
    textColor: "{colors.drawer-black}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    typography: "{typography.label}"
  sticker-good:
    backgroundColor: "{colors.fresh-bill}"
    textColor: "#000000"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  sticker-warn:
    backgroundColor: "{colors.red-flag}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  sticker-chain:
    backgroundColor: "{colors.sticker-yellow}"
    textColor: "#000000"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
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

**Creative North Star: "The Sticker Ledger"**

vaults.cash is a ledger someone fun keeps: a near-black felt bed, money set
enormous in a rounded grotesque, and state slapped on as stickers with white
edges that never sit quite straight. Cards tilt toward you when you reach
for them, rows nudge over, buttons bounce and then press in, and "+$" pops
up when money lands. One green still owns every action; yellow and red
exist only as stickers that say something.

The mood is playful but precise. The play lives in type size, stickers and
motion; the precision lives in the numbers, which stay tabular, exact and
never animated for effect. Confirm sheets stay calm: the fun stops at the
door where money moves. Phone-first, one bright action per screen, plain
words next to every risk, the fee written down before anyone signs.

Confirmed anti-references: no gradient text, no glass-as-decoration, no hype
metrics, no invented proof, no stock-photo hands holding phones.

**Key Characteristics:**
- Bricolage Grotesque at 800 for every heading, pair name, money figure and button
- Stickers for state: white edge, crooked, green / yellow / red / white by meaning
- Bouncy easing (`cubic-bezier(.34,1.56,.64,1)`): cards tilt, rows nudge, buttons bounce
- Numbers are the biggest thing on any screen and stay exact and tabular
- One green action per screen; confirm sheets stay calm

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

### Secondary
- **Sticker Yellow** (#ffd23f): the chain sticker (Base, Robinhood) and
  nothing else. Never a button, never text on dark.

### Semantic
- **Red Flag** (#ff5c5c): the warn sticker (Out of range, No trades in 24h),
  errors, log out. As a sticker it is a solid fill with white text; as text
  it sits on a 15% tint.

### Named Rules
**The One Green Rule.** Fresh Bill appears on at most one action per screen
and on figures that represent money earned. If two things are green, one of
them is wrong.

**The Sticker Rule.** State is a sticker: solid fill, 2.5px Bill White edge,
a small drop shadow, rotated a few degrees (alternating by position). White
for facts (fee tier, stock token), green for good, red for warn, yellow for
the chain. Stickers inform; they are never buttons.

## Typography

**Display Font:** Bricolage Grotesque (with Geist, sans-serif)
**Body Font:** Geist
**Figure/Mono Font:** Geist Mono (with ui-monospace)

**Character:** a rounded, slightly eccentric grotesque at 800 for everything
that should feel like a headline (titles, pair names, money, buttons) over a
neutral Geist body; Geist Mono for anything a teller would double-check.
Tabular numerals are on globally. The display face is where the fun lives,
so body copy never borrows it.

### Hierarchy
- **Display** (700, clamp(3rem, 6vw, 4.5rem), 1.05, -0.025em): landing
  headline only; balanced wrapping.
- **Headline** (700, 1.875rem, 1.15, -0.02em): page and pair titles
  ("cbETH / ETH", "Account"). The quote symbol sits in Ledger Gray after a
  gray slash.
- **Title** (600, 1.125rem, 1.3): section headings and sheet titles.
- **Money** (Bricolage 800, 1.875rem on cards up to 3.75rem on the
  portfolio total, tracking -0.04em): the big number on a card, sheet or
  page. Always the largest thing in its container.
- **Body** (400, 0.875rem, 1.5): explanations, notes, disclosures; 65 to
  75 characters per line.
- **Label** (500, 0.6875rem, 0.04em, uppercase for stat labels): stat
  captions and chips.
- **Figure** (Geist Mono, 0.875rem, tnum): prices, ranges, addresses,
  calldata. Anything you could copy into another tool.

### Named Rules
**The Ledger Rule.** A number the user might act on is set in Geist Mono
with tabular figures; a number that is the headline of its card is set in
Bricolage 800. Prose numbers stay in Geist. Numbers never animate.

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
- **Hover / Focus / Press:** primary buttons bounce to 104% and tilt -1° on
  hover (bounce ease, 200ms) and press to 96%; keyboard focus draws a 2px
  Fresh Bill ring 2px outside. Disabled drops to 40% opacity with a
  not-allowed cursor.
- **Secondary:** Till background, Bill White text; hover to Seam.
- **Danger:** Red Flag text on a 15% Red Flag tint; hover to 25%.
- **Copy:** buttons name the outcome with the amount when there is one
  ("Withdraw $5.79", "Minimum $5.00"), never "Submit".

### Stickers (chips)
- **Style:** pill, 11px Bricolage 700, 2px by 10px padding, 2.5px Bill White
  edge, `0 2px 6px rgb(0 0 0 / .45)` shadow, rotated -3° / 2.5° / -1.5° by
  position in the row.
- **Meaning:** white (fee tier, stock token), green (Earning, Steady), red
  (Out of range, No trades in 24h), yellow (chain). Stickers inform; they are
  not buttons.

### Cards / Containers
- **Corner Style:** 24px (cards, sheets); 16px (rows, inner panels).
- **Background:** Felt at rest; Till for a panel nested inside a card.
- **Shadow Strategy:** card lift at rest; elevated when floating or hovered.
- **Motion:** position cards and range presets tilt -1° and grow 1.5% on
  hover (`.tilt`); pool rows nudge 6px right (`.nudge`). Both on the bounce
  ease, both off under reduced motion.
- **Border:** none on cards; 1px Seam on menus.
- **Internal Padding:** 20px cards, 16px rows, 12px inner panels.

### Fee Bar (signature)
- Under every position: a 10px pill track in Till with a Deep Ink → Fresh
  Bill fill showing how far the fees traders paid have gone toward covering
  the 0.6% it cost to enter; "Entry fee covered — every fee from here is
  profit" at 100%. Honest by construction: it measures money, not vibes.

### Cash Pop (signature)
- When a deposit is confirmed, four "+$" in Bricolage 800 Fresh Bill float
  up out of the card (2.2s, staggered). The only decorative motion in the app.

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
- **Do** use one green action per screen; yellow and red appear only as
  stickers that mean something.
- **Do** set the headline number of every card in Bricolage 800 and make it
  the largest thing in the card.
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
  sticker, not the frame.
- **Don't** let the bounce reach a confirm sheet's numbers or buttons after
  the amount is shown; the moment money moves, motion stops.
