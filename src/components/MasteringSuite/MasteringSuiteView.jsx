import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  initMasteringChain, masteringState, onMasteringChange,
  setStereoWidth, setMultibandEnabled, setMultibandBand,
  setLimiterEnabled, setLimiterParam, getLufsAnalyser, getMasterLimiterNode,
} from '../../audio/audioEngine'

// ── Knob ──────────────────────────────────────────────────────────────────────
function Knob({ value, min, max, step = 1, label, unit = '', color = '#00e5ff', onChange, size = 48 }) {
  const ref   = useRef(null)
  const drag  = useRef(null)
  const pct   = (value - min) / (max - min)
  const startAngle = -135
  const endAngle   = 135
  const angle = startAngle + pct * (endAngle - startAngle)
  const r = size / 2 - 4
  const cx = size / 2, cy = size / 2
  const rad = (deg) => (deg * Math.PI) / 180
  const x = cx + r * Math.sin(rad(angle))
  const y = cy - r * Math.cos(rad(angle))

  const onPointerDown = useCallback((e) => {
    drag.current = { startY: e.clientY, startVal: value }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup',   onPointerUp)
    e.preventDefault()
  }, [value])

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return
    const dy    = drag.current.startY - e.clientY
    const range = max - min
    const delta = (dy / 150) * range
    const next  = Math.round((drag.current.startVal + delta) / step) * step
    onChange(Math.max(min, Math.min(max, next)))
  }, [min, max, step, onChange])

  const onPointerUp = useCallback(() => {
    drag.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup',   onPointerUp)
  }, [onPointerMove])

  return (
    <div className="flex flex-col items-center gap-1 select-none" ref={ref}>
      <svg width={size} height={size} onPointerDown={onPointerDown} style={{ cursor: 'ns-resize' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a2e" strokeWidth={3} />
        <path
          d={`M ${cx + r * Math.sin(rad(startAngle))} ${cy - r * Math.cos(rad(startAngle))} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x} ${y}`}
          fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
        />
        <circle cx={x} cy={y} r={3} fill={color} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#e0e0e0" fontSize={size < 40 ? 8 : 10} fontFamily="monospace" fontWeight="bold">
          {value}{unit}
        </text>
      </svg>
      <span className="text-xs font-mono text-studio-dim" style={{ fontSize: 9 }}>{label}</span>
    </div>
  )
}

// ── Meter ─────────────────────────────────────────────────────────────────────
function LevelMeter({ db, label, color = '#00e5ff', height = 120 }) {
  const clamp = (v) => Math.max(0, Math.min(1, (v + 60) / 60))
  const pct   = clamp(db) * 100
  const col   = db > -3 ? '#ff2d55' : db > -12 ? '#ffe600' : color
  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: 14, height, background: '#0a0a1a', borderRadius: 2, border: '1px solid #1a1a2e', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: col, transition: 'height 60ms', boxShadow: `0 0 6px ${col}` }} />
      </div>
      <span className="font-mono" style={{ fontSize: 9, color: '#556' }}>{label}</span>
      <span className="font-mono" style={{ fontSize: 9, color: col }}>{db > -60 ? `${db.toFixed(1)}` : '—'}</span>
    </div>
  )
}

// ── GR Meter ─────────────────────────────────────────────────────────────────
function GRMeter({ gr, label }) {
  const pct = Math.min(100, Math.abs(gr) * 5)
  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: 8, height: 60, background: '#0a0a1a', borderRadius: 2, border: '1px solid #1a1a2e', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${pct}%`, background: '#b44fff', transition: 'height 80ms' }} />
      </div>
      <span className="font-mono" style={{ fontSize: 8, color: '#556' }}>{label}</span>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, color, enabled, onToggle, children }) {
  return (
    <div style={{ border: `1px solid ${enabled ? color + '44' : '#1a1a2e'}`, borderRadius: 8, overflow: 'hidden', background: enabled ? color + '08' : '#ffffff04', transition: 'all 0.2s' }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${enabled ? color + '33' : '#1a1a2e'}`, background: '#0a0a1a' }}>
        <button onClick={onToggle}
          style={{ width: 12, height: 12, borderRadius: '50%', background: enabled ? color : '#333', border: `2px solid ${enabled ? color : '#555'}`, boxShadow: enabled ? `0 0 6px ${color}` : 'none', cursor: 'pointer', flexShrink: 0 }} />
        <span className="font-display text-xs font-semibold tracking-widest uppercase" style={{ color: enabled ? color : '#555' }}>{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MasteringSuiteView() {
  const [state, setState]         = useState(() => ({ ...masteringState }))
  const [lufsM,  setLufsM]        = useState(-60)
  const [lufsST, setLufsST]       = useState(-60)
  const [lufsI,  setLufsI]        = useState(-60)
  const [limGR,  setLimGR]        = useState(0)
  const frameRef                  = useRef(null)
  const lufsHistRef               = useRef([])
  const integratedRef             = useRef(0)
  const integratedCntRef          = useRef(0)

  useEffect(() => {
    initMasteringChain()
    return onMasteringChange(() => setState({ ...masteringState }))
  }, [])

  // LUFS metering loop
  useEffect(() => {
    const an  = getLufsAnalyser()
    const lim = getMasterLimiterNode()
    if (!an) return

    const tick = () => {
      const buf = new Float32Array(an.fftSize)
      an.getFloatTimeDomainData(buf)

      // RMS → approximate LUFS
      let ms = 0
      for (let i = 0; i < buf.length; i++) ms += buf[i] * buf[i]
      ms /= buf.length
      const lufs = ms > 1e-10 ? -0.691 + 10 * Math.log10(ms) : -60

      // Momentary: instantaneous
      setLufsM(Math.max(-60, lufs))

      // Short-term: rolling 3s history (at ~60fps, keep last 180 frames)
      lufsHistRef.current.push(lufs)
      if (lufsHistRef.current.length > 180) lufsHistRef.current.shift()
      const stAvg = lufsHistRef.current.filter(v => v > -70).reduce((a, b) => a + b, 0) / Math.max(1, lufsHistRef.current.filter(v => v > -70).length)
      setLufsST(Math.max(-60, stAvg))

      // Integrated: running average above gate
      if (lufs > -70) {
        integratedRef.current = (integratedRef.current * integratedCntRef.current + lufs) / (integratedCntRef.current + 1)
        integratedCntRef.current++
        setLufsI(Math.max(-60, integratedRef.current))
      }

      // Limiter GR
      if (lim) setLimGR(lim.reduction)

      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  const resetIntegrated = () => {
    lufsHistRef.current      = []
    integratedRef.current    = 0
    integratedCntRef.current = 0
    setLufsI(-60)
  }

  const lufsColor = (v) => v > -6 ? '#ff2d55' : v > -14 ? '#ffe600' : '#00ff9d'

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#080810' }}>

      {/* ── Left panel: meters ── */}
      <div className="flex flex-col gap-3 p-4 border-r border-studio-border shrink-0" style={{ width: 180 }}>
        <span className="font-display text-xs tracking-widest uppercase" style={{ background: 'linear-gradient(90deg,#00ff9d,#00e5ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          LUFS Meter
        </span>

        {[
          { label: 'Momentary', val: lufsM,  suffix: 'M' },
          { label: 'Short-Term',val: lufsST, suffix: 'ST' },
          { label: 'Integrated',val: lufsI,  suffix: 'I' },
        ].map(({ label, val, suffix }) => (
          <div key={suffix} style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 6, padding: '8px 10px' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-studio-dim">{suffix}</span>
              <span className="font-mono text-xs" style={{ color: lufsColor(val) }}>{val > -60 ? val.toFixed(1) : '< -60'}</span>
            </div>
            <div style={{ height: 4, background: '#1a1a2e', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(0, (val + 60) / 60 * 100)}%`, background: lufsColor(val), transition: 'width 80ms' }} />
            </div>
            <div className="font-mono text-center mt-1" style={{ fontSize: 8, color: '#444' }}>{label}</div>
          </div>
        ))}

        <button onClick={resetIntegrated}
          className="px-2 py-1 rounded text-xs font-mono font-semibold"
          style={{ background: '#ffffff08', border: '1px solid #2a2a3e', color: '#556' }}>
          Reset I
        </button>

        <div className="mt-2" style={{ border: '1px solid #1a1a2e', borderRadius: 6, padding: 8, background: '#0a0a1a' }}>
          <div className="font-mono text-xs text-studio-dim mb-2">TARGETS</div>
          {[
            { label: 'Streaming', val: '-14 LUFS' },
            { label: 'CD / Loud', val: '-9 LUFS' },
            { label: 'Broadcast', val: '-23 LUFS' },
          ].map(t => (
            <div key={t.label} className="flex justify-between">
              <span className="font-mono text-studio-muted" style={{ fontSize: 9 }}>{t.label}</span>
              <span className="font-mono" style={{ fontSize: 9, color: '#00e5ff' }}>{t.val}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <div className="font-mono text-xs text-studio-dim mb-2">LIM GR</div>
          <LevelMeter db={limGR} label="GR" color="#b44fff" height={80} />
        </div>
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Multiband Compressor */}
        <Section title="Multiband Compressor" color="#00e5ff" enabled={state.multiband.enabled}
          onToggle={() => setMultibandEnabled(!state.multiband.enabled)}>
          <div className="flex gap-4">
            {(['low','mid','high']).map((band, bi) => {
              const b   = state.multiband[band]
              const col = ['#00ff9d','#00e5ff','#b44fff'][bi]
              return (
                <div key={band} style={{ flex: 1, background: '#0a0a1a', border: `1px solid ${col}22`, borderRadius: 6, padding: 10 }}>
                  <div className="font-mono text-xs font-semibold mb-3 uppercase" style={{ color: col }}>{band}</div>
                  <div className="flex justify-center gap-2 mb-3">
                    <Knob value={b.threshold} min={-60} max={0} label="THRESH" unit="dB" color={col}
                      onChange={v => setMultibandBand(band, 'threshold', v)} size={44} />
                    <Knob value={b.ratio} min={1} max={20} step={0.5} label="RATIO" color={col}
                      onChange={v => setMultibandBand(band, 'ratio', v)} size={44} />
                    <Knob value={b.gain} min={-12} max={12} label="GAIN" unit="dB" color={col}
                      onChange={v => setMultibandBand(band, 'gain', v)} size={44} />
                  </div>
                  {band !== 'high' && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="font-mono text-studio-dim" style={{ fontSize: 9 }}>XOVER</span>
                      <input type="range" min={band==='low'?60:500} max={band==='low'?1000:8000}
                        value={b.crossover}
                        onChange={e => setMultibandBand(band, 'crossover', Number(e.target.value))}
                        className="flex-1" />
                      <span className="font-mono" style={{ fontSize: 9, color: col }}>{b.crossover >= 1000 ? `${(b.crossover/1000).toFixed(1)}k` : b.crossover}Hz</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        {/* Stereo Imager */}
        <Section title="Stereo Imager" color="#b44fff" enabled={true} onToggle={() => {}}>
          <div className="flex items-center gap-6">
            <Knob value={state.stereoWidth} min={0} max={200} label="WIDTH" unit="%" color="#b44fff"
              onChange={setStereoWidth} size={56} />
            <div className="flex-1">
              {/* Width visualizer */}
              <div className="relative mb-2" style={{ height: 50, background: '#0a0a1a', borderRadius: 6, border: '1px solid #1a1a2e', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                  width: `${Math.min(100, state.stereoWidth / 2)}%`, height: 2, background: '#b44fff',
                  boxShadow: '0 0 8px #b44fff', transition: 'width 0.2s',
                }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 2, height: '100%', background: '#333' }} />
                <div style={{ position: 'absolute', bottom: 4, left: '25%', fontSize: 9, color: '#444', fontFamily: 'monospace' }}>L</div>
                <div style={{ position: 'absolute', bottom: 4, right: '25%', fontSize: 9, color: '#444', fontFamily: 'monospace' }}>R</div>
              </div>
              <div className="flex justify-between font-mono" style={{ fontSize: 9, color: '#556' }}>
                <span>MONO (0%)</span><span>NORMAL (100%)</span><span>WIDE (200%)</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Limiter */}
        <Section title="Limiter / Maximizer" color="#ff9500" enabled={state.limiter.enabled}
          onToggle={() => setLimiterEnabled(!state.limiter.enabled)}>
          <div className="flex items-center gap-6">
            <Knob value={state.limiter.threshold} min={-20} max={0} step={0.5} label="CEILING" unit="dB" color="#ff9500"
              onChange={v => setLimiterParam('threshold', v)} size={56} />
            <Knob value={Math.round(state.limiter.release * 1000)} min={10} max={500} label="RELEASE" unit="ms" color="#ff9500"
              onChange={v => setLimiterParam('release', v / 1000)} size={56} />
            <div className="flex-1">
              <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 6, padding: 10 }}>
                <div className="font-mono text-xs text-studio-dim mb-1">GAIN REDUCTION</div>
                <div style={{ height: 6, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.abs(limGR) * 10)}%`, background: '#ff9500', transition: 'width 80ms', boxShadow: '0 0 4px #ff9500' }} />
                </div>
                <div className="font-mono mt-1" style={{ fontSize: 10, color: '#ff9500' }}>{limGR.toFixed(1)} dB</div>
              </div>
              <div className="font-mono text-xs text-studio-dim mt-2" style={{ lineHeight: 1.5 }}>
                Ratio: ∞:1 · Attack: 1ms · True Peak
              </div>
            </div>
          </div>
        </Section>

        {/* Tips */}
        <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 8, padding: 12 }}>
          <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-2">Mastering Tips</div>
          <div className="flex flex-col gap-1">
            {[
              ['Target',     'Streaming services normalize to -14 LUFS. Aim for -9 to -14 LUFS integrated.'],
              ['Multiband',  'Enable to tame muddy low-end without affecting the mids or highs.'],
              ['Width',      '100% is original. Go 110-130% for a modern wide mix. Above 160% risks mono incompatibility.'],
              ['Limiter',    'Set ceiling to -1 dBTP to prevent clipping on all platforms.'],
            ].map(([t,d]) => (
              <div key={t} className="flex gap-2">
                <span className="font-mono font-bold shrink-0" style={{ fontSize: 10, color: '#00e5ff', minWidth: 64 }}>{t}</span>
                <span className="font-mono" style={{ fontSize: 10, color: '#556', lineHeight: 1.5 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
