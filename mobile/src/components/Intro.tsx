/** The three intro slides behind the sign-in tray: the brand, how Pools work, how Targets work.
 *  Drawn in the Sticker Ledger voice: bills, crooked stickers, one green. */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Chip } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { colors, fonts, radius, stickerShadow } from "@/theme";

function Bill({ amount, label, tone = "usdc", rotate = 0 }: { amount: string; label: string; tone?: "in" | "usdc" | "eth"; rotate?: number }) {
  const bg = tone === "in" ? colors.accent : tone === "usdc" ? colors.usdc : colors.eth;
  const fg = tone === "in" ? "#000" : tone === "usdc" ? "#fff" : colors.ethInk;
  return (
    <View style={[s.bill, stickerShadow, { backgroundColor: bg, transform: [{ rotate: `${rotate}deg` }] }]}>
      <Text style={[s.billAmount, { color: fg }]}>{amount}</Text>
      <Text style={[s.billLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

function DownArrow() {
  return (
    <Svg width={20} height={26} viewBox="0 0 24 40" fill="none">
      <Path d="M12 4v30m0 0l-7-7m7 7l7-7" stroke={colors.muted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SlideHead({ tag, title, sub }: { tag: string; title: string; sub: string }) {
  return (
    <View style={{ gap: 8, alignItems: "center" }}>
      <View><Chip tone="white" rotate={-3}>{tag}</Chip></View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{sub}</Text>
    </View>
  );
}

function BrandSlide() {
  return (
    <View style={s.slide}>
      <View style={{ alignItems: "center", gap: 14 }}>
        <LogoMark size={96} />
        <Text style={s.wordmark}>
          vaults<Text style={{ color: colors.accent }}>.cash</Text>
        </Text>
      </View>
      <View style={{ gap: 10, alignItems: "center" }}>
        <Text style={s.headline}>
          Every trade pays a fee.{"\n"}Be the one <Text style={{ color: colors.accent }}>collecting it</Text>.
        </Text>
        <Text style={s.sub}>Hold ETH, Bitcoin or tokenized stocks and collect a slice of every trade, without trading.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Chip tone="base" rotate={-2}>Base</Chip>
        <Chip tone="robinhood" rotate={2}>Robinhood Chain</Chip>
        <Chip tone="yellow" rotate={-1.5}>Uniswap</Chip>
      </View>
    </View>
  );
}

function PoolsSlide() {
  return (
    <View style={s.slide}>
      <SlideHead tag="Pools" title="Put cash in. Every trade pays you." sub="Your deposit becomes a position that lives in your own wallet. While price stays in your range, every swap pays you." />
      <View style={s.board}>
        <Bill amount="$100" label="USDC YOU DEPOSIT" tone="in" rotate={-2} />
        <DownArrow />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Bill amount="$49.70" label="ETH" tone="eth" rotate={1.5} />
          <Bill amount="$49.70" label="USDC" tone="usdc" rotate={-1} />
        </View>
        <DownArrow />
        <View style={s.ticket}>
          <Text style={s.ticketTitle}>Position #3084756</Text>
          <Text style={s.ticketSub}>ETH / USDC · Uniswap v4</Text>
          <View style={{ position: "absolute", top: -12, right: -10 }}>
            <Chip tone="accent" rotate={3}>In your wallet</Chip>
          </View>
        </View>
        <Text style={s.foot}>0.6% fee, last call, only if everything above succeeded</Text>
      </View>
    </View>
  );
}


/** "+$" that rises and fades, the web's animate-cash-up. */
function Pop({ xPct }: { xPct: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.Text
      style={[
        s.pop,
        { left: `${xPct}%`, opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }), transform: [{ translateX: -10 }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) }] },
      ]}
    >
      +$
    </Animated.Text>
  );
}

/** A price that wanders. Inside your band, trades pay you; outside, it waits. Same curve as the web demo. */
function EarnSlide() {
  const [t, setT] = useState(0);
  const [pops, setPops] = useState<Array<{ id: number; x: number }>>([]);
  const lastPop = useRef(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const loop = () => {
      const now = Date.now();
      const sec = (now - start) / 1000;
      setT(sec);
      const x = 50 + 38 * Math.sin(sec * 0.55) + 8 * Math.sin(sec * 1.9);
      if (x >= 30 && x <= 70 && now - lastPop.current > 650) {
        lastPop.current = now;
        setPops((p) => [...p.slice(-5), { id: now, x }]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const x = 50 + 38 * Math.sin(t * 0.55) + 8 * Math.sin(t * 1.9);
  const inRange = x >= 30 && x <= 70;
  const price = 2400 + (x - 50) * 12;
  const tone = inRange ? colors.accent : colors.negative;
  return (
    <View style={s.slide}>
      <SlideHead tag="How you earn" title="In your range, every trade pays you." sub="The white dot is the market price. While it sits inside your band, each swap drops a slice of the pool fee on your position. Wander out and it waits; come back and it earns again." />
      <View style={[s.board, { alignItems: "stretch", gap: 0, paddingTop: 22 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 46 }}>
          <Text style={s.rangeTitle}>ETH / USDC · $2,160 – $2,640</Text>
          <Chip tone={inRange ? "accent" : "negative"} rotate={2}>{inRange ? "Earning" : "Paused"}</Chip>
        </View>
        <View>
          <View style={s.popLane} pointerEvents="none">
            {pops.map((p) => <Pop key={p.id} xPct={p.x} />)}
          </View>
          <View style={s.track}>
            <View style={[s.band, { backgroundColor: inRange ? "rgba(124,212,74,0.4)" : "rgba(255,92,92,0.3)" }]} />
            <View style={[s.edge, { left: "30%", backgroundColor: tone }]} />
            <View style={[s.edge, { left: "70%", backgroundColor: tone }]} />
            <View style={[s.marker, { left: `${x}%` }]} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8 }}>
            <Text style={s.axis}>$2,160</Text>
            <Text style={s.nowPrice}>now ${price.toFixed(0)}</Text>
            <Text style={s.axis}>$2,640</Text>
          </View>
        </View>
        <Text style={[s.foot, { marginTop: 14 }]}>Fees stack on your position. Collect any time, or take them along when you withdraw.</Text>
      </View>
    </View>
  );
}

/** Ticket → two halves → the chain's dollar back in your wallet, fee on the converted half only. */
function WithdrawSlide() {
  return (
    <View style={s.slide}>
      <SlideHead tag="When you withdraw" title="Take it out whenever." sub="The position is burned, both halves come back with the fees they earned, and the ETH half is swapped back to dollars. From there, send it anywhere." />
      <View style={s.board}>
        <View style={[s.ticket, { borderColor: "rgba(139,147,139,0.6)" }]}>
          <Text style={[s.ticketTitle, { textDecorationLine: "line-through", textDecorationColor: colors.negative }]}>Position #3084756</Text>
          <Text style={s.ticketSub}>closed, fees collected</Text>
        </View>
        <DownArrow />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Bill amount="$51.20" label="ETH → USDC" tone="eth" rotate={-1.5} />
          <Bill amount="$51.20" label="USDC" tone="usdc" rotate={1} />
        </View>
        <DownArrow />
        <Bill amount="$102.09" label="BACK IN YOUR WALLET" tone="in" rotate={-2} />
        <Text style={s.foot}>0.6% on the converted half only: 31¢ here, nothing on the USDC that was already USDC</Text>
      </View>
    </View>
  );
}

const RUNGS = [
  { price: "$5,200", pct: "25%", done: false },
  { price: "$4,800", pct: "25%", done: false },
  { price: "$4,400", pct: "25%", done: true },
  { price: "$4,000", pct: "25%", done: true },
];
const NOW_AFTER = 1; // the price line sits between the rungs above and below it

function TargetsSlide() {
  return (
    <View style={s.slide}>
      <SlideHead tag="Targets" title="Name your prices. It sells itself." sub="Set the prices you'd take profit at. Each one fills on its own as price gets there, and the cash lands in your wallet with the fees it earned on the way." />
      <View style={s.board}>
        <View style={s.ladder}>
          {RUNGS.map((r, i) => (
            <View key={r.price} style={{ gap: 6 }}>
              <View style={[s.rung, r.done && s.rungDone]}>
                <Text style={[s.rungPrice, r.done && { color: colors.muted, textDecorationLine: "line-through" }]}>{r.price}</Text>
                <Text style={s.rungPct}>sell {r.pct}</Text>
                <View style={{ marginLeft: "auto" }}>
                  {r.done ? <Chip tone="accent" rotate={i % 2 ? 2 : -2}>Sold  +$</Chip> : <Chip tone="outline" rotate={i % 2 ? 1.5 : -1.5}>Waiting</Chip>}
                </View>
              </View>
              {i === NOW_AFTER && (
                <View style={s.now}>
                  <View style={s.nowLine} />
                  <Text style={s.nowText}>ETH now  $4,520</Text>
                  <View style={s.nowLine} />
                </View>
              )}
            </View>
          ))}
        </View>
        <Text style={s.foot}>Closed by a public contract nobody can pause, not by us</Text>
      </View>
    </View>
  );
}

const SLIDES = [BrandSlide, PoolsSlide, EarnSlide, WithdrawSlide, TargetsSlide];

export function Intro() {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);
  const touched = useRef(false);

  // Auto-advance until the person swipes for themselves.
  useEffect(() => {
    const t = setInterval(() => {
      if (touched.current) return;
      setIndex((i) => {
        const next = (i + 1) % SLIDES.length;
        ref.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [width]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (touched.current = true)}
        onMomentumScrollEnd={onEnd}
        contentContainerStyle={{ alignItems: "stretch" }}
        style={{ flex: 1 }}
      >
        {SLIDES.map((Slide, i) => (
          <View key={i} style={{ width, flex: 1, justifyContent: "center" }}>
            <Slide />
          </View>
        ))}
      </ScrollView>
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === index && s.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  slide: { flex: 1, paddingHorizontal: 24, justifyContent: "center", alignItems: "center", gap: 22 },
  wordmark: { fontFamily: fonts.display, fontSize: 40, color: colors.foreground, letterSpacing: -1 },
  headline: { fontFamily: fonts.display, fontSize: 30, lineHeight: 33, color: colors.foreground, textAlign: "center", letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 29, color: colors.foreground, textAlign: "center", letterSpacing: -0.5, paddingTop: 4 },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: "center", maxWidth: 340 },
  board: { width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, alignItems: "center", gap: 6 },
  bill: { minWidth: 118, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" },
  billAmount: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.5 },
  billLabel: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.6, opacity: 0.85, marginTop: 1 },
  ticket: { borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(124,212,74,0.6)", backgroundColor: colors.surfaceRaised, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 18, alignItems: "center", marginTop: 4 },
  ticketTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.foreground },
  ticketSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  foot: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 8 },
  ladder: { width: "100%", gap: 6 },
  rung: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceRaised, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 14 },
  rungDone: { backgroundColor: colors.background },
  rungPrice: { fontFamily: fonts.mono, fontSize: 15, color: colors.foreground, fontVariant: ["tabular-nums"] },
  rungPct: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  now: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
  nowLine: { flex: 1, height: 1, backgroundColor: "rgba(124,212,74,0.5)" },
  nowText: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.accent },
  rangeTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.foreground, flexShrink: 1 },
  popLane: { position: "absolute", left: 0, right: 0, top: -44, height: 44 },
  pop: { position: "absolute", bottom: 0, fontFamily: fonts.display, fontSize: 18, color: colors.accent },
  track: { height: 16, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  band: { position: "absolute", top: 0, bottom: 0, left: "30%", width: "40%", borderRadius: 8 },
  edge: { position: "absolute", top: 0, bottom: 0, width: 4 },
  marker: { position: "absolute", top: -4, width: 24, height: 24, marginLeft: -12, borderRadius: 12, backgroundColor: colors.foreground, borderWidth: 3, borderColor: colors.background, ...stickerShadow },
  axis: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  nowPrice: { fontFamily: fonts.display, fontSize: 14, color: colors.foreground },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7, paddingVertical: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.foreground, width: 20 },
});
