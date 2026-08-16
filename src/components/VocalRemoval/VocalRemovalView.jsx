import React, { useState, useRef, useCallback, useEffect } from 'react'
import { getCtx, bufferToWavBlob } from '../../audio/audioEngine'

// Module-level cache — survives tab switches (component unmount/remount)
const _cache = { sourceFile: null, sourceBuf: null, vocalBuf: null, instrBuf: null }

// ── Cooley-Tukey in-place FFT (power-of-2) ───────────────────────────────────
function fft(re, im) {
  const N = re.length
  let j = 0
  for (let i = 1; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0
      for (let k = 0; k < (len >> 1); k++) {
        const h = i + k + (len >> 1)
        const uRe = re[i+k], uIm = im[i+k]
        const vRe = re[h]*curRe - im[h]*curIm
        const vIm = re[h]*curIm + im[h]*curRe
        re[i+k] = uRe + vRe; im[i+k] = uIm + vIm
        re[h]   = uRe - vRe; im[h]   = uIm - vIm
        const nRe = curRe*wRe - curIm*wIm
        curIm = curRe*wIm + curIm*wRe; curRe = nRe
      }
    }
  }
}

function ifft(re, im) {
  const N = re.length
  for (let i = 0; i < N; i++) im[i] = -im[i]
  fft(re, im)
  for (let i = 0; i < N; i++) { re[i] /= N; im[i] = -im[i] / N }
}

// ── STFT Wiener vocal removal ─────────────────────────────────────────────────
// Analyzes each frequency bin independently. Bins where L ≈ R (center/vocal)
// get a high Wiener mask → subtracted from the output. Bins where L ≠ R
// (stereo instruments) get a low mask → left mostly untouched.
// Far superior to time-domain (L-R)/2 which blindly removes all center content.
async function processSTFT(L, R, len, sr, strength, shapeFreqs, vocalGain, instrGain, onProgress) {
  const FRAME = 4096
  const HOP   = 1024  // 75% overlap for smooth reconstruction

  const WIN = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) WIN[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FRAME - 1)))

  const oIL = new Float32Array(len + FRAME)
  const oIR = new Float32Array(len + FRAME)
  const oV  = new Float32Array(len + FRAME)
  const wgt = new Float32Array(len + FRAME)

  // Pre-allocate frame buffers — avoids 8+ allocations per frame
  const lRe  = new Float32Array(FRAME), lIm  = new Float32Array(FRAME)
  const rRe  = new Float32Array(FRAME), rIm  = new Float32Array(FRAME)
  const iLRe = new Float32Array(FRAME), iLIm = new Float32Array(FRAME)
  const iRRe = new Float32Array(FRAME), iRIm = new Float32Array(FRAME)
  const vRe  = new Float32Array(FRAME), vIm  = new Float32Array(FRAME)

  const numFrames = Math.ceil(len / HOP)
  const half = FRAME >> 1

  for (let frame = 0; frame < numFrames; frame++) {
    const s = frame * HOP

    // Fill windowed analysis frame
    lIm.fill(0); rIm.fill(0)
    for (let i = 0; i < FRAME; i++) {
      const idx = s + i
      const w = WIN[i]
      lRe[i] = idx < len ? L[idx] * w : 0
      rRe[i] = idx < len ? R[idx] * w : 0
    }

    fft(lRe, lIm)
    fft(rRe, rIm)

    iLIm.fill(0); iRIm.fill(0); vIm.fill(0)

    for (let k = 0; k <= half; k++) {
      const freq = k * sr / FRAME

      // Center (mid) spectrum
      const mRe = (lRe[k] + rRe[k]) * 0.5
      const mIm = (lIm[k] + rIm[k]) * 0.5

      // Energy in center vs side
      const mE  = mRe*mRe + mIm*mIm
      const sRe = lRe[k] - mRe  // = (L-R)/2
      const sIm = lIm[k] - mIm
      const sE  = sRe*sRe + sIm*sIm

      // Wiener mask: 1 = all vocal/center, 0 = all instrument/side
      const mask = mE / (mE + sE + 1e-10)

      // Frequency weighting — protect sub-bass / kick, focus on vocal range
      let fw = strength
      if (shapeFreqs) {
        if      (freq < 80)               fw *= 0.04
        else if (freq < 200)              fw *= 0.08 + 0.72 * ((freq - 80) / 120)
        else if (freq >= 200 && freq <= 5000) fw *= 1.0
        else if (freq <= 10000)           fw *= 0.8
        else                              fw *= 0.5
      }

      // Alpha = how much center to subtract. Capped at 1.0.
      const alpha = Math.min(1.0, mask * fw * 2.0)

      iLRe[k] = lRe[k] - alpha * mRe;  iLIm[k] = lIm[k] - alpha * mIm
      iRRe[k] = rRe[k] - alpha * mRe;  iRIm[k] = rIm[k] - alpha * mIm
      vRe[k]  = alpha * mRe;            vIm[k]  = alpha * mIm

      // Enforce conjugate symmetry for real-valued IFFT output
      if (k > 0 && k < half) {
        const kk = FRAME - k
        iLRe[kk] = iLRe[k]; iLIm[kk] = -iLIm[k]
        iRRe[kk] = iRRe[k]; iRIm[kk] = -iRIm[k]
        vRe[kk]  = vRe[k];  vIm[kk]  = -vIm[k]
      }
    }

    ifft(iLRe, iLIm)
    ifft(iRRe, iRIm)
    ifft(vRe, vIm)

    // Overlap-add with synthesis window
    for (let i = 0; i < FRAME; i++) {
      const idx = s + i
      const w = WIN[i]
      oIL[idx] += iLRe[i] * w
      oIR[idx] += iRRe[i] * w
      oV[idx]  += vRe[i]  * w  // vIm ≈ 0 (symmetric spectrum → real IFFT)
      wgt[idx] += w * w
    }

    if (frame % 40 === 0) {
      onProgress?.(`Processing… ${Math.round(frame / numFrames * 100)}%`)
      await new Promise(r => setTimeout(r, 0))
    }
  }

  const instrBuf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr })
  const vocalBuf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr })
  const iL = instrBuf.getChannelData(0), iR = instrBuf.getChannelData(1)
  const vL = vocalBuf.getChannelData(0), vR = vocalBuf.getChannelData(1)

  for (let i = 0; i < len; i++) {
    const w = Math.max(wgt[i], 1e-8)
    iL[i] = (oIL[i] / w) * instrGain
    iR[i] = (oIR[i] / w) * instrGain
    vL[i] = vR[i] = (oV[i] / w) * vocalGain
  }

  return { vocal: vocalBuf, instrumental: instrBuf }
}

// ── Fast time-domain center extraction (legacy) ───────────────────────────────
function processCenterExtract(L, R, len, sr, strength, vocalGain, instrGain) {
  const instrBuf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr })
  const vocalBuf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr })
  const iL = instrBuf.getChannelData(0), iR = instrBuf.getChannelData(1)
  const vL = vocalBuf.getChannelData(0), vR = vocalBuf.getChannelData(1)
  for (let i = 0; i < len; i++) {
    const mid = (L[i] + R[i]) * 0.5
    vL[i] = vR[i] = mid * strength * vocalGain
    iL[i] = (L[i] - mid * strength) * instrGain
    iR[i] = (R[i] - mid * strength) * instrGain
  }
  return { vocal: vocalBuf, instrumental: instrBuf }
}

async function processVocalRemoval(audioBuffer, mode, strength, vocalGain, instrGain, onProgress) {
  const nc  = audioBuffer.numberOfChannels
  const len = audioBuffer.length
  const sr  = audioBuffer.sampleRate

  if (nc < 2) throw new Error('Mono file detected — vocal removal requires a stereo track. Try a different MP3.')

  const L = audioBuffer.getChannelData(0)
  const R = audioBuffer.getChannelData(1)

  onProgress?.('Reading audio…')
  await new Promise(r => setTimeout(r, 0))

  if (mode === 'center') {
    onProgress?.('Running center extraction…')
    await new Promise(r => setTimeout(r, 0))
    const result = processCenterExtract(L, R, len, sr, strength, vocalGain, instrGain)
    onProgress?.('Complete!')
    return result
  }

  // 'enhanced' and 'isolate' both use STFT; difference is just UI framing
  const result = await processSTFT(L, R, len, sr, strength, mode === 'enhanced', vocalGain, instrGain, onProgress)
  onProgress?.('Complete!')
  return result
}

// ── Waveform thumbnail ────────────────────────────────────────────────────────
function WaveThumb({ buffer, color, progress = 0 }) {
  const ref = useRef(null)
  React.useEffect(() => {
    const canvas = ref.current
    if (!canvas || !buffer) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#050510'
    ctx.fillRect(0, 0, w, h)
    const data = buffer.getChannelData(0)
    const step = Math.max(1, Math.floor(data.length / w))
    ctx.strokeStyle = color; ctx.lineWidth = 1
    ctx.shadowColor = color; ctx.shadowBlur = 3
    ctx.beginPath()
    for (let x = 0; x < w; x++) {
      let max = 0
      for (let j = 0; j < step; j++) max = Math.max(max, Math.abs(data[x * step + j] || 0))
      const y1 = (h / 2) - max * (h / 2 - 2)
      const y2 = (h / 2) + max * (h / 2 - 2)
      ctx.moveTo(x, y1); ctx.lineTo(x, y2)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    if (progress > 0) {
      ctx.fillStyle = '#ffffff44'
      ctx.fillRect(0, 0, progress * w, h)
    }
  }, [buffer, color, progress])
  return <canvas ref={ref} width={360} height={60} style={{ borderRadius:6, border:'1px solid #1a1a2e', display:'block', width:'100%' }} />
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VocalRemovalView() {
  // Initialize from cache so state survives tab switches
  const [sourceFile,  setSourceFile]  = useState(_cache.sourceFile)
  const [sourceBuf,   setSourceBuf]   = useState(_cache.sourceBuf)
  const [vocalBuf,    setVocalBuf]    = useState(_cache.vocalBuf)
  const [instrBuf,    setInstrBuf]    = useState(_cache.instrBuf)
  const [processing,  setProcessing]  = useState(false)
  const [progress,    setProgress]    = useState('')
  const [error,       setError]       = useState('')
  const [mode,        setMode]        = useState('enhanced')
  const [strength,    setStrength]    = useState(0.85)
  const [vocalGain,   setVocalGain]   = useState(1.0)
  const [instrGain,   setInstrGain]   = useState(1.4)
  const [playingWhat, setPlayingWhat] = useState(null)
  const [playPos,     setPlayPos]     = useState(0)

  const audioRef = useRef(null)
  const frameRef = useRef(null)

  // Keep cache in sync so next mount sees current state
  useEffect(() => { _cache.sourceFile = sourceFile }, [sourceFile])
  useEffect(() => { _cache.sourceBuf  = sourceBuf  }, [sourceBuf])
  useEffect(() => { _cache.vocalBuf   = vocalBuf   }, [vocalBuf])
  useEffect(() => { _cache.instrBuf   = instrBuf   }, [instrBuf])

  // Stop audio when navigating away — don't leave it playing in the background
  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const loadFile = async (file) => {
    setError(''); setVocalBuf(null); setInstrBuf(null); setSourceFile(file); setProgress('')
    try {
      const c  = getCtx()
      const ab = await file.arrayBuffer()
      const buf = await c.decodeAudioData(ab)
      setSourceBuf(buf)
      if (buf.numberOfChannels < 2) setError('Warning: this file appears to be mono. Vocal removal works on stereo tracks.')
    } catch (e) {
      setError('Could not decode audio file: ' + e.message)
    }
  }

  const process = useCallback(async () => {
    if (!sourceBuf) return
    setProcessing(true); setError(''); setProgress('Starting…')
    setVocalBuf(null); setInstrBuf(null)
    try {
      const { vocal, instrumental } = await processVocalRemoval(
        sourceBuf, mode, strength, vocalGain, instrGain, setProgress
      )
      setVocalBuf(vocal)
      setInstrBuf(instrumental)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }, [sourceBuf, mode, strength, vocalGain, instrGain])

  const playBuffer = useCallback((buf, which) => {
    if (audioRef.current) { audioRef.current.pause(); cancelAnimationFrame(frameRef.current) }
    const wav = bufferToWavBlob(buf)
    const url = URL.createObjectURL(wav)
    const audio = new Audio(url)
    audio.onended = () => { setPlayingWhat(null); setPlayPos(0); URL.revokeObjectURL(url) }
    audio.play()
    audioRef.current = audio
    setPlayingWhat(which)
    const tick = () => {
      if (audio.paused) return
      setPlayPos(audio.currentTime / audio.duration)
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [])

  const stopPlay = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    cancelAnimationFrame(frameRef.current)
    setPlayingWhat(null); setPlayPos(0)
  }

  const download = (buf, suffix) => {
    const wav = bufferToWavBlob(buf)
    const url = URL.createObjectURL(wav)
    const name = (sourceFile?.name || 'track').replace(/\.[^.]+$/, '')
    const a = document.createElement('a')
    a.href = url; a.download = `${name}_${suffix}.wav`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#080810' }}>

      {/* ── Left panel ── */}
      <div className="flex flex-col gap-4 p-4 border-r border-studio-border shrink-0 overflow-y-auto" style={{ width: 270 }}>
        <span className="font-display text-xs tracking-widest uppercase"
          style={{ background:'linear-gradient(90deg,#ff2d55,#b44fff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Vocal Removal
        </span>

        {/* File load */}
        <label style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Source Track</span>
          <div
            style={{ background:'#ffffff0a', border:'2px dashed #333', borderRadius:8, padding:'18px 10px', textAlign:'center', cursor:'pointer' }}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('audio/')) loadFile(f) }}
            onDragOver={e => e.preventDefault()}>
            <div style={{ fontSize:20, marginBottom:4 }}>♫</div>
            <div className="font-mono text-xs" style={{ color: sourceFile ? '#b44fff' : '#445' }}>
              {sourceFile ? sourceFile.name.slice(0,30) : 'Drop or click to load audio'}
            </div>
            <input type="file" accept="audio/*" style={{ display:'none' }} onChange={e => e.target.files[0] && loadFile(e.target.files[0])} />
          </div>
        </label>

        {sourceBuf && (
          <div className="font-mono text-xs" style={{ color:'#445' }}>
            {sourceBuf.duration.toFixed(1)}s · {sourceBuf.sampleRate}Hz · {sourceBuf.numberOfChannels}ch
          </div>
        )}

        {/* Mode */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Algorithm</div>
          {[
            ['enhanced', 'Spectral (Best)',    'STFT Wiener filter — frequency-aware. Protects bass, targets vocal range. Slower but much better.'],
            ['isolate',  'Spectral (Flat)',    'Same FFT method, no frequency shaping. More aggressive across all bands.'],
            ['center',   'Basic (Fast)',       'Classic (L−R)/2 center extraction. Fast but removes everything in the center, including kick and bass.'],
          ].map(([m, l, d]) => (
            <button key={m} onClick={() => setMode(m)}
              className="w-full text-left px-3 py-2 rounded mb-1.5 text-xs font-mono transition-all"
              style={{ background: mode===m ? '#b44fff22' : '#ffffff0a', border:`1px solid ${mode===m ? '#b44fff' : '#333'}`, color: mode===m ? '#b44fff' : '#888' }}>
              <div className="font-semibold">{l}</div>
              <div style={{ fontSize:9, color:'#556', marginTop:2, lineHeight:1.4 }}>{d}</div>
            </button>
          ))}
        </div>

        {/* Strength */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Removal Strength</span>
            <span className="font-mono text-xs" style={{ color:'#b44fff' }}>{Math.round(strength * 100)}%</span>
          </div>
          <input type="range" min={0.2} max={1} step={0.05} value={strength}
            onChange={e => setStrength(Number(e.target.value))} className="w-full" />
          <div className="font-mono mt-1" style={{ fontSize:9, color:'#334' }}>
            Lower = gentler removal, more bleed-through. Higher = more aggressive.
          </div>
        </div>

        {/* Output levels */}
        <div className="flex flex-col gap-2">
          <div className="font-mono text-xs text-studio-dim uppercase tracking-wider mb-0.5">Output Levels</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-studio-dim" style={{ minWidth:52 }}>Instr Vol</span>
            <input type="range" min={0.5} max={3} step={0.05} value={instrGain}
              onChange={e => setInstrGain(Number(e.target.value))} className="flex-1" />
            <span className="font-mono text-xs w-9 text-right" style={{ color:'#00e5ff' }}>{Math.round(instrGain*100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-studio-dim" style={{ minWidth:52 }}>Vocal Vol</span>
            <input type="range" min={0} max={2} step={0.05} value={vocalGain}
              onChange={e => setVocalGain(Number(e.target.value))} className="flex-1" />
            <span className="font-mono text-xs w-9 text-right" style={{ color:'#ff2d55' }}>{Math.round(vocalGain*100)}%</span>
          </div>
        </div>

        {/* Process */}
        <button onClick={process} disabled={!sourceBuf || processing}
          className="py-3 rounded font-display font-bold text-sm tracking-wider transition-all"
          style={{
            background: (!sourceBuf || processing) ? '#1a1a2e' : 'linear-gradient(135deg,#ff2d5522,#b44fff33)',
            border:`1px solid ${(!sourceBuf||processing)?'#333':'#b44fff88'}`,
            color: (!sourceBuf||processing) ? '#444' : '#c47fff',
            cursor: (!sourceBuf||processing) ? 'not-allowed' : 'pointer'
          }}>
          {processing ? '⏳ Processing…' : '✦ Remove Vocals'}
        </button>

        {error && (
          <div className="text-xs font-mono p-2 rounded" style={{ background:'#ff2d5514', color:'#ff8099', border:'1px solid #ff2d5540', lineHeight:1.5 }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto">

        {(processing || progress) && (
          <div style={{ background:'#0a0a1a', border:`1px solid ${processing?'#b44fff33':'#00ff9d33'}`, borderRadius:8, padding:'10px 14px' }}>
            <div className="font-mono text-xs" style={{ color: processing ? '#b44fff' : '#00ff9d' }}>
              {processing && '⏳ '}{progress}
            </div>
            {processing && mode !== 'center' && (
              <div className="font-mono mt-1" style={{ fontSize:9, color:'#445' }}>
                Spectral mode analyzes ~{Math.round((sourceBuf?.length || 0) / 1024)} FFT frames — may take 10–30 seconds for longer tracks.
              </div>
            )}
          </div>
        )}

        {sourceBuf && (
          <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:12 }}>
            <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Original</div>
            <WaveThumb buffer={sourceBuf} color="#445" />
          </div>
        )}

        {instrBuf && (
          <div style={{ background:'#0a0a1a', border:'1px solid #00e5ff33', borderRadius:8, padding:12 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-xs tracking-widest uppercase" style={{ color:'#00e5ff' }}>Instrumental (Vocals Removed)</span>
              <div className="flex gap-2">
                <button onClick={() => playingWhat==='instr' ? stopPlay() : playBuffer(instrBuf,'instr')}
                  style={{ background:'#00e5ff22', border:'1px solid #00e5ff55', borderRadius:4, padding:'3px 10px', fontSize:11, color:'#00e5ff', cursor:'pointer', fontWeight:'bold' }}>
                  {playingWhat === 'instr' ? '⏹ Stop' : '▶ Play'}
                </button>
                <button onClick={() => download(instrBuf, 'instrumental')}
                  style={{ background:'#00e5ff11', border:'1px solid #00e5ff33', borderRadius:4, padding:'3px 10px', fontSize:11, color:'#00e5ff', cursor:'pointer' }}>
                  ↓ WAV
                </button>
              </div>
            </div>
            <WaveThumb buffer={instrBuf} color="#00e5ff" progress={playingWhat==='instr' ? playPos : 0} />
          </div>
        )}

        {vocalBuf && (
          <div style={{ background:'#0a0a1a', border:'1px solid #ff2d5533', borderRadius:8, padding:12 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-xs tracking-widest uppercase" style={{ color:'#ff2d55' }}>Vocal Track (Isolated)</span>
              <div className="flex gap-2">
                <button onClick={() => playingWhat==='vocal' ? stopPlay() : playBuffer(vocalBuf,'vocal')}
                  style={{ background:'#ff2d5522', border:'1px solid #ff2d5555', borderRadius:4, padding:'3px 10px', fontSize:11, color:'#ff2d55', cursor:'pointer', fontWeight:'bold' }}>
                  {playingWhat === 'vocal' ? '⏹ Stop' : '▶ Play'}
                </button>
                <button onClick={() => download(vocalBuf, 'vocal')}
                  style={{ background:'#ff2d5511', border:'1px solid #ff2d5533', borderRadius:4, padding:'3px 10px', fontSize:11, color:'#ff2d55', cursor:'pointer' }}>
                  ↓ WAV
                </button>
              </div>
            </div>
            <WaveThumb buffer={vocalBuf} color="#ff2d55" progress={playingWhat==='vocal' ? playPos : 0} />
          </div>
        )}

        {/* Info */}
        <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:14 }}>
          <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-3">How It Works</div>
          <div className="flex flex-col gap-2">
            {[
              ['Spectral Mode', 'Splits audio into 4096 overlapping frequency frames using FFT. In each frame, bins where L ≈ R (center/vocal) get a Wiener soft mask applied — so only the vocal-dominant frequencies are subtracted, leaving bass and stereo elements intact.'],
              ['Why Better', 'Old "center extraction" removed EVERYTHING in the center: kick drum, bass, lead synths. Spectral mode analyzes energy ratios per frequency bin, so centered instruments survive better.'],
              ['Best Results', 'Works best on professionally mixed stereo releases where vocals are panned dead center. Songs with heavy vocal reverb or doubled vocals may still have some bleed-through.'],
              ['Strength Tip', '70–85% strength often sounds most natural. 100% removes more but can leave artifacts in heavily processed songs.'],
            ].map(([t,d]) => (
              <div key={t} className="flex gap-2">
                <span className="font-mono font-bold shrink-0" style={{ fontSize:10, color:'#b44fff', minWidth:90 }}>{t}</span>
                <span className="font-mono" style={{ fontSize:10, color:'#556', lineHeight:1.5 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
