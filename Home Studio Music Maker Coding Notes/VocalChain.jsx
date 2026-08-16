import { useState, useEffect, useRef, useCallback } from "react";

const audioCtx = () => {
  if (!window.__vocalChainCtx || window.__vocalChainCtx.state === 'closed') {
    window.__vocalChainCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return window.__vocalChainCtx;
};

export default function VocalChain() {
  const [active, setActive] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [chainReady, setChainReady] = useState(false);

  const [hpfFreq, setHpfFreq] = useState(100);
  const [hpfOn, setHpfOn] = useState(true);

  const [deessThresh, setDeessThresh] = useState(-24);
  const [deessFreq, setDeessFreq] = useState(7000);
  const [deessOn, setDeessOn] = useState(true);
  const [deessGR, setDeessGR] = useState(0);

  const [compThresh, setCompThresh] = useState(-18);
  const [compRatio, setCompRatio] = useState(4);
  const [compAttack, setCompAttack] = useState(5);
  const [compRelease, setCompRelease] = useState(80);
  const [compOn, setCompOn] = useState(true);
  const [compGR, setCompGR] = useState(0);

  const [atKey, setAtKey] = useState("C");
  const [atScale, setAtScale] = useState("major");
  const [atSpeed, setAtSpeed] = useState(30);
  const [atOn, setAtOn] = useState(true);
  const [atMode, setAtMode] = useState("natural");

  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(2);
  const [eqPresence, setEqPresence] = useState(3);
  const [eqAir, setEqAir] = useState(1);
  const [eqOn, setEqOn] = useState(true);

  const [satDrive, setSatDrive] = useState(2);
  const [satMix, setSatMix] = useState(30);
  const [satOn, setSatOn] = useState(true);

  const [reverbSize, setReverbSize] = useState(20);
  const [reverbMix, setReverbMix] = useState(15);
  const [reverbOn, setReverbOn] = useState(true);

  const [delayTime, setDelayTime] = useState(125);
  const [delayFeedback, setDelayFeedback] = useState(20);
  const [delayMix, setDelayMix] = useState(12);
  const [delayOn, setDelayOn] = useState(true);

  const [outputGain, setOutputGain] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const nodesRef = useRef({});
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const analyserInRef = useRef(null);
  const analyserOutRef = useRef(null);
  const grTimerRef = useRef(null);

  const buildChain = useCallback(async () => {
    const ctx = audioCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;

    const src = ctx.createMediaStreamSource(stream);

    const analyserIn = ctx.createAnalyser();
    analyserIn.fftSize = 256;
    analyserInRef.current = analyserIn;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hpfFreq;
    hpf.Q.value = 0.707;

    const deessHpf = ctx.createBiquadFilter();
    deessHpf.type = 'highpass';
    deessHpf.frequency.value = deessFreq;

    const deessComp = ctx.createDynamicsCompressor();
    deessComp.threshold.value = deessThresh;
    deessComp.knee.value = 3;
    deessComp.ratio.value = 8;
    deessComp.attack.value = 0.003;
    deessComp.release.value = 0.05;

    const deessWet = ctx.createGain();
    deessWet.gain.value = 0.6;
    const deessDry = ctx.createGain();
    deessDry.gain.value = 0.4;
    const deessOut = ctx.createGain();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = compThresh;
    comp.knee.value = 6;
    comp.ratio.value = compRatio;
    comp.attack.value = compAttack / 1000;
    comp.release.value = compRelease / 1000;

    const eqLowShelf = ctx.createBiquadFilter();
    eqLowShelf.type = 'lowshelf';
    eqLowShelf.frequency.value = 200;
    eqLowShelf.gain.value = eqLow;

    const eqMidPeak = ctx.createBiquadFilter();
    eqMidPeak.type = 'peaking';
    eqMidPeak.frequency.value = 350;
    eqMidPeak.Q.value = 1.4;
    eqMidPeak.gain.value = eqMid;

    const eqPresencePeak = ctx.createBiquadFilter();
    eqPresencePeak.type = 'peaking';
    eqPresencePeak.frequency.value = 3000;
    eqPresencePeak.Q.value = 1.0;
    eqPresencePeak.gain.value = eqPresence;

    const eqAirShelf = ctx.createBiquadFilter();
    eqAirShelf.type = 'highshelf';
    eqAirShelf.frequency.value = 10000;
    eqAirShelf.gain.value = eqAir;

    const satWave = ctx.createWaveShaper();
    const makeSatCurve = (drive) => {
      const n = 256, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x));
      }
      return curve;
    };
    satWave.curve = makeSatCurve(satDrive);
    satWave.oversample = '4x';
    const satDryGain = ctx.createGain();
    satDryGain.gain.value = 1 - satMix / 100;
    const satWetGain = ctx.createGain();
    satWetGain.gain.value = satMix / 100;
    const satOut = ctx.createGain();

    const convolver = ctx.createConvolver();
    const reverbLen = Math.floor(ctx.sampleRate * (0.5 + reverbSize / 100 * 3));
    const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = reverbBuf.getChannelData(c);
      for (let i = 0; i < reverbLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, 2);
    }
    convolver.buffer = reverbBuf;
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = reverbMix / 100;
    const reverbDry = ctx.createGain();
    reverbDry.gain.value = 1 - reverbMix / 100;
    const reverbOut = ctx.createGain();

    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = delayTime / 1000;
    const delayFB = ctx.createGain();
    delayFB.gain.value = delayFeedback / 100;
    const delayWet = ctx.createGain();
    delayWet.gain.value = delayMix / 100;
    const delayDry = ctx.createGain();
    delayDry.gain.value = 1 - delayMix / 100;
    const delayOut = ctx.createGain();

    const outGainNode = ctx.createGain();
    outGainNode.gain.value = Math.pow(10, outputGain / 20);

    const analyserOut = ctx.createAnalyser();
    analyserOut.fftSize = 256;
    analyserOutRef.current = analyserOut;

    src.connect(analyserIn);
    src.connect(hpf);
    hpf.connect(deessHpf);
    hpf.connect(deessDry);
    deessHpf.connect(deessComp);
    deessComp.connect(deessWet);
    deessWet.connect(deessOut);
    deessDry.connect(deessOut);
    deessOut.connect(comp);
    comp.connect(eqLowShelf);
    eqLowShelf.connect(eqMidPeak);
    eqMidPeak.connect(eqPresencePeak);
    eqPresencePeak.connect(eqAirShelf);
    eqAirShelf.connect(satDryGain);
    eqAirShelf.connect(satWave);
    satWave.connect(satWetGain);
    satDryGain.connect(satOut);
    satWetGain.connect(satOut);
    satOut.connect(reverbDry);
    satOut.connect(convolver);
    convolver.connect(reverbWet);
    reverbDry.connect(reverbOut);
    reverbWet.connect(reverbOut);
    reverbOut.connect(delayDry);
    reverbOut.connect(delay);
    delay.connect(delayFB);
    delayFB.connect(delay);
    delay.connect(delayWet);
    delayDry.connect(delayOut);
    delayWet.connect(delayOut);
    delayOut.connect(outGainNode);
    outGainNode.connect(analyserOut);
    outGainNode.connect(ctx.destination);

    nodesRef.current = {
      src, hpf, deessHpf, deessComp, deessWet, deessDry, deessOut,
      comp, eqLowShelf, eqMidPeak, eqPresencePeak, eqAirShelf,
      satWave, satDryGain, satWetGain, satOut,
      convolver, reverbWet, reverbDry, reverbOut,
      delay, delayFB, delayWet, delayDry, delayOut,
      outGainNode, makeSatCurve
    };

    setChainReady(true);
    startMeters();
  }, []);

  const startMeters = () => {
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
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  };

  const stopChain = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (nodesRef.current.src) {
      try { nodesRef.current.src.disconnect(); } catch (e) {}
    }
    nodesRef.current = {};
    setChainReady(false);
    setActive(false);
    setMonitoring(false);
    setInputLevel(0);
    setOutputLevel(0);
  };

  const toggleChain = async () => {
    if (active) { stopChain(); }
    else { setActive(true); await buildChain(); }
  };

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.hpf) return;
    n.hpf.frequency.value = hpfFreq;
  }, [hpfFreq]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.deessComp) return;
    n.deessComp.threshold.value = deessThresh;
    n.deessHpf.frequency.value = deessFreq;
  }, [deessThresh, deessFreq]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.comp) return;
    n.comp.threshold.value = compThresh;
    n.comp.ratio.value = compRatio;
    n.comp.attack.value = compAttack / 1000;
    n.comp.release.value = compRelease / 1000;
  }, [compThresh, compRatio, compAttack, compRelease]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.eqLowShelf) return;
    n.eqLowShelf.gain.value = eqLow;
    n.eqMidPeak.gain.value = eqMid > 0 ? -Math.abs(eqMid) * 0.5 : 0;
    n.eqPresencePeak.gain.value = eqPresence;
    n.eqAirShelf.gain.value = eqAir;
  }, [eqLow, eqMid, eqPresence, eqAir]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.satWave || !n.makeSatCurve) return;
    n.satWave.curve = n.makeSatCurve(satDrive);
    n.satDryGain.gain.value = 1 - satMix / 100;
    n.satWetGain.gain.value = satMix / 100;
  }, [satDrive, satMix]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.reverbWet) return;
    n.reverbWet.gain.value = reverbMix / 100;
    n.reverbDry.gain.value = 1 - reverbMix / 100;
  }, [reverbMix]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.delay) return;
    n.delay.delayTime.value = delayTime / 1000;
    n.delayFB.gain.value = delayFeedback / 100;
    n.delayWet.gain.value = delayMix / 100;
    n.delayDry.gain.value = 1 - delayMix / 100;
  }, [delayTime, delayFeedback, delayMix]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n.outGainNode) return;
    n.outGainNode.gain.value = Math.pow(10, outputGain / 20);
  }, [outputGain]);

  useEffect(() => () => stopChain(), []);

  const keys = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

  const Knob = ({ label, value, min, max, step = 1, unit = "", onChange, color = "#7F77DD" }) => {
    const pct = (value - min) / (max - min);
    const angle = -135 + pct * 270;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div
          style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid var(--color-border-secondary)`, position: "relative", cursor: "ns-resize", background: "var(--color-background-secondary)" }}
          onMouseDown={(e) => {
            const startY = e.clientY, startVal = value;
            const move = (me) => {
              const delta = (startY - me.clientY) * (max - min) / 120;
              onChange(Math.min(max, Math.max(min, Math.round((startVal + delta) / step) * step)));
            };
            const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        >
          <div style={{ position: "absolute", top: "50%", left: "50%", width: 2, height: 16, background: color, transformOrigin: "bottom center", transform: `translate(-50%, -100%) rotate(${angle}deg)`, borderRadius: 1 }} />
        </div>
        <span style={{ fontSize: 10, color: "var(--color-text-secondary)", textAlign: "center", lineHeight: 1.2 }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-primary)" }}>{value}{unit}</span>
      </div>
    );
  };

  const Section = ({ title, on, setOn, color, children }) => (
    <div style={{ border: `1px solid ${on ? color + "66" : "var(--color-border-tertiary)"}`, borderRadius: 10, padding: "10px 14px", background: on ? color + "08" : "transparent", transition: "all 0.2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: on ? color : "var(--color-text-secondary)", letterSpacing: "0.04em" }}>{title}</span>
        <button
          onClick={() => setOn(!on)}
          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, border: `1px solid ${on ? color : "var(--color-border-secondary)"}`, background: on ? color : "transparent", color: on ? "#fff" : "var(--color-text-secondary)", cursor: "pointer", transition: "all 0.15s" }}
        >{on ? "ON" : "OFF"}</button>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        {children}
      </div>
    </div>
  );

  const Meter = ({ level, label, color }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 80, background: "var(--color-background-tertiary)", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ width: "100%", height: `${level}%`, background: level > 80 ? "#E24B4A" : level > 60 ? "#EF9F27" : color, borderRadius: 4, transition: "height 0.05s" }} />
      </div>
      <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>{label}</span>
    </div>
  );

  return (
    <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)" }}>Vocal chain</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>Gospel / rap professional signal path</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Meter level={inputLevel} label="IN" color="#1D9E75" />
            <Meter level={outputLevel} label="OUT" color="#7F77DD" />
          </div>
          <button
            onClick={toggleChain}
            style={{ padding: "8px 20px", borderRadius: 8, border: `1.5px solid ${active ? "#E24B4A" : "#7F77DD"}`, background: active ? "#E24B4A11" : "#7F77DD11", color: active ? "#E24B4A" : "#7F77DD", fontWeight: 500, fontSize: 13, cursor: "pointer" }}
          >{active ? "Stop" : "Start mic"}</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

        <Section title="1 · High-pass filter" on={hpfOn} setOn={setHpfOn} color="#888780">
          <Knob label="Cutoff" value={hpfFreq} min={40} max={300} onChange={setHpfFreq} unit=" Hz" color="#888780" />
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Removes rumble below cutoff frequency</span>
        </Section>

        <Section title="2 · De-esser" on={deessOn} setOn={setDeessOn} color="#1D9E75">
          <Knob label="Threshold" value={deessThresh} min={-48} max={0} onChange={setDeessThresh} unit=" dB" color="#1D9E75" />
          <Knob label="Freq" value={deessFreq} min={4000} max={12000} step={100} onChange={setDeessFreq} unit=" Hz" color="#1D9E75" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Reduction</span>
            <div style={{ width: 60, height: 6, background: "var(--color-background-tertiary)", borderRadius: 3 }}>
              <div style={{ height: "100%", width: `${deessGR}%`, background: "#1D9E75", borderRadius: 3 }} />
            </div>
          </div>
        </Section>

        <Section title="3 · Compressor" on={compOn} setOn={setCompOn} color="#534AB7">
          <Knob label="Threshold" value={compThresh} min={-48} max={0} onChange={setCompThresh} unit=" dB" color="#534AB7" />
          <Knob label="Ratio" value={compRatio} min={1} max={20} onChange={setCompRatio} unit=":1" color="#534AB7" />
          <Knob label="Attack" value={compAttack} min={1} max={100} onChange={setCompAttack} unit=" ms" color="#534AB7" />
          <Knob label="Release" value={compRelease} min={20} max={500} onChange={setCompRelease} unit=" ms" color="#534AB7" />
        </Section>

        <Section title="4 · Auto-Tune (pitch correction)" on={atOn} setOn={setAtOn} color="#BA7517">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Key</span>
            <select value={atKey} onChange={e => setAtKey(e.target.value)} style={{ fontSize: 12, padding: "4px 6px" }}>
              {keys.map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Scale</span>
            <select value={atScale} onChange={e => setAtScale(e.target.value)} style={{ fontSize: 12, padding: "4px 6px" }}>
              {["major","minor","pentatonic","blues","chromatic"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <Knob label="Retune speed" value={atSpeed} min={0} max={100} onChange={setAtSpeed} color="#BA7517" />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Mode</span>
            <div style={{ display: "flex", gap: 4 }}>
              {["natural","smooth","robot"].map(m => (
                <button key={m} onClick={() => setAtMode(m)} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: `1px solid ${atMode === m ? "#BA7517" : "var(--color-border-secondary)"}`, background: atMode === m ? "#BA751722" : "transparent", color: atMode === m ? "#BA7517" : "var(--color-text-secondary)", cursor: "pointer" }}>{m}</button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: 0, flex: 1 }}>Speed 0 = robot · 20–40 = natural · Use Newtone tab for manual pitch editing</p>
        </Section>

        <Section title="5 · EQ — tone shaping" on={eqOn} setOn={setEqOn} color="#185FA5">
          <Knob label="Low shelf" value={eqLow} min={-12} max={12} onChange={setEqLow} unit=" dB" color="#185FA5" />
          <Knob label="Mud cut (350)" value={eqMid} min={0} max={12} onChange={setEqMid} unit=" dB" color="#185FA5" />
          <Knob label="Presence (3k)" value={eqPresence} min={-6} max={12} onChange={setEqPresence} unit=" dB" color="#185FA5" />
          <Knob label="Air (10k)" value={eqAir} min={-6} max={12} onChange={setEqAir} unit=" dB" color="#185FA5" />
        </Section>

        <Section title="6 · Saturation / harmonic exciter" on={satOn} setOn={setSatOn} color="#993C1D">
          <Knob label="Drive" value={satDrive} min={1} max={20} onChange={setSatDrive} color="#993C1D" />
          <Knob label="Mix" value={satMix} min={0} max={100} onChange={setSatMix} unit="%" color="#993C1D" />
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Adds harmonic warmth · helps vocals cut through beats</span>
        </Section>

        <Section title="7 · Reverb" on={reverbOn} setOn={setReverbOn} color="#0F6E56">
          <Knob label="Room size" value={reverbSize} min={0} max={100} onChange={setReverbSize} unit="%" color="#0F6E56" />
          <Knob label="Mix" value={reverbMix} min={0} max={60} onChange={setReverbMix} unit="%" color="#0F6E56" />
        </Section>

        <Section title="8 · Delay" on={delayOn} setOn={setDelayOn} color="#0F6E56">
          <Knob label="Time" value={delayTime} min={20} max={800} step={5} onChange={setDelayTime} unit=" ms" color="#0F6E56" />
          <Knob label="Feedback" value={delayFeedback} min={0} max={80} onChange={setDelayFeedback} unit="%" color="#0F6E56" />
          <Knob label="Mix" value={delayMix} min={0} max={60} onChange={setDelayMix} unit="%" color="#0F6E56" />
          <div style={{ display: "flex", gap: 4 }}>
            {[62, 83, 125, 167, 250].map(ms => (
              <button key={ms} onClick={() => setDelayTime(ms)} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, border: "1px solid var(--color-border-secondary)", background: delayTime === ms ? "#0F6E5622" : "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>{ms}ms</button>
            ))}
          </div>
        </Section>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>Output gain</span>
          <input type="range" min={-12} max={12} step={0.5} value={outputGain} onChange={e => setOutputGain(parseFloat(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 500, minWidth: 40 }}>{outputGain > 0 ? "+" : ""}{outputGain.toFixed(1)} dB</span>
        </div>

        <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--color-background-secondary)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>Gospel / rap presets · </span>
          <button onClick={() => { setHpfFreq(100); setDeessThresh(-24); setDeessFreq(7000); setCompThresh(-18); setCompRatio(4); setCompAttack(5); setCompRelease(80); setAtSpeed(30); setAtMode("natural"); setEqPresence(3); setEqAir(1); setSatDrive(2); setSatMix(20); setReverbSize(20); setReverbMix(12); setDelayTime(125); setDelayMix(10); }} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", marginRight: 6 }}>Natural correction</button>
          <button onClick={() => { setAtSpeed(0); setAtMode("robot"); setSatDrive(8); setSatMix(40); setCompRatio(8); setReverbSize(35); setReverbMix(20); setDelayTime(167); setDelayMix(18); }} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", marginRight: 6 }}>Melodic trap</button>
          <button onClick={() => { setAtSpeed(60); setAtMode("smooth"); setSatDrive(1); setSatMix(15); setCompRatio(3); setEqPresence(2); setReverbSize(40); setReverbMix(25); setDelayTime(250); setDelayMix(15); }} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Gospel worship</button>
        </div>
      </div>
    </div>
  );
}
