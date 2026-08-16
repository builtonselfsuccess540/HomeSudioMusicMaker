import React, { useState, useRef, useEffect, useCallback } from 'react'
import { bufferToWavBlob } from '../../audio/audioEngine'

// ── Drum synthesis for OfflineAudioContext ────────────────────────────────

function synthDrum(ctx, type, time, vel = 1) {
  const v = Math.min(1, Math.max(0, vel))
  const out = ctx.createGain()
  out.gain.value = v
  out.connect(ctx.destination)

  const noise = (dur) => {
    const len = Math.ceil(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    return src
  }

  switch (type) {
    case 'kick': {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.connect(g); g.connect(out)
      osc.frequency.setValueAtTime(150, time)
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.15)
      g.gain.setValueAtTime(1, time)
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.4)
      osc.start(time); osc.stop(time + 0.4)
      break
    }
    case '808': {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      const g = ctx.createGain()
      osc.connect(g); g.connect(out)
      osc.frequency.setValueAtTime(80, time)
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.6)
      g.gain.setValueAtTime(0.9, time)
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.7)
      osc.start(time); osc.stop(time + 0.7)
      break
    }
    case 'snare': {
      const ns = noise(0.2)
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000; nf.Q.value = 0.5
      const ng = ctx.createGain()
      ns.connect(nf); nf.connect(ng); ng.connect(out)
      ng.gain.setValueAtTime(0.8, time); ng.gain.exponentialRampToValueAtTime(0.001, time + 0.15)
      ns.start(time); ns.stop(time + 0.2)
      const osc = ctx.createOscillator(); const og = ctx.createGain()
      osc.connect(og); og.connect(out)
      osc.frequency.setValueAtTime(220, time); osc.frequency.exponentialRampToValueAtTime(110, time + 0.05)
      og.gain.setValueAtTime(0.6, time); og.gain.exponentialRampToValueAtTime(0.001, time + 0.1)
      osc.start(time); osc.stop(time + 0.1)
      break
    }
    case 'clap': {
      for (let i = 0; i < 3; i++) {
        const t = time + i * 0.008
        const ns = noise(0.05)
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1
        const g = ctx.createGain()
        ns.connect(bp); bp.connect(g); g.connect(out)
        g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
        ns.start(t); ns.stop(t + 0.05)
      }
      break
    }
    case 'hihat-c': {
      const ns = noise(0.06)
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000
      const g = ctx.createGain()
      ns.connect(hp); hp.connect(g); g.connect(out)
      g.gain.setValueAtTime(0.4, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
      ns.start(time); ns.stop(time + 0.06)
      break
    }
    case 'hihat-o': {
      const ns = noise(0.3)
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000
      const g = ctx.createGain()
      ns.connect(hp); hp.connect(g); g.connect(out)
      g.gain.setValueAtTime(0.35, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.25)
      ns.start(time); ns.stop(time + 0.3)
      break
    }
    case 'rim': {
      const ns = noise(0.03)
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5000; bp.Q.value = 2
      const ng = ctx.createGain()
      ns.connect(bp); bp.connect(ng); ng.connect(out)
      ng.gain.setValueAtTime(0.5, time); ng.gain.exponentialRampToValueAtTime(0.001, time + 0.03)
      ns.start(time); ns.stop(time + 0.03)
      const osc = ctx.createOscillator(); const og = ctx.createGain()
      osc.connect(og); og.connect(out)
      osc.frequency.setValueAtTime(1800, time); osc.frequency.exponentialRampToValueAtTime(800, time + 0.02)
      og.gain.setValueAtTime(0.4, time); og.gain.exponentialRampToValueAtTime(0.001, time + 0.02)
      osc.start(time); osc.stop(time + 0.02)
      break
    }
    case 'perc': {
      const osc = ctx.createOscillator(); osc.type = 'sine'
      const g = ctx.createGain()
      osc.connect(g); g.connect(out)
      osc.frequency.setValueAtTime(500, time); osc.frequency.exponentialRampToValueAtTime(150, time + 0.1)
      g.gain.setValueAtTime(0.5, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.1)
      osc.start(time); osc.stop(time + 0.12)
      break
    }
    case 'tom': {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.connect(g); g.connect(out)
      osc.frequency.setValueAtTime(220, time); osc.frequency.exponentialRampToValueAtTime(80, time + 0.2)
      g.gain.setValueAtTime(0.7, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.3)
      osc.start(time); osc.stop(time + 0.3)
      break
    }
    case 'shaker': {
      const len = Math.ceil(ctx.sampleRate * 0.08)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.3))
      const ns = ctx.createBufferSource(); ns.buffer = buf
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000
      const g = ctx.createGain()
      ns.connect(hp); hp.connect(g); g.connect(out)
      g.gain.setValueAtTime(0.3, time)
      ns.start(time); ns.stop(time + 0.08)
      break
    }
    default: break
  }
}

async function renderLoop(rows, bpm, bars = 1) {
  const STEPS = 16 * bars
  const stepSec = (60 / bpm) / 4
  const duration = STEPS * stepSec + 0.5
  const sr = 44100
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr)
  rows.forEach(({ type, steps }) => {
    steps.forEach((vel, i) => { if (vel > 0) synthDrum(ctx, type, i * stepSec, vel) })
  })
  return ctx.startRendering()
}

// ── Loop library data ─────────────────────────────────────────────────────

const LOOPS = [
  // Hip-Hop 90 BPM
  {
    id: 'hiphop-boom-bap', name: 'Boom Bap Classic', genre: 'Hip-Hop', bpm: 90, bars: 2, color: '#b44fff',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,0,.7,0, 0,0,0,0, 0,0,0,0,  1,0,0,0, 0,0,1,0, 0,0,0,.8, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,   0,0,0,0, 1,0,0,0, 0,0,0,0,  1,0,0,0] },
      { type: 'hihat-c', steps: [.8,0,.6,0, .8,0,.6,0, .8,0,.6,0, .8,0,.6,.5,   .8,0,.6,0, .8,0,.6,0, .8,0,.6,0, .8,0,.6,0] },
      { type: 'hihat-o', steps: [0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0,   0,0,0,0, 0,0,0,0, 0,0,1,0,  0,0,0,0] },
    ],
  },
  {
    id: 'hiphop-head-nod', name: 'Head Nod', genre: 'Hip-Hop', bpm: 90, bars: 1, color: '#b44fff',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
      { type: 'perc',    steps: [0,0,0,0, 0,0,.5,0, 0,0,0,0, 0,.5,0,0] },
    ],
  },
  {
    id: 'hiphop-laid-back', name: 'Laid-Back Groove', genre: 'Hip-Hop', bpm: 85, bars: 2, color: '#b44fff',
    rows: [
      { type: 'kick',    steps: [1,0,0,.3, 0,0,1,0, 0,0,0,0, 1,0,0,0,  1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,.4,0,  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: [.7,0,.5,0, .7,0,.5,0, .7,0,.5,0, .7,0,.5,0,  .7,0,.5,0, .7,0,.5,0, .7,0,.5,0, .7,0,.5,0] },
      { type: 'rim',     steps: [0,0,0,0, 0,0,0,.4, 0,0,0,0, 0,0,0,0,  0,0,0,0, 0,0,0,.5, 0,0,0,0, 0,0,0,0] },
    ],
  },
  {
    id: 'hiphop-bounce', name: 'Bounce Beat', genre: 'Hip-Hop', bpm: 95, bars: 1, color: '#b44fff',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,0] },
      { type: 'clap',    steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,1,0,1].map(v => v * 0.5) },
      { type: 'shaker',  steps: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
    ],
  },
  // Trap
  {
    id: 'trap-808-roll', name: '808 Trap', genre: 'Trap', bpm: 140, bars: 2, color: '#ff2d55',
    rows: [
      { type: '808',     steps: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0,  1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: Array(32).fill(0).map((_, i) => i % 2 === 0 ? 0.4 : 0) },
      { type: 'hihat-o', steps: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0,  0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0] },
    ],
  },
  {
    id: 'trap-atlanta', name: 'Atlanta Trap', genre: 'Trap', bpm: 130, bars: 1, color: '#ff2d55',
    rows: [
      { type: '808',     steps: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
      { type: 'kick',    steps: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0] },
      { type: 'clap',    steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: [1,0,1,1, 0,1,1,0, 1,0,1,1, 0,1,1,1].map(v => v * 0.5) },
    ],
  },
  {
    id: 'trap-dark', name: 'Dark Trap', genre: 'Trap', bpm: 145, bars: 2, color: '#ff2d55',
    rows: [
      { type: '808',     steps: [1,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0,  1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0] },
      { type: 'snare',   steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,.5] },
      { type: 'hihat-c', steps: Array(32).fill(0).map((_, i) => [0,2].includes(i % 4) ? 0.6 : 0) },
      { type: 'perc',    steps: [0,0,0,0, 0,0,0,0, 0,.5,0,0, 0,0,0,0,  0,0,0,0, 0,0,.5,0, 0,0,0,0, 0,0,0,0] },
    ],
  },
  // Lo-Fi
  {
    id: 'lofi-chill', name: 'Lo-Fi Chill', genre: 'Lo-Fi', bpm: 75, bars: 2, color: '#00e5ff',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,.3,  1,0,0,0, 0,0,.7,0, 0,0,0,0, 0,.3,0,0] },
      { type: 'snare',   steps: [0,0,0,0, .7,0,0,0, 0,.3,0,0, .7,0,0,0,  0,0,0,0, .7,0,0,0, 0,0,0,.3, .7,0,0,0] },
      { type: 'hihat-c', steps: Array(32).fill(0).map((_, i) => i % 2 === 0 ? 0.5 : 0.3) },
    ],
  },
  {
    id: 'lofi-jazz-chop', name: 'Jazz Chop', genre: 'Lo-Fi', bpm: 80, bars: 1, color: '#00e5ff',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, .8,0,0,0, 0,0,0,0, .8,0,0,.4] },
      { type: 'hihat-c', steps: [.6,0,.5,.4, .6,0,.5,0, .6,0,.5,.4, .6,0,.5,0] },
      { type: 'rim',     steps: [0,0,0,0, 0,.3,0,0, 0,0,0,0, 0,.3,0,0] },
    ],
  },
  {
    id: 'lofi-night-drive', name: 'Night Drive', genre: 'Lo-Fi', bpm: 82, bars: 2, color: '#00e5ff',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0,  1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: Array(32).fill(0).map((_, i) => i % 2 === 0 ? 0.5 : 0.3) },
      { type: 'shaker',  steps: Array(32).fill(0).map((_, i) => i % 4 === 3 ? 0.2 : 0) },
    ],
  },
  // House
  {
    id: 'house-four-floor', name: 'Four-on-the-Floor', genre: 'House', bpm: 124, bars: 1, color: '#ffe600',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] },
      { type: 'clap',    steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
      { type: 'hihat-o', steps: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0] },
      { type: 'shaker',  steps: Array(16).fill(0.4) },
    ],
  },
  {
    id: 'house-afro', name: 'Afro House', genre: 'House', bpm: 122, bars: 2, color: '#ffe600',
    rows: [
      { type: 'kick',  steps: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,  1,0,0,0, 1,0,0,0, 1,0,1,0, 1,0,0,0] },
      { type: 'clap',  steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'perc',  steps: [0,.6,0,0, 0,.6,0,.6, 0,.6,0,0, 0,.6,.6,0,  0,.6,0,0, 0,.6,0,.6, 0,.6,0,0, 0,.6,.6,0] },
      { type: 'hihat-c', steps: Array(32).fill(0.3) },
    ],
  },
  {
    id: 'house-deep', name: 'Deep House', genre: 'House', bpm: 120, bars: 1, color: '#ffe600',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0] },
      { type: 'clap',    steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: [0,0,.8,0, 0,0,.8,0, 0,0,.8,0, 0,0,.8,0] },
      { type: 'hihat-o', steps: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,.7,0,0] },
      { type: 'shaker',  steps: [.3,0,.3,0, .3,0,.3,0, .3,0,.3,0, .3,0,.3,0] },
    ],
  },
  // R&B
  {
    id: 'rnb-smooth', name: 'Smooth R&B', genre: 'R&B', bpm: 90, bars: 2, color: '#00ff9d',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0,  1,0,0,0, 0,0,0,.5, 0,0,1,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,0, 0,0,0,.5, 1,0,0,0] },
      { type: 'hihat-c', steps: Array(32).fill(0).map((_, i) => i % 2 === 0 ? 0.6 : 0.4) },
      { type: 'shaker',  steps: Array(32).fill(0).map((_, i) => i % 4 === 2 ? 0.3 : 0) },
    ],
  },
  {
    id: 'rnb-neo-soul', name: 'Neo-Soul', genre: 'R&B', bpm: 88, bars: 1, color: '#00ff9d',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,.4,0,0, 0,0,1,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,.3, 1,0,0,0, 0,0,0,.3, 1,0,0,0] },
      { type: 'hihat-c', steps: [.5,0,.4,.3, .5,0,.4,0, .5,0,.4,.3, .5,0,.4,0] },
      { type: 'rim',     steps: [0,0,0,0, 0,.3,0,.3, 0,0,0,0, 0,.3,0,.3] },
    ],
  },
  // Reggaeton
  {
    id: 'reggaeton-dembow', name: 'Dembow', genre: 'Reggaeton', bpm: 100, bars: 1, color: '#ff9500',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] },
      { type: 'snare',   steps: [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0] },
      { type: 'hihat-c', steps: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
      { type: 'perc',    steps: [0,.5,0,.5, 0,.5,0,.5, 0,.5,0,.5, 0,.5,0,.5] },
    ],
  },
  {
    id: 'reggaeton-latin', name: 'Latin Bounce', genre: 'Reggaeton', bpm: 98, bars: 2, color: '#ff9500',
    rows: [
      { type: 'kick',    steps: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0,  1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] },
      { type: 'clap',    steps: [0,0,0,0, 1,0,0,.5, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,.5, 0,0,0,0, 1,0,0,0] },
      { type: 'hihat-c', steps: Array(32).fill(0.7) },
      { type: 'shaker',  steps: Array(32).fill(0.5) },
    ],
  },
]

const GENRES = ['All', ...new Set(LOOPS.map(l => l.genre))]

// ── Main component ────────────────────────────────────────────────────────

export default function LoopLibraryView() {
  const [genre,      setGenre]     = useState('All')
  const [search,     setSearch]    = useState('')
  const [previewing, setPreviewing] = useState(null)
  const [rendering,  setRendering]  = useState(null)
  const [rendered,   setRendered]   = useState({})     // id → { buf, url }
  const srcRef = useRef(null)

  const filtered = LOOPS.filter(l =>
    (genre === 'All' || l.genre === genre) &&
    (!search || l.name.toLowerCase().includes(search.toLowerCase()) || l.genre.toLowerCase().includes(search.toLowerCase()))
  )

  const stopPreview = useCallback(() => {
    if (srcRef.current) { try { srcRef.current.stop() } catch {} srcRef.current = null }
    setPreviewing(null)
  }, [])

  useEffect(() => () => stopPreview(), [stopPreview])

  const ensureRendered = useCallback(async (loop) => {
    if (rendered[loop.id]) return rendered[loop.id]
    setRendering(loop.id)
    try {
      const buf = await renderLoop(loop.rows, loop.bpm, loop.bars)
      const blob = bufferToWavBlob(buf)
      const url = URL.createObjectURL(blob)
      const entry = { buf, url }
      setRendered(prev => ({ ...prev, [loop.id]: entry }))
      return entry
    } catch (e) {
      console.error('Loop render failed', e)
      return null
    } finally {
      setRendering(null)
    }
  }, [rendered])

  const registerURL = (loop, entry) => {
    if (!window.__sampleURLs) window.__sampleURLs = {}
    window.__sampleURLs[loop.id] = entry.url
  }

  const handlePreview = useCallback(async (loop) => {
    if (previewing === loop.id) { stopPreview(); return }
    stopPreview()
    const entry = await ensureRendered(loop)
    if (!entry) return
    registerURL(loop, entry)
    const { getCtx } = await import('../../audio/audioEngine')
    const ctx = getCtx()
    const src = ctx.createBufferSource()
    src.buffer = entry.buf
    src.loop = true
    src.connect(ctx.destination)
    src.start()
    srcRef.current = src
    setPreviewing(loop.id)
  }, [previewing, stopPreview, ensureRendered])

  const handleDragStart = useCallback(async (e, loop) => {
    const entry = rendered[loop.id]
    if (!entry) { e.preventDefault(); return }
    registerURL(loop, entry)
    e.dataTransfer.setData('sampleId', loop.id)
    e.dataTransfer.setData('sampleName', `${loop.name} ${loop.bpm}bpm.wav`)
    e.dataTransfer.effectAllowed = 'copy'
  }, [rendered])

  const handleAddToArrange = useCallback(async (loop) => {
    const entry = await ensureRendered(loop)
    if (!entry) return
    registerURL(loop, entry)
    // Dispatch a custom event that ArrangeView can listen to if open
    window.dispatchEvent(new CustomEvent('loop-library-add', {
      detail: { id: loop.id, name: `${loop.name} ${loop.bpm}bpm`, url: entry.url }
    }))
  }, [ensureRendered])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#080810', color: '#e0e0e0', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#0d0d1a', borderBottom: '1px solid #1a1a2e', flexShrink: 0 }}>
        <span style={{ fontSize: 16 }}>♫</span>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1, background: 'linear-gradient(90deg, #ff9500, #ff2d55)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Loop Library
        </span>
        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>{LOOPS.length} royalty-free loops</span>
        <div style={{ flexGrow: 1 }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search loops…"
          style={{ background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 6, color: '#e0e0e0', padding: '4px 10px', fontSize: 11, width: 160 }}
        />
      </div>

      {/* Genre tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: '#0a0a18', borderBottom: '1px solid #1a1a2e', flexShrink: 0, flexWrap: 'wrap' }}>
        {GENRES.map(g => (
          <button key={g} onClick={() => setGenre(g)} style={{
            padding: '3px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
            background: genre === g ? '#ff950022' : 'transparent',
            border: `1px solid ${genre === g ? '#ff9500' : '#2a2a3e'}`,
            color: genre === g ? '#ff9500' : '#666',
          }}>{g}</button>
        ))}
        <span style={{ fontSize: 10, color: '#333', fontFamily: 'monospace', marginLeft: 'auto', alignSelf: 'center' }}>
          ▶ to preview · drag or + to add to Arrange
        </span>
      </div>

      {/* Loop grid */}
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {filtered.map(loop => {
            const isPlaying   = previewing === loop.id
            const isRendering = rendering === loop.id
            const isReady     = !!rendered[loop.id]

            return (
              <div
                key={loop.id}
                draggable={isReady}
                onDragStart={isReady ? (e) => handleDragStart(e, loop) : undefined}
                style={{
                  background: '#0d0d1a',
                  border: `1px solid ${isPlaying ? loop.color : '#1a1a2e'}`,
                  borderRadius: 8, padding: '10px 12px',
                  cursor: isReady ? 'grab' : 'default',
                  boxShadow: isPlaying ? `0 0 14px ${loop.color}44` : 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: loop.color, boxShadow: `0 0 6px ${loop.color}`, flexShrink: 0 }} />
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e0e0e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loop.name}</div>
                    <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
                      {loop.genre} · {loop.bpm} BPM · {loop.bars} bar{loop.bars > 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Preview button */}
                  <button
                    onClick={() => handlePreview(loop)}
                    title={isPlaying ? 'Stop' : 'Preview'}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: isPlaying ? loop.color : '#ffffff11',
                      border: `1px solid ${isPlaying ? loop.color : '#333'}`,
                      color: isPlaying ? '#000' : loop.color,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                    }}
                  >
                    {isRendering ? '…' : isPlaying ? '■' : '▶'}
                  </button>

                  {/* Add to Arrange button */}
                  <button
                    onClick={() => handleAddToArrange(loop)}
                    title="Render & add to Arrange view"
                    style={{
                      width: 24, height: 24, borderRadius: 4, flexShrink: 0,
                      background: '#ffffff08', border: '1px solid #333', color: '#888',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                    }}
                  >+</button>
                </div>

                {/* Step grid preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {loop.rows.map((row, ri) => (
                    <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 42, fontSize: 7, fontFamily: 'monospace', color: '#444', textTransform: 'uppercase', flexShrink: 0 }}>{row.type}</span>
                      <div style={{ display: 'flex', gap: 1, flexGrow: 1 }}>
                        {row.steps.slice(0, 16).map((vel, si) => (
                          <div key={si} style={{
                            flex: 1, height: 6, borderRadius: 1,
                            background: vel > 0 ? loop.color : '#1a1a2e',
                            opacity: vel > 0 ? 0.25 + vel * 0.75 : 1,
                          }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer hint */}
                <div style={{ fontSize: 8, fontFamily: 'monospace', marginTop: 6, color: '#333', textAlign: 'right' }}>
                  {isReady ? 'ready · drag to Arrange' : isRendering ? 'rendering…' : '▶ preview to load'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
