import { useState, useRef, useEffect, useCallback } from "react";

export default function DeEsser() {
  const [active, setActive] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [gainReduction, setGainReduction] = useState(0);
  const [ssDetected, setSsDetected] = useState(false);

  const [threshold, setThreshold] = useState(-28);
  const [frequency, setFrequency] = useState(7000);
  const [bandwidth, setBandwidth] = useState(2.0);
  const [ratio, setRatio] = useState(6);
  const [attack, setAttack] = useState(2);
  const [release, setRelease] = useState(40);
  const [listen, setListen] = useState(false);
  const [mode, setMode] = useState("broadband");
  const [preset, setPreset] = useState("vocal");

  const nodesRef = useRef({});
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const analyserInRef = useRef(null);
  const analyserOutRef = useRef(null);
  const sibilanceRef = useRef(null);
  const grRef = useRef(0);

  const stopChain = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try { nodesRef.current.src?.disconnect(); } catch (e) {}
    nodesRef.current = {};
    setActive(false);
    setInputLevel(0);
    setOutputLevel(0);
    setGainReduction(0);
    setSsDetected(false);
  };

  const buildChain = useCallback(async () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const src = ctx.createMediaStreamSource(stream);

    const analyserIn = ctx.createAnalyser();
    analyserIn.fftSize = 512;
    analyserInRef.current = analyserIn;

    const hpfSide = ctx.createBiquadFilter();
    hpfSide.type = "bandpass";
    hpfSide.frequency.value = frequency;
    hpfSide.Q.value = bandwidth;

    const sibilanceAnalyser = ctx.createAnalyser();
    sibilanceAnalyser.fftSize = 256;
    sibilanceRef.current = sibilanceAnalyser;

    const deessComp = ctx.createDynamicsCompressor();
    deessComp.threshold.value = threshold;
    deessComp.knee.value = 2;
    deessComp.ratio.value = ratio;
    deessComp.attack.value = attack / 1000;
    deessComp.release.value = release / 1000;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.3;
    const outMix = ctx.createGain();

    const analyserOut = ctx.createAnalyser();
    analyserOut.fftSize = 512;
    analyserOutRef.current = analyserOut;

    src.connect(analyserIn);
    src.connect(hpfSide);
    hpfSide.connect(sibilanceAnalyser);
    hpfSide.connect(deessComp);

    if (listen) {
      hpfSide.connect(analyserOut);
      hpfSide.connect(ctx.destination);
    } else {
      src.connect(dryGain);
      deessComp.connect(wetGain);
      dryGain.connect(outMix);
      wetGain.connect(outMix);
      outMix.connect(analyserOut);
      outMix.connect(ctx.destination);
    }

    nodesRef.current = { src, hpfSide, sibilanceAnalyser, deessComp, dryGain, wetGain, outMix };

    const tick = () => {
      if (analyserInRef.current) {
        const d = new Uint8Array(analyserInRef.current.frequencyBinCount);
        analyserInRef.current.getByteTimeDomainData(d);
        const rms = Math.sqrt(d.reduce((s, v) => s + Math.pow((v - 128) / 128, 2), 0) / d.length);
        setInputLevel(Math.min(100, rms * 300));
      }
      if (analyserOutRef.current) {
        const d = new Uint8Array(analyserOutRef.current.frequencyBinCount);
        analyserOutRef.current.getByteTimeDomainData(d);
        const rms = Math.sqrt(d.reduce((s, v) => s + Math.pow((v - 128) / 128, 2), 0) / d.length);
        setOutputLevel(Math.min(100, rms * 300));
      }
      if (sibilanceRef.current) {
        const d = new Uint8Array(sibilanceRef.current.frequencyBinCount);
        sibilanceRef.current.getByteFrequencyData(d);
        const avg = d.reduce((s, v) => s + v, 0) / d.length;
        const detected = avg > 30;
        setSsDetected(detected);
        const targetGR = detected ? Math.min(100, avg / 2) : 0;
        grRef.current = grRef.current * 0.85 + targetGR * 0.15;
        setGainReduction(Math.round(grRef.current));
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [threshold, frequency, bandwidth, ratio, attack, release, listen]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.hpfSide) return;
    n.hpfSide.frequency.value = frequency;
    n.hpfSide.Q.value = bandwidth;
    n.deessComp.threshold.value = threshold;
    n.deessComp.ratio.value = ratio;
    n.deessComp.attack.value = attack / 1000;
    n.deessComp.release.value = release / 1000;
  }, [threshold, frequency, bandwidth, ratio, attack, release]);

  useEffect(() => () => stopChain(), []);

  const applyPreset = (p) => {
    setPreset(p);
    if (p === "vocal") { setThreshold(-28); setFrequency(7000); setBandwidth(2); setRatio(6); setAttack(2); setRelease(40); }
    if (p === "harsh") { setThreshold(-24); setFrequency(6000); setBandwidth(1.5); setRatio(8); setAttack(1); setRelease(30); }
    if (p === "rap") { setThreshold(-22); setFrequency(8000); setBandwidth(2.5); setRatio(10); setAttack(1); setRelease(25); }
    if (p === "subtle") { setThreshold(-32); setFrequency(7500); setBandwidth(1.8); setRatio(4); setAttack(3); setRelease(60); }
  };

  const Knob = ({ label, value, min, max, step = 1, unit = "", onChange, color = "#993556" }) => {
    const pct = (value - min) / (max - min);
    const angle = -135 + pct * 270;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div
          style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid var(--color-border-secondary)`, position: "relative", cursor: "ns-resize", background: "var(--color-background-secondary)" }}
          onMouseDown={(e) => {
            const startY = e.clientY, startVal = value;
            const move = (me) => onChange(Math.min(max, Math.max(min, Math.round((startVal + (startY - me.clientY) * (max - min) / 120) / step) * step)));
            const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
            window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
          }}
        >
          <div style={{ position: "absolute", top: "50%", left: "50%", width: 2, height: 16, background: color, transformOrigin: "bottom center", transform: `translate(-50%, -100%) rotate(${angle}deg)`, borderRadius: 1 }} />
        </div>
        <span style={{ fontSize: 10, color: "var(--color-text-secondary)", textAlign: "center" }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 500 }}>{value}{unit}</span>
      </div>
    );
  };

  const Meter = ({ level, label, color }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 80, background: "var(--color-background-tertiary)", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ width: "100%", height: `${level}%`, background: level > 80 ? "#E24B4A" : level > 60 ? "#EF9F27" : color, borderRadius: 4, transition: "height 0.05s" }} />
      </div>
      <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>{label}</span>
    </div>
  );

  const FreqViz = () => {
    const pct = (frequency - 2000) / (16000 - 2000);
    return (
      <div style={{ position: "relative", width: "100%", height: 48, background: "var(--color-background-tertiary)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: `${pct * 100}%`, top: 0, bottom: 0, width: `${Math.min(30, bandwidth * 8)}%`, transform: "translateX(-50%)", background: ssDetected ? "#99355644" : "#99355622", transition: "all 0.1s", borderRadius: 4 }} />
        <div style={{ position: "absolute", left: `${pct * 100}%`, top: 0, bottom: 0, width: 2, background: "#993556", transform: "translateX(-50%)", transition: "left 0.1s" }} />
        <div style={{ position: "absolute", bottom: 4, left: 6, fontSize: 9, color: "var(--color-text-tertiary)" }}>2k</div>
        <div style={{ position: "absolute", bottom: 4, left: "25%", fontSize: 9, color: "var(--color-text-tertiary)" }}>5.5k</div>
        <div style={{ position: "absolute", bottom: 4, left: "50%", fontSize: 9, color: "var(--color-text-tertiary)" }}>9k</div>
        <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: 9, color: "var(--color-text-tertiary)" }}>16k</div>
        {ssDetected && <div style={{ position: "absolute", top: 6, right: 10, fontSize: 9, fontWeight: 500, color: "#993556", background: "#99355622", padding: "1px 6px", borderRadius: 4 }}>sibilance</div>}
      </div>
    );
  };

  return (
    <div style={{ padding: 16, maxWidth: 680, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>De-esser</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>Tames harsh sibilance on S, T, and SH sounds</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Meter level={inputLevel} label="IN" color="#1D9E75" />
            <Meter level={gainReduction} label="GR" color="#993556" />
            <Meter level={outputLevel} label="OUT" color="#993556" />
          </div>
          <button onClick={async () => { if (active) { stopChain(); } else { setActive(true); await buildChain(); } }}
            style={{ padding: "8px 20px", borderRadius: 8, border: `1.5px solid ${active ? "#E24B4A" : "#993556"}`, background: active ? "#E24B4A11" : "#99355611", color: active ? "#E24B4A" : "#993556", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
            {active ? "Stop" : "Start mic"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {["vocal", "harsh", "rap", "subtle"].map(p => (
          <button key={p} onClick={() => applyPreset(p)}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, border: `1px solid ${preset === p ? "#993556" : "var(--color-border-secondary)"}`, background: preset === p ? "#99355622" : "transparent", color: preset === p ? "#993556" : "var(--color-text-secondary)", cursor: "pointer" }}>
            {p}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: "0 0 6px", fontSize: 11, color: "var(--color-text-secondary)" }}>Frequency detector</p>
        <FreqViz />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
        <div style={{ border: "1px solid #99355644", borderRadius: 10, padding: "12px 14px", background: "#99355608" }}>
          <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 500, color: "#993556" }}>Detection</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Knob label="Freq" value={frequency} min={2000} max={16000} step={100} onChange={setFrequency} unit=" Hz" />
            <Knob label="Width" value={bandwidth} min={0.5} max={5} step={0.1} onChange={setBandwidth} />
          </div>
        </div>
        <div style={{ border: "1px solid #99355444", borderRadius: 10, padding: "12px 14px", background: "#99355408" }}>
          <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 500, color: "#712B13" }}>Reduction</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Knob label="Threshold" value={threshold} min={-48} max={0} onChange={setThreshold} unit=" dB" color="#712B13" />
            <Knob label="Ratio" value={ratio} min={2} max={20} onChange={setRatio} unit=":1" color="#712B13" />
          </div>
        </div>
        <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 14px" }}>
          <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>Timing</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Knob label="Attack" value={attack} min={1} max={20} onChange={setAttack} unit=" ms" color="#888780" />
            <Knob label="Release" value={release} min={10} max={200} onChange={setRelease} unit=" ms" color="#888780" />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Mode</span>
        <div style={{ display: "flex", gap: 6 }}>
          {["broadband", "split-band"].map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${mode === m ? "#993556" : "var(--color-border-secondary)"}`, background: mode === m ? "#99355622" : "transparent", color: mode === m ? "#993556" : "var(--color-text-secondary)", cursor: "pointer" }}>
              {m}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Listen mode</span>
          <button onClick={() => setListen(!listen)}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${listen ? "#EF9F27" : "var(--color-border-secondary)"}`, background: listen ? "#EF9F2722" : "transparent", color: listen ? "#BA7517" : "var(--color-text-secondary)", cursor: "pointer" }}>
            {listen ? "ON — hearing sibilance band" : "OFF"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "var(--color-background-secondary)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
        <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>Pro tip · </span>
        Use listen mode to isolate the sibilance band, then dial in frequency. Turn listen off when setting threshold — you want just enough reduction that harsh S sounds are tamed but the vocal still feels natural. For rap, set frequency higher (8–9kHz) and ratio harder (8–10:1).
      </div>
    </div>
  );
}
