
## 2026-09-30 — Phone app is gated behind sign-in, with an intro
The iOS app now opens on a welcome door (three swipeable slides: the brand, how Pools work,
how Targets work) with the sign-in tray under it: Apple's official white button, a white
Google pill, and "Email or Phone" that turns the tray into the code flow. Nothing else is
reachable until Privy has a user (expo-router `Stack.Protected`). This matches how the
comparable apps (fomo, Liquid) open and stops an anonymous browse of pools from being the
first impression. Sign-in buttons are Bill White, not green: Apple's button must be
white/black by their rules, and the One Green Rule keeps green for the money in the slides.
The native splash is held until fonts and Privy are ready, so there is one loading state.
Fonts: a static Bricolage ExtraBold instance (generated with fonttools from the web's
variable TTF) plus Geist / Geist Mono statics live in mobile/assets/fonts and load with
expo-font; the display face is now the same on phone and web.
