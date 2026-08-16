import React, { useState } from 'react'
import { useStudioStore } from '../../store/useStudioStore'

/* ── Insert types & UI config ──────────────────────────────────────── */
const INSERT_TYPES = ['EQ3', 'Compressor', 'Reverb', 'Delay', 'Saturate', 'Chorus', 'Filter', 'BitCrush', 'Gain']

const INSERT_ICONS = {
  EQ3: '≈', Compressor: '⊕', Reverb: '◌', Delay: '⟳',
  Saturate: '◉', Chorus: '~', Filter: '▽', BitCrush: '≋', Gain: '⊞',
}

const PARAM_CFGS = {
  EQ3: [
    { k: 'low',  lbl: 'LO', min: -12, max: 12,   step: .5, col: '#b44fff', fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
    { k: 'mid',  lbl: 'MD', min: -12, max: 12,   step: .5, col: '#00e5ff', fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
    { k: 'high', lbl: 'HI', min: -12, max: 12,   step: .5, col: '#ffe600', fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
  ],
  Compressor: [
    { k: 'threshold', lbl: 'THR', min: -60, max: 0,    step: 1,   col: '#ff9500', fmt: (v) => `${v}dB` },
    { k: 'ratio',     lbl: 'RAT', min: 1,   max: 20,   step: .5,  col: '#ff9500', fmt: (v) => `${v}:1` },
    { k: 'attack',    lbl: 'ATK', min: 1,   max: 300,  step: 1,   col: '#00ff9d', fmt: (v) => `${v}ms` },
    { k: 'release',   lbl: 'REL', min: 10,  max: 1000, step: 10,  col: '#00ff9d', fmt: (v) => `${v}ms` },
    { k: 'gain',      lbl: 'MKP', min: -6,  max: 24,   step: .5,  col: '#ffe600', fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
  ],
  Saturate: [
    { k: 'drive', lbl: 'DRV', min: 0, max: 100, step: 1, col: '#ff2d55', fmt: (v) => `${v}%` },
    { k: 'mix',   lbl: 'MIX', min: 0, max: 100, step: 1, col: '#ff9500', fmt: (v) => `${v}%` },
  ],
  Chorus: [
    { k: 'rate',  lbl: 'RATE', min: .1, max: 10,  step: .1, col: '#00e5ff', fmt: (v) => `${v}Hz` },
    { k: 'depth', lbl: 'DPTH', min: 0,  max: 100, step: 1,  col: '#b44fff', fmt: (v) => `${v}%` },
    { k: 'mix',   lbl: 'MIX',  min: 0,  max: 100, step: 1,  col: '#00ff9d', fmt: (v) => `${v}%` },
  ],
  Filter: [
    { k: 'freq', lbl: 'FREQ', min: 20, max: 20000, step: 10, col: '#ffe600', fmt: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}` },
    { k: 'q',    lbl: 'Q',    min: .1, max: 10,    step: .1, col: '#ff9500', fmt: (v) => `${v}` },
  ],
  BitCrush: [
    { k: 'bits', lbl: 'BITS', min: 4,  max: 16,  step: 1, col: '#ff2d55', fmt: (v) => `${v}` },
    { k: 'mix',  lbl: 'MIX',  min: 0,  max: 100, step: 1, col: '#ff9500', fmt: (v) => `${v}%` },
  ],
  Reverb: [
    { k: 'room',     lbl: 'ROOM', min: 0,   max: 100,  step: 1,  col: '#b44fff', fmt: (v) => `${v}%` },
    { k: 'decay',    lbl: 'DCAY', min: 0.1, max: 10,   step: 0.1,col: '#b44fff', fmt: (v) => `${v}s` },
    { k: 'predelay', lbl: 'PRE',  min: 0,   max: 100,  step: 1,  col: '#00e5ff', fmt: (v) => `${v}ms` },
    { k: 'wet',      lbl: 'WET',  min: 0,   max: 100,  step: 1,  col: '#00ff9d', fmt: (v) => `${v}%` },
  ],
  Delay: [
    { k: 'time',     lbl: 'TIME', min: 50,  max: 2000, step: 5,  col: '#ffe600', fmt: (v) => `${v}ms` },
    { k: 'feedback', lbl: 'FDBK', min: 0,   max: 95,   step: 1,  col: '#ff9500', fmt: (v) => `${v}%` },
    { k: 'damp',     lbl: 'DAMP', min: 0,   max: 100,  step: 1,  col: '#00e5ff', fmt: (v) => `${v}%` },
    { k: 'wet',      lbl: 'WET',  min: 0,   max: 100,  step: 1,  col: '#00ff9d', fmt: (v) => `${v}%` },
  ],
  Gain: [
    { k: 'gain', lbl: 'GAIN', min: -24, max: 24, step: .5, col: '#00ff9d', fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
  ],
}

/* ── VU Meter ──────────────────────────────────────────────────────── */
function VUMeter({ active }) {
  return (
    <div className="flex flex-col-reverse gap-px h-24 w-3">
      {Array.from({ length: 12 }).map((_, i) => {
        const lit = i < (active ? Math.floor(Math.random() * 8) + 3 : 0)
        const color = i >= 10 ? '#ff2d55' : i >= 7 ? '#ffe600' : '#00ff9d'
        return (
          <div key={i} className="flex-1 rounded-sm transition-all duration-75"
            style={{ background: lit ? color : '#1c1c30', boxShadow: lit ? `0 0 4px ${color}60` : 'none' }}
          />
        )
      })}
    </div>
  )
}

/* ── Pan Knob ──────────────────────────────────────────────────────── */
function PanKnob({ value, onChange }) {
  const [dragging, setDragging] = useState(false)
  const [startY,   setStartY]   = useState(0)
  const [startVal, setStartVal] = useState(0)
  const deg   = (value / 100) * 140
  const color = value === 0 ? '#888899' : value > 0 ? '#00e5ff' : '#b44fff'
  return (
    <div
      className="relative w-8 h-8 rounded-full cursor-pointer select-none"
      style={{ background: 'conic-gradient(from 210deg,#1c1c30 0deg,#252540 360deg)', border: `1.5px solid ${color}66`, boxShadow: `0 0 6px ${color}33` }}
      onMouseDown={(e) => { setDragging(true); setStartY(e.clientY); setStartVal(value); e.preventDefault() }}
      onMouseMove={(e) => { if (!dragging) return; onChange(Math.max(-100, Math.min(100, Math.round(startVal + (startY - e.clientY) * 1.5)))) }}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
      title={`Pan: ${value > 0 ? 'R' : value < 0 ? 'L' : 'C'}${value !== 0 ? Math.abs(value) : ''}`}
    >
      <div className="absolute w-0.5 h-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 4px ${color}`, left: '50%', top: '4px', transformOrigin: '50% calc(100% + 6px)', transform: `translateX(-50%) rotate(${deg}deg)` }}
      />
    </div>
  )
}

/* ── Insert Params ─────────────────────────────────────────────────── */
function InsertParams({ type, params, onChange }) {
  const cfgs = PARAM_CFGS[type] || []
  return (
    <div className="bg-studio-void rounded border border-studio-border/40 px-1.5 py-1 flex flex-col gap-0.5 mt-0.5">
      {type === 'Filter' && (
        <div className="flex gap-0.5 mb-0.5">
          {['LP', 'HP', 'BP'].map((t) => (
            <button key={t}
              onClick={() => onChange('ftype', t)}
              className={`flex-1 font-mono rounded py-0.5 border transition-colors ${
                params.ftype === t
                  ? 'bg-studio-yellow border-studio-yellow text-black'
                  : 'border-studio-border text-studio-dim hover:text-white'
              }`}
              style={{ fontSize: 7 }}
            >{t}</button>
          ))}
        </div>
      )}
      {cfgs.map(({ k, lbl, min, max, step, col, fmt }) => (
        <div key={k} className="flex items-center gap-1">
          <span className="font-mono w-5 shrink-0" style={{ color: col, fontSize: 7 }}>{lbl}</span>
          <input
            type="range" min={min} max={max} step={step}
            value={params[k] ?? (k === 'ratio' ? 1 : 0)}
            onChange={(e) => onChange(k, Number(e.target.value))}
            className="flex-1" style={{ height: 3, accentColor: col }}
          />
          <span className="font-mono w-8 text-right text-studio-dim shrink-0" style={{ fontSize: 7 }}>
            {fmt(params[k] ?? (k === 'ratio' ? 1 : 0))}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Insert Slot ───────────────────────────────────────────────────── */
function InsertSlot({ insert, onUpdate, onRemove }) {
  const [exp, setExp] = useState(false)
  const active = !insert.bypass
  return (
    <div className={`rounded border transition-all ${active ? 'border-studio-border/50' : 'border-studio-border/20 opacity-50'}`}>
      <div className="flex items-center gap-1 px-1 py-0.5">
        <button
          onClick={() => onUpdate({ bypass: !insert.bypass })}
          className="w-2 h-2 rounded-full flex-shrink-0 transition-all"
          style={{ background: active ? '#00ff9d' : '#2a2a40', boxShadow: active ? '0 0 4px #00ff9d88' : 'none' }}
          title={active ? 'Click to bypass' : 'Click to enable'}
        />
        <span className="flex-1 font-mono text-studio-dim truncate" style={{ fontSize: 9 }}>
          {INSERT_ICONS[insert.type] || '●'} {insert.type}
        </span>
        <button onClick={() => setExp((v) => !v)} className="text-studio-muted hover:text-white transition-colors px-0.5" style={{ fontSize: 8 }}>
          {exp ? '▴' : '▾'}
        </button>
        <button onClick={onRemove} className="text-studio-muted hover:text-studio-red transition-colors" style={{ fontSize: 10, lineHeight: 1 }}>×</button>
      </div>
      {exp && (
        <InsertParams
          type={insert.type}
          params={insert.params}
          onChange={(k, v) => onUpdate({ params: { ...insert.params, [k]: v } })}
        />
      )}
    </div>
  )
}

/* ── Channel Strip ─────────────────────────────────────────────────── */
function ChannelStrip({ channel, tracks, isPlaying }) {
  const {
    setChannelVolume, setChannelPan, toggleChannelMute, toggleChannelSolo,
    setChannelSend, addChannelInsert, removeChannelInsert, updateChannelInsert,
    setChannelTrackRoute,
  } = useStudioStore()

  const [showRoute,  setShowRoute]  = useState(false)
  const [showFx,     setShowFx]     = useState(false)
  const [addFxOpen,  setAddFxOpen]  = useState(false)

  const isBus    = !!channel.isBus
  const isMaster = channel.id === 'master'
  const inserts  = channel.inserts || []
  const sends    = channel.sends   || { reverb: 0, delay: 0 }

  const routedTrack = tracks.find((t) => t.id === channel.trackId)

  // EQ curve values — driven by first active EQ3 insert, else flat
  const eq3   = inserts.find((i) => i.type === 'EQ3' && !i.bypass)
  const eqVals = eq3 ? eq3.params : { low: 0, mid: 0, high: 0 }

  return (
    <div
      className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${
        channel.muted
          ? 'border-studio-border opacity-40'
          : isMaster
          ? 'border-studio-yellow/30 bg-studio-surface/50'
          : isBus
          ? 'border-studio-border/40 bg-studio-surface/15'
          : 'border-studio-border bg-studio-surface/30 hover:border-studio-muted'
      }`}
      style={{ minWidth: 86 }}
    >

      {/* ── Track routing badge (regular channels only) ─────── */}
      {!isBus && !isMaster && (
        <div className="relative w-full">
          <button
            onClick={() => setShowRoute((v) => !v)}
            className="w-full flex items-center gap-1 px-1 py-0.5 rounded bg-studio-void border border-studio-border hover:border-studio-muted transition-colors"
            style={{ fontSize: 8 }}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: routedTrack?.color || '#333355' }} />
            <span className="flex-1 text-studio-dim font-mono truncate">{routedTrack?.name || '— none —'}</span>
            <span className="text-studio-muted">▾</span>
          </button>
          {showRoute && (
            <div className="absolute top-full left-0 z-30 mt-0.5 bg-studio-panel border border-studio-border rounded shadow-lg overflow-hidden" style={{ minWidth: 120 }}>
              <button
                onClick={() => { setChannelTrackRoute(channel.id, null); setShowRoute(false) }}
                className="w-full text-left px-2 py-1 text-xs font-mono text-studio-dim hover:bg-studio-surface transition-colors"
              >— none —</button>
              {tracks.map((t) => (
                <button key={t.id}
                  onClick={() => { setChannelTrackRoute(channel.id, t.id); setShowRoute(false) }}
                  className={`w-full text-left px-2 py-1 text-xs font-mono flex items-center gap-2 hover:bg-studio-surface transition-colors ${
                    channel.trackId === t.id ? 'text-studio-text' : 'text-studio-dim'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                  {t.name}
                  {channel.trackId === t.id && <span className="ml-auto text-studio-green">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Channel name ─────────────────────────────────────── */}
      <div className="text-center">
        {isBus && <div className="text-studio-muted font-mono" style={{ fontSize: 7, letterSpacing: 1 }}>BUS RETURN</div>}
        {isMaster && <div className="text-studio-yellow font-mono" style={{ fontSize: 7, letterSpacing: 1 }}>MASTER</div>}
        <div className="text-xs font-ui font-semibold tracking-wide" style={{ color: channel.color }}>{channel.name}</div>
      </div>

      {/* ── EQ curve + FX toggle button ──────────────────────── */}
      <div className="w-full">
        <button
          onClick={() => setShowFx((v) => !v)}
          className="w-full h-8 bg-studio-void rounded border overflow-hidden transition-colors"
          style={{ borderColor: showFx ? channel.color + '66' : '#252540' }}
          title={showFx ? 'Hide FX chain' : 'Show FX chain'}
        >
          <svg className="w-full h-full" viewBox="0 0 60 24" preserveAspectRatio="none">
            <path
              d={`M0,${18 - eqVals.low * 0.2} Q15,${14 - eqVals.low * 0.3} 20,${14 - eqVals.mid * 0.25} Q30,${8 - eqVals.mid * 0.3 + (channel.pan / 20)} 40,${12 - eqVals.high * 0.2} Q50,${14 - eqVals.high * 0.3} 60,${10 - eqVals.high * 0.25}`}
              stroke={channel.color} strokeWidth="1.5" fill="none" opacity="0.8"
            />
            <path
              d={`M0,${18 - eqVals.low * 0.2} Q15,${14 - eqVals.low * 0.3} 20,${14 - eqVals.mid * 0.25} Q30,${8 - eqVals.mid * 0.3 + (channel.pan / 20)} 40,${12 - eqVals.high * 0.2} Q50,${14 - eqVals.high * 0.3} 60,${10 - eqVals.high * 0.25} L60,24 L0,24 Z`}
              fill={channel.color} opacity="0.1"
            />
          </svg>
        </button>

        {/* Insert activity dots */}
        {inserts.length > 0 && !showFx && (
          <div className="flex items-center justify-center gap-0.5 mt-0.5">
            {inserts.slice(0, 5).map((ins) => (
              <div key={ins.id} className="w-1.5 h-1.5 rounded-full"
                style={{ background: ins.bypass ? '#252545' : '#00ff9d', boxShadow: ins.bypass ? 'none' : '0 0 3px #00ff9d' }}
              />
            ))}
            {inserts.length > 5 && <span className="text-studio-muted" style={{ fontSize: 7 }}>+{inserts.length - 5}</span>}
          </div>
        )}
      </div>

      {/* ── FX insert chain ──────────────────────────────────── */}
      {showFx && (
        <div className="w-full bg-studio-void/50 rounded border border-studio-border/40 p-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-studio-dim font-mono" style={{ fontSize: 7 }}>INSERTS ({inserts.length})</span>
            <div className="relative">
              <button
                onClick={() => setAddFxOpen((v) => !v)}
                className="w-4 h-4 rounded bg-studio-surface border border-studio-border text-studio-dim hover:text-studio-green hover:border-studio-green transition-colors flex items-center justify-center text-xs"
              >+</button>
              {addFxOpen && (
                <div className="absolute right-0 top-full mt-0.5 z-30 bg-studio-panel border border-studio-border rounded shadow-lg overflow-hidden" style={{ minWidth: 110 }}>
                  {INSERT_TYPES.map((type) => (
                    <button key={type}
                      onClick={() => { addChannelInsert(channel.id, type); setAddFxOpen(false) }}
                      className="w-full text-left px-2 py-1 font-mono text-studio-dim hover:bg-studio-surface hover:text-white transition-colors"
                      style={{ fontSize: 9 }}
                    >
                      <span className="mr-1">{INSERT_ICONS[type]}</span>{type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {inserts.length === 0
            ? <span className="text-studio-muted font-mono text-center py-1" style={{ fontSize: 8 }}>no inserts — click + to add</span>
            : inserts.map((ins) => (
                <InsertSlot
                  key={ins.id}
                  insert={ins}
                  onUpdate={(changes) => updateChannelInsert(channel.id, ins.id, changes)}
                  onRemove={() => removeChannelInsert(channel.id, ins.id)}
                />
              ))
          }
        </div>
      )}

      {/* ── VU meters ────────────────────────────────────────── */}
      <div className="flex gap-0.5">
        <VUMeter active={isPlaying && !channel.muted} />
        <VUMeter active={isPlaying && !channel.muted} />
      </div>

      {/* ── Volume fader ─────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-1 w-full" style={{ height: 100 }}>
        <input
          type="range" className="vertical" min="0" max="100"
          value={channel.volume}
          onChange={(e) => setChannelVolume(channel.id, Number(e.target.value))}
          style={{ height: 90, width: 4 }}
        />
        <span className="font-mono text-xs text-studio-dim">{channel.volume}</span>
      </div>

      {/* ── Send knobs (regular channels only) ───────────────── */}
      {!isBus && !isMaster && (
        <div className="w-full flex flex-col gap-0.5 px-0.5">
          <div className="flex items-center gap-1">
            <span className="font-mono shrink-0" style={{ fontSize: 7, color: '#b44fff', width: 14 }}>REV</span>
            <input
              type="range" min="0" max="100"
              value={sends.reverb}
              onChange={(e) => setChannelSend(channel.id, 'reverb', Number(e.target.value))}
              className="flex-1" style={{ height: 3, accentColor: '#b44fff' }}
            />
            <span className="font-mono text-studio-muted shrink-0" style={{ fontSize: 7, width: 14, textAlign: 'right' }}>{sends.reverb}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono shrink-0" style={{ fontSize: 7, color: '#ffe600', width: 14 }}>DLY</span>
            <input
              type="range" min="0" max="100"
              value={sends.delay}
              onChange={(e) => setChannelSend(channel.id, 'delay', Number(e.target.value))}
              className="flex-1" style={{ height: 3, accentColor: '#ffe600' }}
            />
            <span className="font-mono text-studio-muted shrink-0" style={{ fontSize: 7, width: 14, textAlign: 'right' }}>{sends.delay}</span>
          </div>
        </div>
      )}

      {/* ── Pan ──────────────────────────────────────────────── */}
      <PanKnob value={channel.pan} onChange={(v) => setChannelPan(channel.id, v)} />
      <span className="font-mono text-xs text-studio-dim">
        {channel.pan === 0 ? 'C' : channel.pan > 0 ? `R${channel.pan}` : `L${Math.abs(channel.pan)}`}
      </span>

      {/* ── Mute / Solo ──────────────────────────────────────── */}
      <div className="flex gap-1">
        <button
          onClick={() => toggleChannelMute(channel.id)}
          className={`w-7 h-5 rounded text-xs font-bold transition-colors ${
            channel.muted
              ? 'bg-studio-orange text-black shadow-[0_0_6px_rgba(255,149,0,0.5)]'
              : 'bg-studio-void text-studio-dim border border-studio-border hover:text-studio-orange'
          }`}
        >M</button>
        {!isBus && (
          <button
            onClick={() => toggleChannelSolo(channel.id)}
            className={`w-7 h-5 rounded text-xs font-bold transition-colors ${
              channel.solo
                ? 'bg-studio-yellow text-black shadow-[0_0_6px_rgba(255,230,0,0.5)]'
                : 'bg-studio-void text-studio-dim border border-studio-border hover:text-studio-yellow'
            }`}
          >S</button>
        )}
      </div>
    </div>
  )
}

/* ── Main View ─────────────────────────────────────────────────────── */
export default function MixerView() {
  const { mixerChannels, isPlaying, tracks } = useStudioStore()

  const regular = mixerChannels.filter((c) => !c.isBus && c.id !== 'master')
  const buses   = mixerChannels.filter((c) => c.isBus)
  const master  = mixerChannels.find((c) => c.id === 'master')

  // Total active inserts across all channels
  const totalInserts = mixerChannels.reduce((acc, c) => acc + (c.inserts || []).filter((i) => !i.bypass).length, 0)
  const totalSends   = regular.reduce((acc, c) => acc + (c.sends?.reverb > 0 ? 1 : 0) + (c.sends?.delay > 0 ? 1 : 0), 0)

  return (
    <div className="flex flex-col h-full bg-studio-void">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border">
        <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Mixer</span>
        <span className="text-studio-dim text-xs font-mono">{regular.length} ch</span>
        {buses.length > 0 && <span className="text-studio-dim text-xs font-mono">· {buses.length} bus</span>}
        {totalInserts > 0 && (
          <span className="flex items-center gap-1 text-xs font-mono" style={{ color: '#00ff9d' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" style={{ boxShadow: '0 0 3px #00ff9d' }} />
            {totalInserts} insert{totalInserts !== 1 ? 's' : ''}
          </span>
        )}
        {totalSends > 0 && (
          <span className="text-studio-dim text-xs font-mono">{totalSends} active send{totalSends !== 1 ? 's' : ''}</span>
        )}

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-studio-muted text-xs font-mono">Click EQ curve → show FX chain</span>
          <span className="text-studio-muted text-xs font-mono">·</span>
          <span className="text-studio-muted text-xs font-mono">REV/DLY = send to bus</span>
        </div>
      </div>

      {/* Channel strips */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex items-end gap-2 px-4 py-4 h-full min-w-max">

          {/* Regular input channels */}
          {regular.map((ch) => (
            <ChannelStrip key={ch.id} channel={ch} tracks={tracks} isPlaying={isPlaying} />
          ))}

          {/* Divider + send bus label */}
          {buses.length > 0 && (
            <div className="flex flex-col items-center self-stretch justify-center gap-1 mx-1">
              <div className="flex-1 w-px bg-studio-border" />
              <span className="text-studio-muted font-mono tracking-widest"
                style={{ fontSize: 7, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >SEND BUS</span>
              <div className="flex-1 w-px bg-studio-border" />
            </div>
          )}

          {/* FX bus returns */}
          {buses.map((ch) => (
            <ChannelStrip key={ch.id} channel={ch} tracks={tracks} isPlaying={isPlaying} />
          ))}

          {/* Divider before master */}
          <div className="w-px h-48 bg-studio-border mx-2 self-center" />

          {/* Master */}
          {master && <ChannelStrip channel={master} tracks={tracks} isPlaying={isPlaying} />}
        </div>
      </div>
    </div>
  )
}
