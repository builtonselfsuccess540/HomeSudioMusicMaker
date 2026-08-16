import React, { useState, useEffect, useCallback } from 'react'
import {
  masterFX, onFXChange,
  setReverbEnabled,     setReverbWet,
  setDelayEnabled,      setDelayParam,
  setCompressorEnabled, setCompressorParam,
  setDistortionEnabled, setDistortionParam,
  setEQEnabled,         setEQBand,
} from '../../audio/audioEngine'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron

// ─── Shared UI atoms ──────────────────────────────────────────────────

function ParamRow({ label, value, min, max, step = 0.01, format, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-studio-muted uppercase shrink-0 text-right" style={{ fontSize: 9, width: 64 }}>
        {label}
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-studio-cyan"
      />
      <span className="font-mono text-studio-cyan shrink-0 text-right" style={{ fontSize: 9, minWidth: 38 }}>
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  )
}

function FXUnit({ title, icon, color, enabled, onToggle, children }) {
  return (
    <div
      className="rounded-xl border transition-all overflow-hidden"
      style={{
        borderColor:  enabled ? color + '55' : '#1e1e35',
        background:   enabled ? '#0a0a1c' : '#07070f',
        boxShadow:    enabled ? `0 0 24px ${color}12` : 'none',
      }}
    >
      {/* Header — click anywhere on it to toggle */}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-studio-border text-left select-none"
        style={{ background: enabled ? '#0d0d22' : '#090914' }}
        onClick={onToggle}
      >
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span className={`font-mono font-semibold text-sm ${enabled ? 'text-white' : 'text-studio-dim'}`}>
          {title}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full transition-all"
            style={{ background: enabled ? color : '#1e1e38', boxShadow: enabled ? `0 0 6px ${color}` : 'none' }}
          />
          <span className={`font-mono text-xs ${enabled ? 'text-studio-cyan' : 'text-studio-muted'}`}>
            {enabled ? 'ON' : 'OFF'}
          </span>
        </div>
      </button>

      {/* Body */}
      <div className={`px-4 py-3 flex flex-col gap-2.5 transition-opacity ${enabled ? 'opacity-100' : 'opacity-25 pointer-events-none'}`}>
        {children}
      </div>
    </div>
  )
}

// ─── Master FX panel ─────────────────────────────────────────────────

function MasterFXPanel({ fx }) {
  return (
    <div className="max-w-2xl flex flex-col gap-3">
      <div className="flex items-center gap-3 mb-1">
        <span className="font-display text-sm font-semibold text-studio-text tracking-wider">Master Effects Chain</span>
        <span className="font-mono text-xs text-studio-muted">— applied to all instruments</span>
      </div>

      {/* EQ */}
      <FXUnit title="3-Band EQ" icon="〜" color="#ffe600" enabled={fx.eq.enabled} onToggle={() => setEQEnabled(!fx.eq.enabled)}>
        <ParamRow label="LOW shelf" value={fx.eq.low}  min={-12} max={12} step={0.5}
          format={v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB'}
          onChange={v => setEQBand('low', v)} />
        <ParamRow label="MID peak" value={fx.eq.mid}  min={-12} max={12} step={0.5}
          format={v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB'}
          onChange={v => setEQBand('mid', v)} />
        <ParamRow label="HIGH shelf" value={fx.eq.high} min={-12} max={12} step={0.5}
          format={v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB'}
          onChange={v => setEQBand('high', v)} />
      </FXUnit>

      {/* Compressor */}
      <FXUnit title="Compressor" icon="⬛" color="#00ff9d" enabled={fx.compressor.enabled} onToggle={() => setCompressorEnabled(!fx.compressor.enabled)}>
        <ParamRow label="Threshold" value={fx.compressor.threshold} min={-60} max={0} step={1}
          format={v => v.toFixed(0) + ' dBFS'}
          onChange={v => setCompressorParam('threshold', v)} />
        <ParamRow label="Ratio" value={fx.compressor.ratio} min={1} max={20} step={0.5}
          format={v => v.toFixed(1) + ':1'}
          onChange={v => setCompressorParam('ratio', v)} />
      </FXUnit>

      {/* Reverb */}
      <FXUnit title="Reverb" icon="◎" color="#b44fff" enabled={fx.reverb.enabled} onToggle={() => setReverbEnabled(!fx.reverb.enabled)}>
        <ParamRow label="Wet" value={fx.reverb.wet} min={0} max={1} step={0.01}
          format={v => Math.round(v * 100) + '%'}
          onChange={v => setReverbWet(v)} />
        <p className="font-mono text-studio-muted" style={{ fontSize: 8 }}>
          Room size and tone are fixed at a lush 2.5s hall. Wet controls the blend.
        </p>
      </FXUnit>

      {/* Delay */}
      <FXUnit title="Delay" icon="◁" color="#00e5ff" enabled={fx.delay.enabled} onToggle={() => setDelayEnabled(!fx.delay.enabled)}>
        <ParamRow label="Time" value={fx.delay.time} min={0.05} max={1.0} step={0.005}
          format={v => (v * 1000).toFixed(0) + ' ms'}
          onChange={v => setDelayParam('time', v)} />
        <ParamRow label="Feedback" value={fx.delay.feedback} min={0} max={0.92} step={0.01}
          format={v => Math.round(v * 100) + '%'}
          onChange={v => setDelayParam('feedback', v)} />
        <ParamRow label="Wet" value={fx.delay.wet} min={0} max={1} step={0.01}
          format={v => Math.round(v * 100) + '%'}
          onChange={v => setDelayParam('wet', v)} />
      </FXUnit>

      {/* Distortion */}
      <FXUnit title="Distortion" icon="▲" color="#ff2d55" enabled={fx.distortion.enabled} onToggle={() => setDistortionEnabled(!fx.distortion.enabled)}>
        <ParamRow label="Drive" value={fx.distortion.drive} min={1} max={400} step={1}
          format={v => v.toFixed(0)}
          onChange={v => setDistortionParam('drive', v)} />
        <ParamRow label="Wet" value={fx.distortion.wet} min={0} max={1} step={0.01}
          format={v => Math.round(v * 100) + '%'}
          onChange={v => setDistortionParam('wet', v)} />
      </FXUnit>
    </div>
  )
}

// ─── VST Library panel ───────────────────────────────────────────────

function VSTPanel({ vstList, scanning, onScan, onBrowse }) {
  if (!IS_ELECTRON) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center max-w-md mx-auto py-16">
        <div className="text-5xl opacity-30">🖥</div>
        <div className="font-display text-lg font-semibold text-studio-text">Desktop App Required</div>
        <p className="font-ui text-sm text-studio-dim leading-relaxed">
          VST plugin scanning requires the desktop version of Home Studio Music Maker.
          Run <code className="font-mono bg-studio-surface px-1 rounded text-studio-cyan">npm run dev:electron</code> to
          launch the desktop app, or build an installer with{' '}
          <code className="font-mono bg-studio-surface px-1 rounded text-studio-cyan">npm run build:electron</code>.
        </p>
        <p className="font-mono text-xs text-studio-muted">
          The Master FX tab works in both browser and desktop.
        </p>
      </div>
    )
  }

  const total = vstList ? vstList.vst2.length + vstList.vst3.length : 0

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-display text-sm font-semibold text-studio-text tracking-wider">VST Plugin Library</span>
        {vstList && (
          <span className="font-mono text-xs text-studio-dim">
            {vstList.vst2.length} VST2 · {vstList.vst3.length} VST3 found
          </span>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={onBrowse}
            className="px-3 py-1 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors"
          >📁 Browse Folder</button>
          <button
            onClick={onScan}
            disabled={scanning}
            className={`px-3 py-1 rounded text-xs font-ui font-semibold border transition-colors ${
              scanning
                ? 'border-studio-cyan/40 text-studio-cyan animate-pulse'
                : 'border-studio-cyan text-studio-cyan hover:bg-studio-cyan/10'
            }`}
          >{scanning ? '⟳ Scanning…' : '⟳ Rescan'}</button>
        </div>
      </div>

      {/* Native bridge status */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-studio-orange/30 bg-studio-orange/5">
        <span className="text-studio-orange mt-0.5">⚠</span>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs font-semibold text-studio-orange">Native Bridge Not Installed</span>
          <p className="font-ui text-xs text-studio-dim leading-relaxed">
            Home Studio Music Maker can <strong>find</strong> your installed VSTs, but routing audio
            <em> through</em> them requires a native C++ bridge that isn't included yet. Your VSTs are shown
            below for reference. Use the <strong>Master FX</strong> tab for working built-in effects right now.
          </p>
          <p className="font-mono text-xs text-studio-muted mt-0.5">
            Tip: You can still use your VSTs in your regular DAW (FL Studio, Reaper, etc.) and
            play notes into them from HSMM via a virtual MIDI cable.
          </p>
        </div>
      </div>

      {/* Not scanned yet */}
      {vstList === null && !scanning && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="text-4xl opacity-20">🔌</div>
          <p className="font-ui text-sm text-studio-dim">Click Rescan to search your system for VST plugins.</p>
        </div>
      )}

      {/* Scanning */}
      {scanning && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-studio-cyan/30 border-t-studio-cyan animate-spin" />
          <p className="font-mono text-xs text-studio-dim">Scanning standard VST directories…</p>
        </div>
      )}

      {/* Results */}
      {vstList && !scanning && (
        <>
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <div className="text-4xl opacity-20">🔍</div>
              <p className="font-ui text-sm text-studio-dim">No VST plugins found in standard directories.</p>
              <p className="font-mono text-xs text-studio-muted">Try Browse Folder to point to a custom VST path.</p>
            </div>
          ) : (
            ['VST3', 'VST2'].map((type) => {
              const list = type === 'VST3' ? vstList.vst3 : vstList.vst2
              if (list.length === 0) return null
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="px-2 py-0.5 rounded font-mono text-xs font-semibold"
                      style={{
                        background: type === 'VST3' ? '#00e5ff18' : '#b44fff18',
                        color:      type === 'VST3' ? '#00e5ff'   : '#b44fff',
                        border:     `1px solid ${type === 'VST3' ? '#00e5ff40' : '#b44fff40'}`,
                      }}
                    >{type}</div>
                    <span className="font-mono text-xs text-studio-muted">{list.length} plugin{list.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {list.map((plugin, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-studio-border bg-studio-panel hover:bg-studio-surface transition-colors group"
                      >
                        <div
                          className="w-1.5 h-8 rounded-full shrink-0"
                          style={{ background: type === 'VST3' ? '#00e5ff33' : '#b44fff33' }}
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="font-ui text-sm font-semibold text-studio-text truncate">{plugin.name}</span>
                          <span className="font-mono text-studio-muted truncate" style={{ fontSize: 9 }}>{plugin.dir}</span>
                        </div>
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded font-mono text-xs opacity-0 group-hover:opacity-100 transition-opacity text-studio-muted border border-studio-border"
                          title="VST audio processing requires native bridge"
                        >bridge req.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────────

export default function PluginsView() {
  const [tab, setTab] = useState('fx')
  const [fx, setFX] = useState({
    reverb:     { ...masterFX.reverb },
    delay:      { ...masterFX.delay },
    compressor: { ...masterFX.compressor },
    distortion: { ...masterFX.distortion },
    eq:         { ...masterFX.eq },
  })
  const [vstList,  setVstList]  = useState(null)
  const [scanning, setScanning] = useState(false)

  // Subscribe to FX state changes from the audio engine
  useEffect(() => onFXChange(setFX), [])

  const doScan = useCallback(async () => {
    if (!IS_ELECTRON) return
    setScanning(true)
    try {
      const result = await window.electron.vst.scan()
      setVstList(result)
    } catch { setVstList({ vst2: [], vst3: [] }) }
    setScanning(false)
  }, [])

  const doBrowse = useCallback(async () => {
    if (!IS_ELECTRON) return
    const result = await window.electron.vst.browseDir()
    if (!result) return
    setVstList((prev) => {
      const existing = prev || { vst2: [], vst3: [] }
      const newVST2 = result.plugins.filter(p => p.type === 'VST2')
      const newVST3 = result.plugins.filter(p => p.type === 'VST3')
      // Merge, deduplicate by file path
      const merge = (arr, newArr) => {
        const seen = new Set(arr.map(p => p.file))
        return [...arr, ...newArr.filter(p => !seen.has(p.file))]
      }
      return { vst2: merge(existing.vst2, newVST2), vst3: merge(existing.vst3, newVST3) }
    })
  }, [])

  // Auto-scan when VST tab opens
  useEffect(() => {
    if (tab === 'vst' && vstList === null && IS_ELECTRON) doScan()
  }, [tab])

  // Listen for Audio menu → Rescan
  useEffect(() => {
    if (!IS_ELECTRON) return
    return window.electron.vst.onRescan(doScan)
  }, [doScan])

  const TABS = [
    { id: 'fx',  label: 'Master FX',   icon: '⚙' },
    { id: 'vst', label: 'VST Library', icon: '🔌' },
  ]

  return (
    <div className="flex h-full bg-studio-void">
      {/* Sidebar */}
      <div className="w-44 bg-studio-panel border-r border-studio-border flex flex-col shrink-0">
        <div className="px-3 py-2 border-b border-studio-border">
          <span className="font-mono text-xs text-studio-muted uppercase tracking-widest">Plugins</span>
        </div>
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-ui transition-colors border-b border-studio-border/40 ${
              tab === id
                ? 'bg-studio-surface text-studio-text border-r-2 border-studio-cyan'
                : 'text-studio-dim hover:text-studio-text hover:bg-studio-surface/40'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {tab === id && id === 'fx' && (
              <span className="ml-auto font-mono text-studio-cyan" style={{ fontSize: 8 }}>
                {[fx.eq, fx.compressor, fx.reverb, fx.delay, fx.distortion].filter(e => e.enabled).length} on
              </span>
            )}
          </button>
        ))}

        {/* Info box */}
        <div className="mt-auto px-3 py-3 border-t border-studio-border">
          {IS_ELECTRON ? (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-studio-green" style={{ boxShadow: '0 0 4px #00ff9d' }} />
              <span className="font-mono text-studio-green" style={{ fontSize: 8 }}>Desktop app</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-studio-muted" />
              <span className="font-mono text-studio-muted" style={{ fontSize: 8 }}>Browser mode</span>
            </div>
          )}
          <p className="font-mono text-studio-muted mt-1" style={{ fontSize: 7, lineHeight: 1.5 }}>
            {IS_ELECTRON ? 'VST scanning available' : 'Run dev:electron for VST scanning'}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-5">
        {tab === 'fx'  && <MasterFXPanel fx={fx} />}
        {tab === 'vst' && <VSTPanel vstList={vstList} scanning={scanning} onScan={doScan} onBrowse={doBrowse} />}
      </div>
    </div>
  )
}
