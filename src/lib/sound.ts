/**
 * The cash-drawer "ka-ching": two bright bell tones and a short metallic
 * clink, synthesized so there's nothing to load. Only ever called from a
 * user gesture's success path, which is what browsers require anyway.
 */
let ctx: AudioContext | null = null;

export function playKaching() {
  if (typeof window === "undefined") return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);

    const bell = (freq: number, at: number, dur: number) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      o.connect(g).connect(master);
      o.start(at);
      o.stop(at + dur);
    };
    // the clink: a burst of filtered noise
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4000;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    noise.connect(hp).connect(ng).connect(master);
    noise.start(t0);

    bell(1318.5, t0 + 0.02, 0.35); // E6
    bell(1975.5, t0 + 0.12, 0.5); // B6
    bell(2637, t0 + 0.12, 0.3); // E7, quieter shimmer
  } catch {
    /* no audio, no problem */
  }
}
