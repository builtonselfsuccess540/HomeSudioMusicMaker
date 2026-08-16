import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useStudioStore } from '../../store/useStudioStore'
import { useAudio } from '../../hooks/useAudio'
import { getCtx, detectBpm } from '../../audio/audioEngine'
import { onAuthChange } from '../../firebase/firebaseAuth'
import AuthModal from '../Auth/AuthModal'

function WaveformDisplay({ data, color = '#00e5ff' }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.shadowColor = color
    ctx.shadowBlur = 4
    ctx.beginPath()
    const slice = w / data.length
    for (let i = 0; i < data.length; i++) {
      const x = i * slice
      const y = (1 - (data[i] + 1) / 2) * h
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }, [data, color])
  return <canvas ref={canvasRef} width={120} height={28} className="rounded" style={{ background: 'rgba(0,0,0,0.3)' }} />
}

export default function Transport() {
  const {
    isPlaying, isRecording, bpm, timeSignature, masterVolume,
    setPlaying, setRecording, setBpm, setTimeSignature, setMasterVolume,
  } = useStudioStore()

  const { startRecording, stopRecording, recordingError, waveformData } = useAudio()

  const intervalRef     = useRef(null)
  const beatRef         = useRef(0)
  const tapsRef         = useRef([])
  const tapTimeoutRef   = useRef(null)
  const [tapCount,   setTapCount]   = useState(0)
  const [countIn,    setCountIn]    = useState(false)
  const [countDown,  setCountDown]  = useState(null)
  const countTimerRef = useRef(null)
  const [authUser, setAuthUser]   = useState(null)
  const [showAuth, setShowAuth]   = useState(false)
  useEffect(() => onAuthChange(setAuthUser), [])

  // ── Metronome ────────────────────────────────────────────────────────────
  const [metronomeOn, setMetronomeOn] = useState(false)
  const metroNextRef  = useRef(0)
  const metroBeatRef  = useRef(0)
  const metroTimerRef = useRef(null)
  const bpmRef        = useRef(bpm)
  const timeSigRef    = useRef(timeSignature)

  // Keep refs in sync with latest state so the metronome closure always sees fresh values
  useEffect(() => { bpmRef.current = bpm }, [bpm])
  useEffect(() => { timeSigRef.current = timeSignature }, [timeSignature])

  const playMetroClick = useCallback((time, isAccent) => {
    const c = getCtx()
    const osc  = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination) // bypass master FX for clean click
    osc.frequency.value = isAccent ? 1400 : 880
    const vol = isAccent ? 0.55 : 0.35
    gain.gain.setValueAtTime(vol, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04)
    osc.start(time)
    osc.stop(time + 0.04)
  }, [])

  // Parse beats-per-bar from time signature string
  const beatsPerBar = () => {
    const ts = timeSigRef.current
    const top = parseInt(ts.split('/')[0], 10)
    return isNaN(top) ? 4 : top
  }

  useEffect(() => {
    if (!metronomeOn) {
      clearTimeout(metroTimerRef.current)
      return
    }
    const c = getCtx()
    metroNextRef.current = c.currentTime + 0.05
    metroBeatRef.current = 0

    const LOOKAHEAD = 0.12
    const INTERVAL  = 25

    const tick = () => {
      const now     = c.currentTime
      const beatSec = 60 / bpmRef.current
      while (metroNextRef.current < now + LOOKAHEAD) {
        const isAccent = metroBeatRef.current === 0
        playMetroClick(metroNextRef.current, isAccent)
        metroBeatRef.current = (metroBeatRef.current + 1) % beatsPerBar()
        metroNextRef.current += beatSec
      }
      metroTimerRef.current = setTimeout(tick, INTERVAL)
    }
    tick()
    return () => clearTimeout(metroTimerRef.current)
  }, [metronomeOn, playMetroClick])

  // ── BPM detect from file ─────────────────────────────────────────────────
  const detectFileRef = useRef(null)
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState(null)

  const handleDetectFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDetecting(true)
    setDetectResult(null)
    try {
      const detected = await detectBpm(file)
      setDetectResult(detected)
      setBpm(detected)
    } catch {
      setDetectResult('err')
    } finally {
      setDetecting(false)
      e.target.value = ''
    }
  }

  // ── Tap tempo ────────────────────────────────────────────────────────────
  const handleTap = () => {
    const now = Date.now()
    clearTimeout(tapTimeoutRef.current)
    const taps = [...tapsRef.current, now].slice(-8)
    tapsRef.current = taps
    setTapCount(taps.length)
    if (taps.length >= 2) {
      const intervals = []
      for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1])
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const newBpm = Math.round(60000 / avg)
      if (newBpm >= 40 && newBpm <= 300) setBpm(newBpm)
    }
    tapTimeoutRef.current = setTimeout(() => { tapsRef.current = []; setTapCount(0) }, 2000)
  }

  // ── Visual beat indicator ─────────────────────────────────────────────────
  const [beatDot, setBeatDot] = useState(0)
  useEffect(() => {
    if (isPlaying) {
      const ms = (60 / bpm) * 1000
      intervalRef.current = setInterval(() => {
        setBeatDot(p => (p + 1) % 4)
      }, ms)
    } else {
      clearInterval(intervalRef.current)
      setBeatDot(0)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, bpm])

  const handleRecord = async () => {
    if (isRecording || countDown !== null) {
      clearTimeout(countTimerRef.current)
      setCountDown(null)
      stopRecording()
      setRecording(false)
      return
    }
    if (countIn) {
      const beatMs = (60 / bpm) * 1000
      const c = getCtx()
      let beat = 4
      const tick = async () => {
        setCountDown(beat)
        playMetroClick(c.currentTime + 0.02, beat === 4)
        beat--
        if (beat === 0) {
          setCountDown(null)
          await startRecording()
          setRecording(true)
          setPlaying(true)
        } else {
          countTimerRef.current = setTimeout(tick, beatMs)
        }
      }
      tick()
    } else {
      await startRecording()
      setRecording(true)
      setPlaying(true)
    }
  }

  const handleStop = () => {
    setPlaying(false)
    setRecording(false)
    stopRecording()
  }

  return (
    <div className="flex items-center gap-4 bg-studio-panel border-b border-studio-border px-4 py-2 select-none">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded bg-gradient-to-br from-studio-cyan to-studio-purple flex items-center justify-center shadow-cyan">
          <span className="text-black font-display font-bold text-xs">HS</span>
        </div>
        <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">
          Home Studio
        </span>
      </div>

      <div className="w-px h-8 bg-studio-border" />

      {/* Transport buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleStop}
          className="w-8 h-8 rounded flex items-center justify-center bg-studio-surface hover:bg-studio-muted border border-studio-border transition-colors"
          title="Stop / Return to Start"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
            <rect x="0" y="1" width="2" height="10"/>
            <polygon points="10,1 2,6 10,11"/>
          </svg>
        </button>

        <button
          onClick={() => setPlaying(!isPlaying)}
          className={`w-10 h-8 rounded flex items-center justify-center border transition-all ${
            isPlaying
              ? 'bg-studio-cyan border-studio-cyan shadow-cyan text-black'
              : 'bg-studio-surface hover:bg-studio-muted border-studio-border text-white'
          }`}
          title="Play / Pause"
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="4" height="10"/>
              <rect x="7" y="1" width="4" height="10"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="2,1 10,6 2,11"/>
            </svg>
          )}
        </button>

        <button
          onClick={handleRecord}
          className={`w-8 h-8 rounded flex items-center justify-center border transition-all ${
            isRecording || countDown !== null
              ? 'bg-studio-red border-studio-red shadow-red rec-blink'
              : 'bg-studio-surface hover:bg-studio-muted border-studio-border'
          }`}
          title="Record"
        >
          <div className={`w-3 h-3 rounded-full ${isRecording || countDown !== null ? 'bg-white' : 'bg-studio-red'}`} />
        </button>

        {/* Count-in toggle */}
        <button
          onClick={() => setCountIn(v => !v)}
          className={`w-8 h-8 rounded border text-xs font-bold transition-all flex items-center justify-center ${
            countIn
              ? 'bg-orange-500/20 border-orange-500 text-orange-400'
              : 'bg-studio-surface border-studio-border text-studio-dim hover:border-orange-400 hover:text-orange-400'
          }`}
          title={countIn ? 'Count-In ON — 4 beats before recording starts' : 'Count-In OFF — click to enable'}
        >
          {countDown !== null
            ? <span className="text-orange-300 font-bold" style={{ fontSize: 15 }}>{countDown}</span>
            : <span style={{ fontSize: 10 }}>4↵</span>
          }
        </button>
      </div>

      <div className="w-px h-8 bg-studio-border" />

      {/* Metronome toggle */}
      <button
        onClick={() => setMetronomeOn(v => !v)}
        title={metronomeOn ? 'Metronome ON — click to turn off' : 'Metronome OFF — click to turn on'}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono font-semibold transition-all ${
          metronomeOn
            ? 'bg-studio-yellow border-studio-yellow text-black shadow-yellow'
            : 'bg-studio-surface border-studio-border text-studio-dim hover:border-studio-yellow hover:text-studio-yellow'
        }`}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>♩</span>
        {metronomeOn ? 'CLICK ON' : 'CLICK'}
      </button>

      <div className="w-px h-8 bg-studio-border" />

      {/* BPM */}
      <div className="flex items-center gap-2">
        <span className="text-studio-dim text-xs font-mono uppercase tracking-wider">BPM</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setBpm(Math.max(40, bpm - 1))}
            className="w-5 h-5 rounded bg-studio-surface hover:bg-studio-muted border border-studio-border text-studio-dim text-xs flex items-center justify-center"
          >−</button>
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-14 text-center bg-studio-void border border-studio-border rounded px-1 py-0.5 font-mono text-sm text-studio-cyan focus:outline-none focus:border-studio-cyan"
            min="40" max="300"
          />
          <button
            onClick={() => setBpm(Math.min(300, bpm + 1))}
            className="w-5 h-5 rounded bg-studio-surface hover:bg-studio-muted border border-studio-border text-studio-dim text-xs flex items-center justify-center"
          >+</button>

          {/* Tap tempo */}
          <button
            onClick={handleTap}
            className="px-2 py-0.5 rounded text-xs font-mono border border-studio-border bg-studio-surface text-studio-dim hover:border-studio-yellow hover:text-studio-yellow transition-colors select-none"
            title="Tap in rhythm to set BPM (3+ taps)"
          >
            {tapCount >= 2 ? `TAP(${tapCount})` : 'TAP'}
          </button>

          {/* Detect BPM from audio file */}
          <input
            ref={detectFileRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={handleDetectFile}
          />
          <button
            onClick={() => detectFileRef.current?.click()}
            disabled={detecting}
            title="Detect BPM from audio file"
            className="px-2 py-0.5 rounded text-xs font-mono border border-studio-border bg-studio-surface text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors select-none disabled:opacity-40"
          >
            {detecting ? 'DETECTING…' : detectResult && detectResult !== 'err' ? `✓ ${detectResult}` : 'DETECT'}
          </button>
        </div>
      </div>

      {/* Time Sig */}
      <div className="flex items-center gap-2">
        <span className="text-studio-dim text-xs font-mono uppercase tracking-wider">TIME</span>
        <select
          value={timeSignature}
          onChange={(e) => setTimeSignature(e.target.value)}
          className="bg-studio-void border border-studio-border rounded px-2 py-0.5 font-mono text-sm text-studio-text focus:outline-none focus:border-studio-cyan"
        >
          {['4/4', '3/4', '6/8', '2/4', '5/4', '7/8'].map((ts) => (
            <option key={ts} value={ts}>{ts}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-8 bg-studio-border" />

      {/* Beat indicator */}
      <div className="flex items-center gap-1">
        {[0,1,2,3].map((i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-75 ${
              isPlaying && beatDot === i
                ? 'bg-studio-cyan shadow-cyan scale-125'
                : metronomeOn && metroBeatRef.current === i
                ? 'bg-studio-yellow'
                : 'bg-studio-muted'
            }`}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* Master volume */}
      <div className="flex items-center gap-2">
        <span className="text-studio-dim text-xs font-mono uppercase tracking-wider">VOL</span>
        <input
          type="range"
          min="0" max="100"
          value={masterVolume}
          onChange={(e) => setMasterVolume(Number(e.target.value))}
          className="w-24"
        />
        <span className="text-studio-cyan font-mono text-xs w-8 text-right">{masterVolume}</span>
      </div>

      {isRecording && (
        <WaveformDisplay data={waveformData} color="#ff2d55" />
      )}

      {recordingError && (
        <span className="text-studio-red text-xs font-mono">{recordingError}</span>
      )}

      {/* Auth button */}
      <button
        onClick={() => setShowAuth(true)}
        title={authUser ? authUser.email : 'Sign in for cloud save'}
        className="flex items-center gap-1.5 px-2 py-1 rounded transition-all text-xs font-semibold"
        style={{
          background: authUser ? '#00e5ff15' : '#ffffff0a',
          color: authUser ? '#00e5ff' : '#8899aa',
          border: `1px solid ${authUser ? '#00e5ff33' : '#ffffff15'}`,
        }}
      >
        <span>{authUser
          ? (authUser.displayName || authUser.email || '?')[0].toUpperCase()
          : '○'
        }</span>
        {authUser
          ? <span className="max-w-20 truncate">{authUser.displayName || authUser.email?.split('@')[0]}</span>
          : <span>Sign In</span>
        }
      </button>

      {showAuth && <AuthModal user={authUser} onClose={() => setShowAuth(false)} />}
    </div>
  )
}
