import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getCtx, rerouteMasterOut, restoreMasterOut } from '../../audio/audioEngine'

// ─── Effect definitions ───────────────────────────────────────────

const EFFECT_TYPES = ['EQ3','Compressor','Reverb','Delay','Distortion','Chorus','Bitcrusher','Phaser']

const DEFAULT_PARAMS = {
  EQ3:        { lowGain:0, midGain:0, highGain:0, lowFreq:200, midFreq:1000, highFreq:6000, midQ:1 },
  Compressor: { threshold:-24, ratio:4, attack:0.003, release:0.25, knee:10, makeupGain:0 },
  Reverb:     { roomSize:0.6, damping:0.5, wet:0.3, predelay:0.02 },
  Delay:      { time:0.375, feedback:0.4, wet:0.3, filterFreq:4000 },
  Distortion: { drive:50, type:'soft', wet:0.8, tone:3000 },
  Chorus:     { rate:1.2, depth:0.003, feedback:0.2, wet:0.4, delay:0.03 },
  Bitcrusher: { bits:8, reduction:4, wet:1 },
  Phaser:     { rate:0.5, depth:600, feedback:0.7, wet:0.5 },
}

const EFFECT_COLORS = {
  EQ3:'#00e5ff', Compressor:'#ffe600', Reverb:'#b44fff', Delay:'#ff9500',
  Distortion:'#ff2d55', Chorus:'#00ff9d', Bitcrusher:'#a8ff78', Phaser:'#5577ff',
}

let _uid = 1
function mkId() { return `fx-${_uid++}` }

// ─── Web Audio node factories ─────────────────────────────────────

function makeIR(c, roomSize, damping) {
  const len = Math.floor(c.sampleRate * (0.5 + roomSize * 4))
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 1 + damping * 5)
      d[i] = (Math.random() * 2 - 1) * decay
    }
  }
  return buf
}

function makeDistCurve(drive, type) {
  const n = 256
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2 / n) - 1
    if (type === 'soft') {
      curve[i] = (Math.PI + drive * 0.5) * x / (Math.PI + drive * 0.5 * Math.abs(x))
    } else if (type === 'hard') {
      curve[i] = Math.max(-1, Math.min(1, x * (1 + drive * 0.1)))
    } else { // fuzz
      curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * (1 + drive * 0.1)))
    }
  }
  return curve
}

function createEffectNodes(c, type, params) {
  const inputNode  = c.createGain()
  const outputNode = c.createGain()
  const nodes = { inputNode, outputNode }

  switch (type) {
    case 'EQ3': {
      const ls = c.createBiquadFilter(); ls.type = 'lowshelf'
      const pk = c.createBiquadFilter(); pk.type = 'peaking'
      const hs = c.createBiquadFilter(); hs.type = 'highshelf'
      ls.frequency.value = params.lowFreq;  ls.gain.value = params.lowGain
      pk.frequency.value = params.midFreq;  pk.gain.value = params.midGain; pk.Q.value = params.midQ
      hs.frequency.value = params.highFreq; hs.gain.value = params.highGain
      inputNode.connect(ls); ls.connect(pk); pk.connect(hs); hs.connect(outputNode)
      Object.assign(nodes, { ls, pk, hs })
      break
    }
    case 'Compressor': {
      const comp = c.createDynamicsCompressor()
      const mg   = c.createGain()
      comp.threshold.value = params.threshold
      comp.ratio.value     = params.ratio
      comp.attack.value    = params.attack
      comp.release.value   = params.release
      comp.knee.value      = params.knee
      mg.gain.value        = Math.pow(10, params.makeupGain / 20)
      inputNode.connect(comp); comp.connect(mg); mg.connect(outputNode)
      Object.assign(nodes, { comp, mg })
      break
    }
    case 'Reverb': {
      const conv = c.createConvolver()
      conv.buffer = makeIR(c, params.roomSize, params.damping)
      const delay = c.createDelay(0.1); delay.delayTime.value = params.predelay
      const wet = c.createGain(); wet.gain.value = params.wet
      const dry = c.createGain(); dry.gain.value = 1 - params.wet
      inputNode.connect(delay); delay.connect(conv); conv.connect(wet); wet.connect(outputNode)
      inputNode.connect(dry); dry.connect(outputNode)
      Object.assign(nodes, { conv, delay, wet, dry })
      break
    }
    case 'Delay': {
      const del  = c.createDelay(5); del.delayTime.value = params.time
      const fb   = c.createGain(); fb.gain.value = params.feedback
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = params.filterFreq
      const wet  = c.createGain(); wet.gain.value = params.wet
      const dry  = c.createGain(); dry.gain.value = 1
      inputNode.connect(dry); dry.connect(outputNode)
      inputNode.connect(del); del.connect(filt); filt.connect(fb); fb.connect(del)
      filt.connect(wet); wet.connect(outputNode)
      Object.assign(nodes, { del, fb, filt, wet })
      break
    }
    case 'Distortion': {
      const ws  = c.createWaveShaper()
      ws.curve = makeDistCurve(params.drive, params.type)
      ws.oversample = '4x'
      const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = params.tone
      const wet = c.createGain(); wet.gain.value = params.wet
      const dry = c.createGain(); dry.gain.value = 1 - params.wet
      inputNode.connect(ws); ws.connect(tone); tone.connect(wet); wet.connect(outputNode)
      inputNode.connect(dry); dry.connect(outputNode)
      Object.assign(nodes, { ws, tone, wet, dry })
      break
    }
    case 'Chorus': {
      const del  = c.createDelay(0.5); del.delayTime.value = params.delay
      const lfo  = c.createOscillator(); lfo.frequency.value = params.rate
      const lfoG = c.createGain(); lfoG.gain.value = params.depth
      const fb   = c.createGain(); fb.gain.value = params.feedback
      const wet  = c.createGain(); wet.gain.value = params.wet
      const dry  = c.createGain(); dry.gain.value = 1
      lfo.connect(lfoG); lfoG.connect(del.delayTime)
      inputNode.connect(del); del.connect(fb); fb.connect(del)
      del.connect(wet); wet.connect(outputNode)
      inputNode.connect(dry); dry.connect(outputNode)
      lfo.start()
      Object.assign(nodes, { del, lfo, lfoG, fb, wet })
      break
    }
    case 'Bitcrusher': {
      // Bitcrusher via ScriptProcessor
      const sp = c.createScriptProcessor(512, 1, 1)
      const bits = params.bits; const red = params.reduction
      let step = 0
      sp.onaudioprocess = (e) => {
        const inp = e.inputBuffer.getChannelData(0)
        const out = e.outputBuffer.getChannelData(0)
        const q = 2 * Math.pow(0.5, bits)
        for (let i = 0; i < inp.length; i++) {
          if (i % red === 0) step = q * Math.floor(inp[i] / q + 0.5)
          out[i] = step
        }
      }
      const wet = c.createGain(); wet.gain.value = params.wet
      const dry = c.createGain(); dry.gain.value = 1 - params.wet
      inputNode.connect(sp); sp.connect(wet); wet.connect(outputNode)
      inputNode.connect(dry); dry.connect(outputNode)
      Object.assign(nodes, { sp, wet, dry })
      break
    }
    case 'Phaser': {
      const filters = []
      for (let i = 0; i < 6; i++) {
        const ap = c.createBiquadFilter(); ap.type = 'allpass'
        ap.frequency.value = params.depth * (i + 1) / 6
        filters.push(ap)
      }
      const lfo  = c.createOscillator(); lfo.frequency.value = params.rate
      const lfoG = c.createGain(); lfoG.gain.value = params.depth
      const fb   = c.createGain(); fb.gain.value = params.feedback
      const wet  = c.createGain(); wet.gain.value = params.wet
      const dry  = c.createGain(); dry.gain.value = 1
      lfo.connect(lfoG)
      filters.forEach((f, i) => { lfoG.connect(f.frequency); if (i > 0) filters[i-1].connect(f) })
      inputNode.connect(filters[0])
      filters[filters.length-1].connect(fb); fb.connect(filters[0])
      filters[filters.length-1].connect(wet); wet.connect(outputNode)
      inputNode.connect(dry); dry.connect(outputNode)
      lfo.start()
      Object.assign(nodes, { filters, lfo, lfoG, fb, wet })
      break
    }
  }
  return nodes
}

function disposeNodes(nodes) {
  try { nodes.inputNode.disconnect() } catch {}
  try { nodes.outputNode.disconnect() } catch {}
  if (nodes.lfo) try { nodes.lfo.stop(); nodes.lfo.disconnect() } catch {}
  if (nodes.sp)  try { nodes.sp.disconnect(); nodes.sp.onaudioprocess = null } catch {}
}

// ─── Apply param update to live nodes ────────────────────────────

function applyParam(nodes, type, key, value) {
  const n = nodes
  try {
    switch (type) {
      case 'EQ3':
        if (key === 'lowGain')   n.ls.gain.value = value
        if (key === 'midGain')   n.pk.gain.value = value
        if (key === 'highGain')  n.hs.gain.value = value
        if (key === 'lowFreq')   n.ls.frequency.value = value
        if (key === 'midFreq')   n.pk.frequency.value = value
        if (key === 'highFreq')  n.hs.frequency.value = value
        if (key === 'midQ')      n.pk.Q.value = value
        break
      case 'Compressor':
        if (key === 'threshold')  n.comp.threshold.value = value
        if (key === 'ratio')      n.comp.ratio.value = value
        if (key === 'attack')     n.comp.attack.value = value
        if (key === 'release')    n.comp.release.value = value
        if (key === 'knee')       n.comp.knee.value = value
        if (key === 'makeupGain') n.mg.gain.value = Math.pow(10, value / 20)
        break
      case 'Reverb':
        if (key === 'wet')     { n.wet.gain.value = value; n.dry.gain.value = 1 - value }
        if (key === 'predelay') n.delay.delayTime.value = value
        break
      case 'Delay':
        if (key === 'time')       n.del.delayTime.value = value
        if (key === 'feedback')   n.fb.gain.value = value
        if (key === 'wet')        n.wet.gain.value = value
        if (key === 'filterFreq') n.filt.frequency.value = value
        break
      case 'Distortion':
        if (key === 'wet') { n.wet.gain.value = value; n.dry.gain.value = 1 - value }
        if (key === 'tone') n.tone.frequency.value = value
        break
      case 'Chorus':
        if (key === 'rate')     n.lfo.frequency.value = value
        if (key === 'depth')    n.lfoG.gain.value = value
        if (key === 'feedback') n.fb.gain.value = value
        if (key === 'wet')      n.wet.gain.value = value
        break
      case 'Bitcrusher':
        if (key === 'wet') { n.wet.gain.value = value; n.dry.gain.value = 1 - value }
        break
      case 'Phaser':
        if (key === 'rate')     n.lfo.frequency.value = value
        if (key === 'feedback') n.fb.gain.value = value
        if (key === 'wet')      n.wet.gain.value = value
        break
    }
  } catch {}
}

// ─── Param control config ─────────────────────────────────────────

const PARAM_DEFS = {
  EQ3: [
    { key:'lowGain',   label:'Low',     min:-18, max:18,  step:0.5, unit:'dB', def:0 },
    { key:'midGain',   label:'Mid',     min:-18, max:18,  step:0.5, unit:'dB', def:0 },
    { key:'highGain',  label:'High',    min:-18, max:18,  step:0.5, unit:'dB', def:0 },
    { key:'lowFreq',   label:'LF Freq', min:60,  max:800, step:10,  unit:'Hz', def:200 },
    { key:'midFreq',   label:'MF Freq', min:200, max:8000,step:50,  unit:'Hz', def:1000 },
    { key:'highFreq',  label:'HF Freq', min:2000,max:16000,step:100,unit:'Hz', def:6000 },
  ],
  Compressor: [
    { key:'threshold',  label:'Threshold', min:-60, max:0,   step:0.5, unit:'dB', def:-24 },
    { key:'ratio',      label:'Ratio',     min:1,   max:20,  step:0.5, unit:':1', def:4 },
    { key:'attack',     label:'Attack',    min:0,   max:0.2, step:0.001,unit:'s', def:0.003 },
    { key:'release',    label:'Release',   min:0,   max:1,   step:0.01, unit:'s', def:0.25 },
    { key:'knee',       label:'Knee',      min:0,   max:40,  step:1,   unit:'dB', def:10 },
    { key:'makeupGain', label:'Makeup',    min:-6,  max:24,  step:0.5, unit:'dB', def:0 },
  ],
  Reverb: [
    { key:'roomSize', label:'Room',     min:0,    max:1,   step:0.01, unit:'',  def:0.6 },
    { key:'damping',  label:'Damping',  min:0,    max:1,   step:0.01, unit:'',  def:0.5 },
    { key:'wet',      label:'Wet',      min:0,    max:1,   step:0.01, unit:'',  def:0.3 },
    { key:'predelay', label:'Predelay', min:0,    max:0.1, step:0.001,unit:'s', def:0.02 },
  ],
  Delay: [
    { key:'time',       label:'Time',     min:0,    max:2,   step:0.001,unit:'s', def:0.375 },
    { key:'feedback',   label:'Feedback', min:0,    max:0.95,step:0.01, unit:'',  def:0.4 },
    { key:'wet',        label:'Wet',      min:0,    max:1,   step:0.01, unit:'',  def:0.3 },
    { key:'filterFreq', label:'Filter',   min:500, max:20000,step:100,  unit:'Hz',def:4000 },
  ],
  Distortion: [
    { key:'drive', label:'Drive', min:0,   max:100,  step:1,   unit:'',   def:50 },
    { key:'tone',  label:'Tone',  min:500, max:12000,step:100, unit:'Hz', def:3000 },
    { key:'wet',   label:'Wet',   min:0,   max:1,    step:0.01,unit:'',   def:0.8 },
  ],
  Chorus: [
    { key:'rate',     label:'Rate',     min:0.1, max:8,   step:0.1,  unit:'Hz', def:1.2 },
    { key:'depth',    label:'Depth',    min:0,   max:0.02,step:0.0005,unit:'',  def:0.003 },
    { key:'feedback', label:'Feedback', min:0,   max:0.9, step:0.01, unit:'',   def:0.2 },
    { key:'wet',      label:'Wet',      min:0,   max:1,   step:0.01, unit:'',   def:0.4 },
  ],
  Bitcrusher: [
    { key:'bits',      label:'Bits',      min:1, max:16, step:1,  unit:'bit', def:8 },
    { key:'reduction', label:'Sample Rd', min:1, max:32, step:1,  unit:'x',   def:4 },
    { key:'wet',       label:'Wet',       min:0, max:1,  step:0.01,unit:'',   def:1 },
  ],
  Phaser: [
    { key:'rate',     label:'Rate',     min:0.05,max:5,    step:0.05, unit:'Hz', def:0.5 },
    { key:'depth',    label:'Depth',    min:50,  max:2000, step:50,   unit:'Hz', def:600 },
    { key:'feedback', label:'Feedback', min:0,   max:0.95, step:0.01, unit:'',   def:0.7 },
    { key:'wet',      label:'Wet',      min:0,   max:1,    step:0.01, unit:'',   def:0.5 },
  ],
}

// ─── Main component ───────────────────────────────────────────────

export default function EffectsRackView() {
  const [effects,      setEffects]      = useState([])
  const [masterMode,   setMasterMode]   = useState(false) // reroute app master audio
  const [testFile,     setTestFile]     = useState(null)
  const [testPlaying,  setTestPlaying]  = useState(false)
  const [addMenuOpen,  setAddMenuOpen]  = useState(false)
  const [dragIdx,      setDragIdx]      = useState(null)
  const [dragOverIdx,  setDragOverIdx]  = useState(null)

  const nodesRef    = useRef({})          // effectId → node group
  const rackInRef   = useRef(null)
  const rackOutRef  = useRef(null)
  const testSrcRef  = useRef(null)

  // ── Init rack bus ──────────────────────────────────────────────
  const ensureRack = useCallback(() => {
    if (rackInRef.current) return
    const c = getCtx()
    rackInRef.current  = c.createGain()
    rackOutRef.current = c.createGain()
    rackOutRef.current.connect(c.destination)
  }, [])

  // ── Rebuild serial chain ───────────────────────────────────────
  const rebuildChain = useCallback((effs) => {
    ensureRack()
    const rIn  = rackInRef.current
    const rOut = rackOutRef.current
    // Disconnect all
    try { rIn.disconnect() } catch {}
    Object.values(nodesRef.current).forEach(n => {
      try { n.inputNode.disconnect() } catch {}
      try { n.outputNode.disconnect() } catch {}
    })
    // Reconnect in order (skipping bypassed via zero-gain trick)
    let prev = rIn
    effs.forEach(eff => {
      const n = nodesRef.current[eff.id]
      if (!n) return
      prev.connect(n.inputNode)
      prev = n.outputNode
    })
    prev.connect(rOut)
  }, [ensureRack])

  // ── Add effect ─────────────────────────────────────────────────
  const addEffect = useCallback((type) => {
    ensureRack()
    const id     = mkId()
    const params = { ...DEFAULT_PARAMS[type] }
    const eff    = { id, type, params, bypass: false }
    const nodes  = createEffectNodes(getCtx(), type, params)
    nodesRef.current[id] = nodes
    setEffects(prev => {
      const next = [...prev, eff]
      setTimeout(() => rebuildChain(next), 0)
      return next
    })
    setAddMenuOpen(false)
  }, [ensureRack, rebuildChain])

  // ── Remove effect ──────────────────────────────────────────────
  const removeEffect = useCallback((id) => {
    const nodes = nodesRef.current[id]
    if (nodes) { disposeNodes(nodes); delete nodesRef.current[id] }
    setEffects(prev => {
      const next = prev.filter(e => e.id !== id)
      setTimeout(() => rebuildChain(next), 0)
      return next
    })
  }, [rebuildChain])

  // ── Toggle bypass ──────────────────────────────────────────────
  const toggleBypass = useCallback((id) => {
    setEffects(prev => {
      const next = prev.map(e => e.id === id ? { ...e, bypass: !e.bypass } : e)
      const n = nodesRef.current[id]
      const eff = next.find(e => e.id === id)
      if (n) {
        if (eff.bypass) {
          // Bypass: mute effect output, connect input directly
          try { n.inputNode.disconnect() } catch {}
          try { n.outputNode.disconnect() } catch {}
          n.inputNode.connect(n.outputNode)
        } else {
          // Re-enable: let rebuildChain restore proper routing
          try { n.inputNode.disconnect() } catch {}
          setTimeout(() => rebuildChain(next), 0)
        }
      }
      return next
    })
  }, [rebuildChain])

  // ── Update param ───────────────────────────────────────────────
  const updateParam = useCallback((id, key, value) => {
    setEffects(prev => {
      const next = prev.map(e => e.id === id ? { ...e, params: { ...e.params, [key]: value } } : e)
      const eff  = next.find(e => e.id === id)
      const n    = nodesRef.current[id]
      if (n && eff) applyParam(n, eff.type, key, value)
      // Reverb/Bitcrusher need full rebuild on room-size / bits / reduction change
      if ((eff?.type === 'Reverb' && (key === 'roomSize' || key === 'damping')) ||
          (eff?.type === 'Bitcrusher' && key !== 'wet')) {
        disposeNodes(n)
        nodesRef.current[id] = createEffectNodes(getCtx(), eff.type, eff.params)
        setTimeout(() => rebuildChain(next), 0)
      }
      return next
    })
  }, [rebuildChain])

  // ── Master mode reroute ────────────────────────────────────────
  useEffect(() => {
    ensureRack()
    if (masterMode) {
      rerouteMasterOut(rackInRef.current)
    } else {
      restoreMasterOut()
    }
    return () => {}
  }, [masterMode, ensureRack])

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      restoreMasterOut()
      Object.values(nodesRef.current).forEach(disposeNodes)
      if (testSrcRef.current) try { testSrcRef.current.stop() } catch {}
    }
  }, [])

  // ── Test audio ─────────────────────────────────────────────────
  const loadTest = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setTestFile(file.name)
    e.target.value = ''
  }

  const playTest = async () => {
    if (!testFile) return
    ensureRack()
    if (testSrcRef.current) { try { testSrcRef.current.stop() } catch {} testSrcRef.current = null; setTestPlaying(false); return }
    // re-read via input — for simplicity store blob in ref
    setTestPlaying(true)
  }

  // ── Drag reorder ───────────────────────────────────────────────
  const onDragStart = (idx) => setDragIdx(idx)
  const onDragOver  = (e, idx) => { e.preventDefault(); setDragOverIdx(idx) }
  const onDrop      = (idx) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return }
    setEffects(prev => {
      const next = [...prev]
      const [item] = next.splice(dragIdx, 1)
      next.splice(idx, 0, item)
      setTimeout(() => rebuildChain(next), 0)
      return next
    })
    setDragIdx(null); setDragOverIdx(null)
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background:'#09090f', color:'#e0e0e0' }}>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 flex-wrap"
           style={{ borderColor:'#1a1a2e', background:'#0d0d1a' }}>
        <span className="font-display text-sm tracking-widest uppercase"
              style={{ background:'linear-gradient(90deg,#ff2d55,#b44fff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Effects Rack
        </span>
        <div className="w-px h-4" style={{ background:'#1a1a2e' }} />

        {/* Add effect */}
        <div className="relative">
          <button onClick={() => setAddMenuOpen(v => !v)}
                  className="text-xs px-3 py-1 rounded font-ui transition-all"
                  style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#00ff9d' }}>
            + Add Effect
          </button>
          {addMenuOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-hidden shadow-xl"
                 style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', minWidth:140 }}>
              {EFFECT_TYPES.map(t => (
                <button key={t} onClick={() => addEffect(t)}
                        className="w-full text-left px-3 py-1.5 text-xs font-ui transition-all hover:brightness-150"
                        style={{ color: EFFECT_COLORS[t] }}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Master toggle */}
        <button onClick={() => setMasterMode(v => !v)}
                className="text-xs px-3 py-1 rounded font-ui font-semibold transition-all"
                style={{
                  background: masterMode ? 'rgba(255,230,0,0.15)' : '#1a1a2e',
                  border: `1px solid ${masterMode ? '#ffe600' : '#2a2a3e'}`,
                  color: masterMode ? '#ffe600' : '#666',
                  boxShadow: masterMode ? '0 0 8px rgba(255,230,0,0.3)' : 'none',
                }}>
          {masterMode ? '⚡ Master Active' : '⚡ Apply to Master'}
        </button>

        <div className="flex-1" />
        <span className="text-xs font-mono" style={{ color:'#444' }}>
          {effects.length} effect{effects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Rack */}
      <div className="flex-1 overflow-y-auto p-3">
        {effects.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ color:'#333' }}>
            <div style={{ fontSize:36 }}>⚙</div>
            <div className="text-sm font-mono text-center">
              Click <strong style={{ color:'#00ff9d' }}>+ Add Effect</strong> to build your chain<br/>
              Enable <strong style={{ color:'#ffe600' }}>Apply to Master</strong> to process all app audio
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {effects.map((eff, idx) => (
            <EffectSlot
              key={eff.id}
              eff={eff}
              idx={idx}
              total={effects.length}
              isDragOver={dragOverIdx === idx}
              onBypass={() => toggleBypass(eff.id)}
              onRemove={() => removeEffect(eff.id)}
              onParam={(k, v) => updateParam(eff.id, k, v)}
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={() => onDrop(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Effect slot ──────────────────────────────────────────────────

function EffectSlot({ eff, isDragOver, onBypass, onRemove, onParam, onDragStart, onDragOver, onDrop }) {
  const [expanded, setExpanded] = useState(true)
  const color = EFFECT_COLORS[eff.type] || '#888'
  const defs  = PARAM_DEFS[eff.type] || []

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="rounded-lg overflow-hidden transition-all"
      style={{
        border: `1px solid ${isDragOver ? '#5577ff' : eff.bypass ? '#1a1a2e' : `${color}44`}`,
        background: eff.bypass ? '#0d0d1a' : `${color}08`,
        opacity: eff.bypass ? 0.55 : 1,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing">
        <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: eff.bypass ? '#333' : color }} />

        {/* Bypass */}
        <button onClick={(e) => { e.stopPropagation(); onBypass() }}
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono transition-all"
                style={{
                  background: eff.bypass ? 'transparent' : `${color}33`,
                  border: `1px solid ${eff.bypass ? '#333' : color}`,
                  color: eff.bypass ? '#444' : color,
                }}
                title={eff.bypass ? 'Enable' : 'Bypass'}>
          {eff.bypass ? '○' : '●'}
        </button>

        <span className="text-sm font-ui font-bold flex-1" style={{ color: eff.bypass ? '#555' : color }}>
          {eff.type}
        </span>

        <button onClick={() => setExpanded(v => !v)}
                className="text-xs px-1 font-mono transition-all"
                style={{ color:'#444' }}>
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onRemove}
                className="w-5 h-5 flex items-center justify-center rounded text-xs transition-all"
                style={{ color:'#ff2d5555', background:'transparent' }}
                title="Remove">×</button>
      </div>

      {/* Params */}
      {expanded && (
        <div className="px-3 pb-3 grid gap-x-4 gap-y-2"
             style={{ gridTemplateColumns: defs.length > 3 ? 'repeat(3,1fr)' : `repeat(${defs.length},1fr)` }}>
          {defs.map(def => (
            <ParamKnob key={def.key} def={def} value={eff.params[def.key] ?? def.def}
                       color={color} onChange={(v) => onParam(def.key, v)} />
          ))}
          {/* Distortion type selector */}
          {eff.type === 'Distortion' && (
            <div className="col-span-3 flex gap-1 mt-1">
              {['soft','hard','fuzz'].map(t => (
                <button key={t} onClick={() => onParam('type', t)}
                        className="text-xs px-2 py-0.5 rounded font-ui capitalize transition-all"
                        style={{
                          background: eff.params.type === t ? `${color}33` : 'transparent',
                          border: `1px solid ${eff.params.type === t ? color : '#1e1e2e'}`,
                          color: eff.params.type === t ? color : '#555',
                        }}>{t}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ParamKnob({ def, value, color, onChange }) {
  const fmt = (v) => {
    if (def.unit === 'dB' || def.unit === ':1' || def.unit === 'Hz' || def.unit === 'bit' || def.unit === 'x') return `${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(def.step < 0.01 ? 3 : def.step < 0.1 ? 2 : 1)) : v}${def.unit}`
    if (def.unit === 's') return `${(v * 1000).toFixed(0)}ms`
    return typeof v === 'number' ? (v * 100).toFixed(0) + '%' : v
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-ui" style={{ color:'#555', fontSize:10 }}>{def.label}</span>
        <span className="text-xs font-mono" style={{ color, fontSize:10 }}>{fmt(value)}</span>
      </div>
      <input type="range" min={def.min} max={def.max} step={def.step} value={value}
             onChange={e => onChange(Number(e.target.value))}
             className="w-full" style={{ accentColor: color }} />
    </div>
  )
}
