import { useState, useRef, useEffect, useCallback } from "react";

export default function VocalDoubler() {
  const [active, setActive] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const [detuneL, setDetuneL] = useState(-8);
  const [detuneR, setDetuneR] = useState(8);
  const [delayL, setDelayL] = useState(18);
  const [delayR, setDelayR] = useState(23);
  const [widthL, setWidthL] = useState(-1);
  const [widthR, setWidthR] = useState(1);
  const [mix, setMix] = useState(50);
  const [dryGainVal, setDryGainVal] = useState(80);
  const [preset, setPreset] = useState("subtle");

  const nodesRef = useRef({});
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const analyserInRef = useRef(null);
  const analyserOutRef = useRef(null);

  const stopChain = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try { nodesRef.current.src?.disconnect(); } catch (e) {}
    nodesRef.current = {};
    setActive(false);
    setInputLevel(0);
    setOutputLevel(0);
  };

  const buildChain = useCallback(async () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const src = ctx.createMediaStreamSource(stream);

    const analyserIn = ctx.createAnalyser(); analyserIn.fftSize = 256;
    analyserInRef.current = analyserIn;

    const dryGain = ctx.createGain();
    dryGain.gain.value = dryGainVal / 100;

    const delNodeL = ctx.createDelay(0.2);
    delNodeL.delayTime.value = delayL / 1000;
    const delNodeR = ctx.createDelay(0.2);
    delNodeR.delayTime.value = delayR / 1000;

    const pitchShiftL = ctx.createBiquadFilter();
    pitchShiftL.type = "allpass";
    pitchShiftL.frequency.value = 200 + detuneL * 10;

    const pitchShiftR = ctx.createBiquadFilter();
    pitchShiftR.type = "allpass";
    pitchShiftR.frequency.value = 200 + detuneR * 10;

    const panL = ctx.createStereoPanner();
    panL.pan.value = widthL;
    const panR = ctx.createStereoPanner();
    panR.pan.value = widthR;

    const wetGainL = ctx.createGain();
    wetGainL.gain.value = mix / 100 * 0.7;
    const wetGainR = ctx.createGain();
    wetGainR.gain.value = mix / 100 * 0.7;

    const masterOut = ctx.createGain();
    masterOut.gain.value = 1.0;

    const analyserOut = ctx.createAnalyser(); analyserOut.fftSize = 256;
    analyserOutRef.current = analyserOut;

    src.connect(analyserIn);
    src.connect(dryGain);
    src.connect(delNodeL);
    src.connect(delNodeR);
    delNodeL.connect(pitchShiftL);
    delNodeR.connect(pitchShiftR);
    pitchShiftL.connect(wetGainL);
    pitchShiftR.connect(wetGainR);
    wetGainL.connect(panL);
    wetGainR.connect(panR);
    dryGain.connect(masterOut);
    panL.connect(masterOut);
    panR.connect(masterOut);
    masterOut.connect(analyserOut);
    masterOut.connect(ctx.destination);

    nodesRef.current = { src, dryGain, delNodeL, delNodeR, pitchShiftL, pitchShiftR, wetGainL, wetGainR, panL, panR, masterOut };

    const tick = () => {
      [{ ref: analyserInRef, set: setInputLevel }, { ref: analyserOutRef, set: setOutputLevel }].forEach(({ ref, set }) => {
        if (!ref.current) return;
        const d = new Uint8Array(ref.current.frequencyBinCount);
        ref.current.getByteTimeDomainData(d);
        const rms = Math.sqrt(d.reduce((s, v) => s + Math.pow((v - 128) / 128, 2), 0) / d.length);
        set(Math.min(100, rms * 300));
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [detuneL, detuneR, delayL, delayR, widthL, widthR, mix, dryGainVal]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.delNodeL) return;
    n.delNodeL.delayTime.value = delayL / 1000;
    n.delNodeR.delayTime.value = delayR / 1000;
    n.pitchShiftL.frequency.value = 200 + detuneL * 10;
    n.pitchShiftR.frequency.value = 200 + detuneR * 10;
    n.panL.pan.value = widthL;
    n.panR.pan.value = widthR;
    n.wetGainL.gain.value = mix / 100 * 0.7;
    n.wetGainR.gain.value = mix / 100 * 0.7;
    n.dryGain.gain.value = dryGainVal / 100;
  }, [detuneL, detuneR, delayL, delayR, widthL, widthR, mix, dryGainVal]);

  useEffect(() => () => stopChain(), []);

  const applyPreset = (p) => {
    setPreset(p);
    if (p === "subtle") { setDetuneL(-5); setDetuneR(5); setDelayL(12); setDelayR(16); setWidthL(-0.6); setWidthR(0.6); setMix(35); setDryGainVal(90); }
    if (p === "thick") { setDetuneL(-12); setDetuneR(12); setDelayL(20); setDelayR(28); setWidthL(-1); setWidthR(1); setMix(60); setDryGainVal(80); }
    if (p === "wide") { setDetuneL(-18); setDetuneR(18); setDelayL(30); setDelayR(38); setWidthL(-1); setWidthR(1); setMix(70); setDryGainVal(75); }
    if (p === "gospel-choir") { setDetuneL(-10); setDetuneR(14); setDelayL(22); setDelayR(35); setWidthL(-0.8); setWidthR(0.9); setMix(55); setDryGainVal(85); }
  };

  const Knob = ({ label, value, min, max, step = 1, unit = "", onChange, color }) => {
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

  const StereoViz = () => (
    <div style={{ position: "relative", width: "100%", height: 60, background: "var(--color-background-tertiary)", borderRadius: 8, overflow: "hidden", marginTop: 4 }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--color-border-secondary)", transform: "translateX(-50%)" }} />
      <div style={{ position: "absolute", top: "50%", left: `${((widthL + 1) / 2) * 100}%`, transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: "#D4537E", transition: "left 0.1s" }} />
      <div style={{ position: "absolute", top: "50%", left: `${((widthR + 1) / 2) * 100}%`, transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: "#378ADD", transition: "left 0.1s" }} />
      <span style={{ position: "absolute", bottom: 4, left: 6, fontSize: 9, color: "var(--color-text-tertiary)" }}>L</span>
      <span style={{ position: "absolute", bottom: 4, right: 6, fontSize: 9, color: "var(--color-text-tertiary)" }}>R</span>
      <span style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "var(--color-text-tertiary)" }}>C</span>
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 680, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Vocal doubler</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>Thickens vocals with stereo pitch + delay offsets</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Meter level={inputLevel} label="IN" color="#1D9E75" />
            <Meter level={outputLevel} label="OUT" color="#D4537E" />
          </div>
          <button onClick={async () => { if (active) { stopChain(); } else { setActive(true); await buildChain(); } }}
            style={{ padding: "8px 20px", borderRadius: 8, border: `1.5px solid ${active ? "#E24B4A" : "#D4537E"}`, background: active ? "#E24B4A11" : "#D4537E11", color: active ? "#E24B4A" : "#D4537E", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
            {active ? "Stop" : "Start mic"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {["subtle", "thick", "wide", "gospel-choir"].map(p => (
          <button key={p} onClick={() => applyPreset(p)}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, border: `1px solid ${preset === p ? "#D4537E" : "var(--color-border-secondary)"}`, background: preset === p ? "#D4537E22" : "transparent", color: preset === p ? "#D4537E" : "var(--color-text-secondary)", cursor: "pointer" }}>
            {p.replace("-", " ")}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ border: "1px solid #D4537E44", borderRadius: 10, padding: "12px 14px", background: "#D4537E08" }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 500, color: "#993556" }}>Left voice</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
            <Knob label="Detune" value={detuneL} min={-50} max={0} onChange={setDetuneL} unit=" c" color="#D4537E" />
            <Knob label="Delay" value={delayL} min={1} max={80} onChange={setDelayL} unit=" ms" color="#D4537E" />
            <Knob label="Pan" value={Math.round(widthL * 100)} min={-100} max={0} onChange={v => setWidthL(v / 100)} unit="" color="#D4537E" />
          </div>
        </div>
        <div style={{ border: "1px solid #378ADD44", borderRadius: 10, padding: "12px 14px", background: "#378ADD08" }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 500, color: "#185FA5" }}>Right voice</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
            <Knob label="Detune" value={detuneR} min={0} max={50} onChange={setDetuneR} unit=" c" color="#378ADD" />
            <Knob label="Delay" value={delayR} min={1} max={80} onChange={setDelayR} unit=" ms" color="#378ADD" />
            <Knob label="Pan" value={Math.round(widthR * 100)} min={0} max={100} onChange={v => setWidthR(v / 100)} unit="" color="#378ADD" />
          </div>
        </div>
      </div>

      <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>Stereo field</p>
        <StereoViz />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Wet mix</span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{mix}%</span>
          </div>
          <input type="range" min={0} max={100} value={mix} onChange={e => setMix(Number(e.target.value))} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Dry level</span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{dryGainVal}%</span>
          </div>
          <input type="range" min={0} max={100} value={dryGainVal} onChange={e => setDryGainVal(Number(e.target.value))} />
        </div>
      </div>
    </div>
  );
}
