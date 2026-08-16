import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

// ─── Bus definitions ──────────────────────────────────────────────

const MASTER_ID = 'master'

const DEFAULT_BUSES = [
  { id: 'drums',  name: 'Drums',   color: '#ff2d55', volume: 0.9, mute: false, solo: false },
  { id: 'bass',   name: 'Bass',    color: '#ff9500', volume: 0.85,mute: false, solo: false },
  { id: 'synths', name: 'Synths',  color: '#b44fff', volume: 0.8, mute: false, solo: false },
  { id: 'vox',    name: 'Vocals',  color: '#00e5ff', volume: 0.85,mute: false, solo: false },
  { id: 'fx',     name: 'FX Rtn',  color: '#00ff9d', volume: 0.7, mute: false, solo: false },
  { id: MASTER_ID,name: 'Master',  color: '#ffe600', volume: 1.0, mute: false, solo: false },
]

// Default routing: each non-master bus sends to Master
function defaultRouting(buses) {
  const map = {}
  buses.forEach(b => {
    if (b.id !== MASTER_ID) map[`${b.id}->${MASTER_ID}`] = 1.0
  })
  return map
}

let _uid = 1
function mkBusId() { return `bus-${_uid++}` }

// ─── Audio engine ─────────────────────────────────────────────────

function createBusNodes(c, bus) {
  const input    = c.createGain()
  const fader    = c.createGain()
  const analyser = c.createAnalyser()
  analyser.fftSize = 512
  input.connect(fader)
  fader.connect(analyser)
  fader.gain.value = bus.mute ? 0 : bus.volume
  return { input, fader, analyser }
}

function getVU(analyser) {
  if (!analyser) return { l: 0, r: 0 }
  const data = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(data)
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
  const rms = Math.sqrt(sum / data.length)
  return { l: rms, r: rms }
}

// ─── VU Meter ─────────────────────────────────────────────────────

function VUMeter({ analyserNode, color, height = 80 }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const peakRef   = useRef(0)
  const peakHoldRef = useRef(0)

  useEffect(() => {
    if (!analyserNode) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height

    const tick = () => {
      const vu = getVU(analyserNode)
      const level = Math.min(vu.l * 4, 1)

      // Peak hold
      if (level > peakRef.current) {
        peakRef.current  = level
        peakHoldRef.current = Date.now()
      } else if (Date.now() - peakHoldRef.current > 1500) {
        peakRef.current = Math.max(0, peakRef.current - 0.005)
      }

      ctx.clearRect(0, 0, w, h)

      // Draw segments (8 segments)
      const segs = 16
      const segH = (h - segs) / segs
      for (let i = 0; i < segs; i++) {
        const segLevel = (segs - i) / segs
        const active   = level >= segLevel
        const isClip   = i < 2
        const isMid    = i < 5
        const segColor = active
          ? isClip  ? '#ff2d55'
          : isMid   ? '#ffe600'
          : color
          : '#1a1a2e'
        ctx.fillStyle = segColor
        ctx.fillRect(2, i * (segH + 1), w - 4, segH)
      }

      // Peak line
      if (peakRef.current > 0) {
        const py = Math.round((1 - peakRef.current) * (h - 4)) + 2
        ctx.fillStyle = peakRef.current > 0.85 ? '#ff2d55' : '#fff'
        ctx.fillRect(2, py, w - 4, 1)
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyserNode, color])

  return (
    <canvas ref={canvasRef} width={16} height={height}
            style={{ display:'block', width:16, height }} />
  )
}

// ─── Send matrix cell ─────────────────────────────────────────────

function MatrixCell({ level, active, color, onChange }) {
  return (
    <td className="p-0.5 text-center" style={{ width:56, minWidth:56 }}>
      <div
        className="relative rounded cursor-pointer select-none transition-all mx-auto"
        style={{
          width:48, height:32,
          background: active ? `${color}22` : '#111120',
          border:`1px solid ${active ? color : '#1a1a2a'}`,
        }}
        onClick={() => onChange(active ? 0 : 1)}
      >
        {active && (
          <>
            <input
              type="range" min={0} max={1} step={0.01} value={level}
              onChange={e => { e.stopPropagation(); onChange(Number(e.target.value)) }}
              onClick={e => e.stopPropagation()}
              className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
              style={{ height:'100%' }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-mono"
                 style={{ color, fontSize:10 }}>
              {Math.round(level * 100)}
            </div>
            <div className="absolute bottom-0 left-0 h-0.5 rounded-b transition-all"
                 style={{ width:`${level*100}%`, background:color }} />
          </>
        )}
        {!active && (
          <div className="flex items-center justify-center h-full text-xs"
               style={{ color:'#2a2a2a' }}>–</div>
        )}
      </div>
    </td>
  )
}

// ─── Bus channel strip ────────────────────────────────────────────

function BusStrip({ bus, isMaster, vuAnalyser, onUpdate, onRemove, hasSolo }) {
  const level = bus.mute ? 0 : bus.volume
  const dimmed = hasSolo && !bus.solo && !isMaster

  return (
    <div className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg shrink-0 transition-all"
         style={{
           width: 72,
           background: `${bus.color}0a`,
           border:`1px solid ${bus.solo ? bus.color : bus.mute ? '#1a1a2e' : `${bus.color}33`}`,
           opacity: dimmed ? 0.35 : 1,
         }}>

      {/* Name */}
      <div className="text-xs font-ui font-bold text-center truncate w-full"
           style={{ color: bus.mute ? '#555' : bus.color, fontSize:10 }}>
        {bus.name}
      </div>

      {/* VU meter */}
      <VUMeter analyserNode={vuAnalyser} color={bus.color} height={90} />

      {/* Fader */}
      <div className="flex flex-col items-center gap-0.5 w-full">
        <span className="text-xs font-mono" style={{ color: bus.color, fontSize:9 }}>
          {bus.mute ? 'MUTE' : `${Math.round(bus.volume * 100)}%`}
        </span>
        <input type="range" min={0} max={1} step={0.01} value={bus.volume}
               onChange={e => onUpdate({ volume: Number(e.target.value) })}
               className="w-full" style={{ accentColor: bus.color }}
               orient="vertical"
        />
      </div>

      {/* Mute / Solo */}
      <div className="flex gap-1 w-full">
        <button onClick={() => onUpdate({ mute: !bus.mute })}
                className="flex-1 text-xs py-0.5 rounded font-ui font-bold transition-all"
                style={{ background: bus.mute ? '#ff2d5533' : 'transparent',
                         border:`1px solid ${bus.mute ? '#ff2d55' : '#1e1e2e'}`,
                         color: bus.mute ? '#ff2d55' : '#555', fontSize:9 }}>M</button>
        {!isMaster && (
          <button onClick={() => onUpdate({ solo: !bus.solo })}
                  className="flex-1 text-xs py-0.5 rounded font-ui font-bold transition-all"
                  style={{ background: bus.solo ? '#ffe60033' : 'transparent',
                           border:`1px solid ${bus.solo ? '#ffe600' : '#1e1e2e'}`,
                           color: bus.solo ? '#ffe600' : '#555', fontSize:9 }}>S</button>
        )}
      </div>

      {/* Remove (not for master or default buses) */}
      {!isMaster && bus.id.startsWith('bus-') && (
        <button onClick={onRemove}
                className="text-xs transition-all"
                style={{ color:'#ff2d5544' }}
                title="Remove bus">×</button>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

export default function BusRoutingView() {
  const [buses,   setBuses]   = useState(DEFAULT_BUSES)
  const [routing, setRouting] = useState(() => defaultRouting(DEFAULT_BUSES))
  const [newName, setNewName] = useState('')
  const [newColor,setNewColor]= useState('#5577ff')
  const [showAdd, setShowAdd] = useState(false)

  const nodesRef = useRef({})   // busId → { input, fader, analyser }
  const ctxRef   = useRef(null)

  // ── Init audio nodes ───────────────────────────────────────────
  const ensureNodes = useCallback(() => {
    if (ctxRef.current) return
    const c = getCtx()
    ctxRef.current = c
    buses.forEach(b => {
      nodesRef.current[b.id] = createBusNodes(c, b)
    })
    // Connect analyser → destination for master, others stay disconnected (demo mode)
    const master = nodesRef.current[MASTER_ID]
    if (master) master.analyser.connect(c.destination)
  }, [buses])

  // ── Rebuild audio routing ──────────────────────────────────────
  const rebuildRouting = useCallback((buses, routing) => {
    const c = ctxRef.current
    if (!c) return

    // Disconnect all analysers from anything except destination
    Object.entries(nodesRef.current).forEach(([id, n]) => {
      if (id !== MASTER_ID) {
        try { n.analyser.disconnect() } catch {}
      }
    })

    // Reconnect per routing map
    Object.entries(routing).forEach(([key, level]) => {
      const [fromId, toId] = key.split('->')
      const from = nodesRef.current[fromId]
      const to   = nodesRef.current[toId]
      if (from && to && level > 0) {
        try { from.analyser.connect(to.input) } catch {}
      }
    })
  }, [])

  useEffect(() => { ensureNodes() }, [ensureNodes])

  useEffect(() => {
    if (!ctxRef.current) return
    rebuildRouting(buses, routing)
  }, [buses, routing, rebuildRouting])

  // Sync fader gains
  useEffect(() => {
    const hasSolo = buses.some(b => b.solo)
    buses.forEach(b => {
      const n = nodesRef.current[b.id]
      if (!n) return
      const audible = !b.mute && (!hasSolo || b.solo || b.id === MASTER_ID)
      n.fader.gain.setTargetAtTime(audible ? b.volume : 0, getCtx().currentTime, 0.02)
    })
  }, [buses])

  // Cleanup
  useEffect(() => () => {
    Object.values(nodesRef.current).forEach(n => {
      try { n.input.disconnect(); n.fader.disconnect(); n.analyser.disconnect() } catch {}
    })
  }, [])

  // ── Bus ops ────────────────────────────────────────────────────
  const updateBus = (id, patch) => setBuses(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))

  const addBus = () => {
    if (!newName.trim()) return
    const id  = mkBusId()
    const bus = { id, name: newName.trim(), color: newColor, volume: 0.8, mute: false, solo: false }
    setBuses(prev => [...prev.slice(0, -1), bus, prev[prev.length - 1]])  // before master
    setRouting(prev => ({ ...prev, [`${id}->${MASTER_ID}`]: 1.0 }))
    // Create audio node
    ensureNodes()
    nodesRef.current[id] = createBusNodes(ctxRef.current, bus)
    setNewName('')
    setShowAdd(false)
  }

  const removeBus = (id) => {
    setBuses(prev => prev.filter(b => b.id !== id))
    setRouting(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { if (k.includes(id)) delete next[k] })
      return next
    })
    const n = nodesRef.current[id]
    if (n) { try { n.input.disconnect(); n.fader.disconnect(); n.analyser.disconnect() } catch {} delete nodesRef.current[id] }
  }

  const toggleRoute = (fromId, toId, level) => {
    const key = `${fromId}->${toId}`
    setRouting(prev => {
      const next = { ...prev }
      if (level === 0) delete next[key]
      else next[key] = level
      return next
    })
  }

  const hasSolo = buses.some(b => b.solo)

  // Non-master buses for matrix rows
  const srcBuses  = buses.filter(b => b.id !== MASTER_ID)
  const destBuses = buses.filter(b => b.id !== MASTER_ID)  // can route to groups too

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background:'#09090f', color:'#e0e0e0' }}>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
           style={{ borderColor:'#1a1a2e', background:'#0d0d1a' }}>
        <span className="font-display text-sm tracking-widest uppercase"
              style={{ background:'linear-gradient(90deg,#ffe600,#ff9500)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Bus Routing
        </span>
        <div className="w-px h-4" style={{ background:'#1a1a2e' }} />

        <button onClick={() => setShowAdd(v => !v)}
                className="text-xs px-3 py-1 rounded font-ui transition-all"
                style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#00ff9d' }}>
          + New Bus
        </button>

        {showAdd && (
          <div className="flex items-center gap-2">
            <input type="text" placeholder="Bus name…" value={newName}
                   onChange={e => setNewName(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && addBus()}
                   className="text-xs px-2 py-1 rounded font-mono w-28"
                   style={{ background:'#111120', border:'1px solid #1a1a2e', color:'#e0e0e0' }} />
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                   className="w-7 h-7 rounded cursor-pointer" style={{ border:'1px solid #2a2a3e' }} />
            <button onClick={addBus}
                    className="text-xs px-3 py-1 rounded font-ui transition-all"
                    style={{ background:'#00ff9d22', border:'1px solid #00ff9d', color:'#00ff9d' }}>
              Add
            </button>
          </div>
        )}

        <div className="flex-1" />
        <span className="text-xs font-mono" style={{ color:'#444' }}>
          {srcBuses.length} bus{srcBuses.length !== 1 ? 'es' : ''} → Master
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Channel strips */}
        <div className="flex items-end gap-2 p-4 overflow-x-auto shrink-0 border-r"
             style={{ borderColor:'#1a1a2e', background:'#0c0c1a', minWidth:0 }}>
          {buses.map(bus => (
            <BusStrip
              key={bus.id}
              bus={bus}
              isMaster={bus.id === MASTER_ID}
              vuAnalyser={nodesRef.current[bus.id]?.analyser}
              hasSolo={hasSolo}
              onUpdate={(patch) => updateBus(bus.id, patch)}
              onRemove={() => removeBus(bus.id)}
            />
          ))}
        </div>

        {/* Routing matrix + details */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Matrix header */}
          <div className="px-4 py-3 border-b shrink-0" style={{ borderColor:'#1a1a2e', background:'#0b0b15' }}>
            <div className="text-xs font-ui font-semibold tracking-wider mb-1" style={{ color:'#444' }}>
              SEND MATRIX — click cell to enable send, drag slider inside to set level
            </div>
          </div>

          {/* Matrix */}
          <div className="flex-1 overflow-auto p-4">
            <table className="border-collapse" style={{ borderSpacing:0 }}>
              <thead>
                <tr>
                  <th className="text-xs font-mono text-right pr-3 pb-2" style={{ color:'#444', minWidth:80 }}>From ↓ / To →</th>
                  {/* Destination columns: groups + master */}
                  {buses.filter(b => b.id !== srcBuses[0]?.id || true).map(dest => (
                    srcBuses.some(s => s.id !== dest.id) || dest.id === MASTER_ID
                  ) && (
                    <th key={dest.id} className="text-xs font-mono pb-2 text-center" style={{ width:56, color: dest.color }}>
                      {dest.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {srcBuses.map(src => (
                  <tr key={src.id}>
                    <td className="text-xs font-mono text-right pr-3 py-1"
                        style={{ color: src.color }}>{src.name}</td>
                    {buses.filter(b => b.id !== src.id).map(dest => {
                      const key   = `${src.id}->${dest.id}`
                      const level = routing[key] ?? 0
                      const active= level > 0
                      return (
                        <MatrixCell
                          key={dest.id}
                          level={level}
                          active={active}
                          color={dest.color}
                          onChange={(v) => toggleRoute(src.id, dest.id, v)}
                        />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Signal flow legend */}
            <div className="mt-6 p-3 rounded-lg" style={{ background:'#111120', border:'1px solid #1a1a2e' }}>
              <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color:'#444' }}>SIGNAL FLOW</div>
              <div className="flex flex-wrap gap-2">
                {srcBuses.map(src => {
                  const dests = Object.entries(routing)
                    .filter(([k, v]) => k.startsWith(`${src.id}->`) && v > 0)
                    .map(([k, v]) => {
                      const destId = k.split('->')[1]
                      const dest   = buses.find(b => b.id === destId)
                      return dest ? `${dest.name} (${Math.round(v*100)}%)` : null
                    }).filter(Boolean)
                  if (!dests.length) return null
                  return (
                    <div key={src.id} className="flex items-center gap-1 text-xs font-mono">
                      <span style={{ color: src.color }}>{src.name}</span>
                      <span style={{ color:'#444' }}>→</span>
                      {dests.map((d, i) => (
                        <span key={i} style={{ color:'#888' }}>{d}{i < dests.length-1 ? ', ' : ''}</span>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Master section info */}
            <div className="mt-4 p-3 rounded-lg" style={{ background:'#111120', border:'1px solid #1a1a2e' }}>
              <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color:'#444' }}>HOW TO USE</div>
              <div className="text-xs font-mono space-y-1" style={{ color:'#555' }}>
                <div>• Channel strips show real-time VU meters for each bus</div>
                <div>• Use M (mute) and S (solo) buttons to control monitoring</div>
                <div>• Send matrix: click cell to enable a send route between buses</div>
                <div>• Drag the mini slider inside each cell to set send level (0–100%)</div>
                <div>• Add custom buses with + New Bus for parallel processing groups</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
