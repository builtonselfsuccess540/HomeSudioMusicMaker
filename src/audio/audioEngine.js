// Singleton audio engine — one AudioContext shared across the whole app

let ctx = null

export function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// ─── Drum synthesis ───────────────────────────────────────────────

function noise(duration) {
  const c = getCtx()
  const bufSize = c.sampleRate * duration
  const buf = c.createBuffer(1, bufSize, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  return src
}

// ─── Custom sample slots ──────────────────────────────────────────

const sampleBuffers = new Map()
const sampleNames   = new Map()

export async function loadSample(slot, file) {
  const c = getCtx()
  const arrayBuffer = await file.arrayBuffer()
  const audioBuffer = await c.decodeAudioData(arrayBuffer)
  sampleBuffers.set(slot, audioBuffer)
  sampleNames.set(slot, file.name)
  return file.name
}

export function isSampleLoaded(slot) { return sampleBuffers.has(slot) }
export function getSampleName(slot)  { return sampleNames.get(slot) || null }

// ─── playDrum — velocity (0–1) scales overall gain ────────────────
// Optional third arg: { pitchSt, decayMult, pan } for per-pad sound design

export function playDrum(type, velocity = 1, { pitchSt = 0, decayMult = 1.0, pan = 0 } = {}) {
  const c = getCtx()
  const now = c.currentTime
  const pr = Math.pow(2, pitchSt / 12) // pitch ratio

  const out = c.createGain()
  out.gain.value = Math.max(0.001, Math.min(1, velocity))

  if (Math.abs(pan) > 0.01) {
    const panner = c.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, pan))
    out.connect(panner)
    panner.connect(_getMasterIn())
  } else {
    out.connect(_getMasterIn())
  }

  switch (type) {
    case 'Kick': {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain); gain.connect(out)
      osc.frequency.setValueAtTime(150 * pr, now)
      osc.frequency.exponentialRampToValueAtTime(40 * pr, now + 0.15 * decayMult)
      gain.gain.setValueAtTime(1, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4 * decayMult)
      osc.start(now); osc.stop(now + 0.4 * decayMult)
      break
    }

    case 'Snare': {
      const osc = c.createOscillator()
      const oscGain = c.createGain()
      osc.connect(oscGain); oscGain.connect(out)
      osc.frequency.value = 180 * pr
      oscGain.gain.setValueAtTime(0.7, now)
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1 * decayMult)
      osc.start(now); osc.stop(now + 0.1 * decayMult)
      const n = noise(0.2 * decayMult)
      const nGain = c.createGain()
      const filter = c.createBiquadFilter()
      filter.type = 'highpass'; filter.frequency.value = 1000
      n.connect(filter); filter.connect(nGain); nGain.connect(out)
      nGain.gain.setValueAtTime(0.8, now)
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2 * decayMult)
      n.start(now); n.stop(now + 0.2 * decayMult)
      break
    }

    case 'HH-C': {
      const n = noise(0.08 * decayMult)
      const gain = c.createGain()
      const filter = c.createBiquadFilter()
      filter.type = 'highpass'; filter.frequency.value = 7000
      n.connect(filter); filter.connect(gain); gain.connect(out)
      gain.gain.setValueAtTime(0.5, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05 * decayMult)
      n.start(now); n.stop(now + 0.08 * decayMult)
      break
    }

    case 'HH-O': {
      const n = noise(0.4 * decayMult)
      const gain = c.createGain()
      const filter = c.createBiquadFilter()
      filter.type = 'highpass'; filter.frequency.value = 6000
      n.connect(filter); filter.connect(gain); gain.connect(out)
      gain.gain.setValueAtTime(0.4, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 * decayMult)
      n.start(now); n.stop(now + 0.4 * decayMult)
      break
    }

    case 'Clap': {
      ;[0, 0.01, 0.02].forEach((offset) => {
        const n = noise(0.06 * decayMult)
        const gain = c.createGain()
        const filter = c.createBiquadFilter()
        filter.type = 'bandpass'; filter.frequency.value = 1200 * pr; filter.Q.value = 0.5
        n.connect(filter); filter.connect(gain); gain.connect(out)
        gain.gain.setValueAtTime(0.6, now + offset)
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1 * decayMult)
        n.start(now + offset); n.stop(now + offset + 0.1 * decayMult)
      })
      break
    }

    case 'Tom-H': {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain); gain.connect(out)
      osc.frequency.setValueAtTime(220 * pr, now)
      osc.frequency.exponentialRampToValueAtTime(100 * pr, now + 0.2 * decayMult)
      gain.gain.setValueAtTime(0.8, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3 * decayMult)
      osc.start(now); osc.stop(now + 0.3 * decayMult)
      break
    }

    case 'Tom-M': {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain); gain.connect(out)
      osc.frequency.setValueAtTime(160 * pr, now)
      osc.frequency.exponentialRampToValueAtTime(70 * pr, now + 0.25 * decayMult)
      gain.gain.setValueAtTime(0.85, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 * decayMult)
      osc.start(now); osc.stop(now + 0.35 * decayMult)
      break
    }

    case 'Tom-L': {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain); gain.connect(out)
      osc.frequency.setValueAtTime(100 * pr, now)
      osc.frequency.exponentialRampToValueAtTime(45 * pr, now + 0.3 * decayMult)
      gain.gain.setValueAtTime(0.9, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45 * decayMult)
      osc.start(now); osc.stop(now + 0.45 * decayMult)
      break
    }

    case 'Perc1': {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'triangle'
      osc.connect(gain); gain.connect(out)
      osc.frequency.setValueAtTime(600 * pr, now)
      osc.frequency.exponentialRampToValueAtTime(200 * pr, now + 0.1 * decayMult)
      gain.gain.setValueAtTime(0.5, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 * decayMult)
      osc.start(now); osc.stop(now + 0.15 * decayMult)
      break
    }

    case 'Perc2': {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'square'
      osc.connect(gain); gain.connect(out)
      osc.frequency.setValueAtTime(400 * pr, now)
      osc.frequency.exponentialRampToValueAtTime(150 * pr, now + 0.08 * decayMult)
      gain.gain.setValueAtTime(0.35, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12 * decayMult)
      osc.start(now); osc.stop(now + 0.12 * decayMult)
      break
    }

    case 'FX1': {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sawtooth'
      osc.connect(gain); gain.connect(out)
      osc.frequency.setValueAtTime(1200 * pr, now)
      osc.frequency.exponentialRampToValueAtTime(80 * pr, now + 0.25 * decayMult)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25 * decayMult)
      osc.start(now); osc.stop(now + 0.25 * decayMult)
      break
    }

    case 'FX2': {
      const n = noise(0.8 * decayMult)
      const gain = c.createGain()
      const filter = c.createBiquadFilter()
      filter.type = 'bandpass'; filter.frequency.value = 5000; filter.Q.value = 0.3
      n.connect(filter); filter.connect(gain); gain.connect(out)
      gain.gain.setValueAtTime(0.6, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7 * decayMult)
      n.start(now); n.stop(now + 0.8 * decayMult)
      break
    }

    case 'Smpl 1':
    case 'Smpl 2': {
      const buf = sampleBuffers.get(type)
      if (buf) {
        const src = c.createBufferSource()
        src.buffer = buf
        if (pr !== 1) src.playbackRate.value = pr
        src.connect(out)
        src.start(now)
      } else {
        const n = noise(0.02)
        const g = c.createGain()
        n.connect(g); g.connect(out)
        g.gain.setValueAtTime(0.2, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.02)
        n.start(now); n.stop(now + 0.02)
      }
      break
    }

    default: {
      const freqs = { 'Pad A': 220, 'Pad B': 277, 'Pad C': 330, 'Pad D': 440 }
      const freq = (freqs[type] || 300) * pr
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sine'
      osc.connect(gain); gain.connect(out)
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.4, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5 * decayMult)
      osc.start(now); osc.stop(now + 0.5 * decayMult)
    }
  }
}

// ─── Recording ────────────────────────────────────────────────────

let mediaStream = null
let mediaRecorder = null
let analyser = null
let animFrame = null
let chunks = []
let currentAudio = null  // currently playing Audio element

const waveformListeners = new Set()
const recordingListeners = new Set()
const clipListeners = new Set()

// Saved recordings: [{ id, url, name, duration, timestamp }]
let recordings = []
let isCurrentlyRecording = false

export function onWaveform(cb) {
  waveformListeners.add(cb)
  return () => waveformListeners.delete(cb)
}

export function onRecordingChange(cb) {
  recordingListeners.add(cb)
  return () => recordingListeners.delete(cb)
}

export function onClipsChange(cb) {
  clipListeners.add(cb)
  return () => clipListeners.delete(cb)
}

export function getIsRecording() { return isCurrentlyRecording }
export function getRecordings() { return recordings }

function notifyRecording(val) {
  isCurrentlyRecording = val
  recordingListeners.forEach((cb) => cb(val))
}

function notifyClips() {
  clipListeners.forEach((cb) => cb([...recordings]))
}

function drawLoop() {
  if (!analyser) return
  const data = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(data)
  waveformListeners.forEach((cb) => cb(data))
  animFrame = requestAnimationFrame(drawLoop)
}

export async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStream = stream
    chunks = []

    const c = getCtx()
    const source = c.createMediaStreamSource(stream)
    analyser = c.createAnalyser()
    analyser.fftSize = 512

    // Connect mic to analyser (waveform) AND destination (monitoring)
    source.connect(analyser)

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    mediaRecorder = new MediaRecorder(stream, { mimeType })

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const id = Date.now()
      const entry = {
        id,
        url,
        blob,
        name: `Take ${recordings.length + 1}`,
        timestamp: new Date().toLocaleTimeString(),
        size: blob.size,
      }
      recordings = [...recordings, entry]
      notifyClips()
    }

    mediaRecorder.start(100) // collect chunks every 100ms
    notifyRecording(true)
    drawLoop()
    return null
  } catch (err) {
    return err.message || 'Microphone access denied'
  }
}

export function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop())
  if (animFrame) cancelAnimationFrame(animFrame)
  analyser = null
  mediaStream = null
  mediaRecorder = null
  animFrame = null
  notifyRecording(false)
  waveformListeners.forEach((cb) => cb(new Float32Array(128)))
}

export function playRecording(url) {
  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
  const audio = new Audio(url)
  audio.volume = 1
  audio.play().catch(() => {})
  currentAudio = audio
  return audio
}

export function stopPlayback() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
}

export function deleteRecording(id) {
  const entry = recordings.find((r) => r.id === id)
  if (entry) URL.revokeObjectURL(entry.url)
  recordings = recordings.filter((r) => r.id !== id)
  notifyClips()
}

export function downloadRecording(id) {
  const entry = recordings.find((r) => r.id === id)
  if (!entry) return
  const a = document.createElement('a')
  a.href = entry.url
  a.download = `${entry.name}.webm`
  a.click()
}

// ─── Buffer helpers for Edison / Newtone ─────────────────────────────

export async function getRecordingBuffer(id) {
  const entry = recordings.find((r) => r.id === id)
  if (!entry?.blob) return null
  const c = getCtx()
  try {
    const ab = await entry.blob.arrayBuffer()
    return await new Promise((res, rej) => c.decodeAudioData(ab, res, rej))
  } catch { return null }
}

export function bufferToWavBlob(audioBuffer) {
  const nc  = audioBuffer.numberOfChannels
  const sr  = audioBuffer.sampleRate
  const len = audioBuffer.length
  const pcm = new Int16Array(len * nc)
  for (let i = 0; i < len; i++)
    for (let ch = 0; ch < nc; ch++) {
      const s = audioBuffer.getChannelData(ch)[i]
      pcm[i * nc + ch] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
    }
  const dLen = pcm.byteLength
  const buf  = new ArrayBuffer(44 + dLen)
  const v    = new DataView(buf)
  const ws   = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + dLen, true)
  ws(8, 'WAVE'); ws(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true)
  v.setUint32(24, sr, true);  v.setUint32(28, sr * nc * 2, true)
  v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, dLen, true)
  new Int16Array(buf, 44).set(pcm)
  return new Blob([buf], { type: 'audio/wav' })
}

export function updateRecordingFromBuffer(id, audioBuffer) {
  const wav = bufferToWavBlob(audioBuffer)
  const url = URL.createObjectURL(wav)
  recordings = recordings.map((r) => {
    if (r.id !== id) return r
    if (r.url) URL.revokeObjectURL(r.url)
    return { ...r, url, blob: wav }
  })
  notifyClips()
}

// ─── Master FX chain ─────────────────────────────────────────────────
// All drum/synth sounds route through here so effects apply globally.

export const masterFX = {
  reverb:     { enabled: false, wet: 0.28 },
  delay:      { enabled: false, wet: 0.22, time: 0.375, feedback: 0.38 },
  compressor: { enabled: false, threshold: -18, ratio: 4 },
  distortion: { enabled: false, drive: 80, wet: 0.35 },
  eq:         { enabled: false, low: 0, mid: 0, high: 0 },
}

const _fxCbs = new Set()
export function onFXChange(cb) { _fxCbs.add(cb); return () => _fxCbs.delete(cb) }
function _notifyFX() {
  const snap = {
    reverb:     { ...masterFX.reverb },
    delay:      { ...masterFX.delay },
    compressor: { ...masterFX.compressor },
    distortion: { ...masterFX.distortion },
    eq:         { ...masterFX.eq },
  }
  _fxCbs.forEach(cb => cb(snap))
}

let _fxReady = false
let _fxIn = null
let _fxOut = null
let _rev = null, _del = null, _comp = null, _dist = null, _eq = null
let _analyserNode = null

function _distCurve(amount) {
  const n = 256, curve = new Float32Array(n), k = Math.max(0.001, amount)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x))
  }
  return curve
}

function _reverbIR(c, secs, decay) {
  const len = Math.floor(c.sampleRate * secs)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

function _initFX() {
  if (_fxReady) return
  _fxReady = true
  const c = getCtx()

  _fxIn = c.createGain()
  const fxOut = c.createGain()
  _fxOut = fxOut
  fxOut.connect(c.destination)

  // EQ — always in series, neutral (0 dB) until enabled
  const eqL = c.createBiquadFilter(); eqL.type = 'lowshelf';  eqL.frequency.value = 250;  eqL.gain.value = 0
  const eqM = c.createBiquadFilter(); eqM.type = 'peaking';   eqM.frequency.value = 1000; eqM.Q.value = 1.4; eqM.gain.value = 0
  const eqH = c.createBiquadFilter(); eqH.type = 'highshelf'; eqH.frequency.value = 6000; eqH.gain.value = 0
  _eq = { L: eqL, M: eqM, H: eqH }

  // Compressor — always in series, 1:1 ratio until enabled
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = 0; comp.ratio.value = 1; comp.knee.value = 0
  comp.attack.value = 0.003; comp.release.value = 0.1
  _comp = comp

  // Reverb — parallel, wet=0 until enabled
  const revConv = c.createConvolver(); revConv.buffer = _reverbIR(c, 2.5, 4)
  const revWet  = c.createGain();     revWet.gain.value = 0
  const revDry  = c.createGain();     revDry.gain.value = 1
  _rev = { conv: revConv, wet: revWet, dry: revDry }

  // Delay — parallel with feedback loop, wet=0 until enabled
  const delNode = c.createDelay(2.0); delNode.delayTime.value = masterFX.delay.time
  const delFb   = c.createGain();     delFb.gain.value = masterFX.delay.feedback
  const delWet  = c.createGain();     delWet.gain.value = 0
  delNode.connect(delFb); delFb.connect(delNode)
  delNode.connect(delWet)
  _del = { node: delNode, fb: delFb, wet: delWet }

  // Distortion — parallel, wet=0 until enabled
  const distWS  = c.createWaveShaper(); distWS.curve = _distCurve(masterFX.distortion.drive); distWS.oversample = '4x'
  const distWet = c.createGain();       distWet.gain.value = 0
  _dist = { ws: distWS, wet: distWet }

  // Wire: fxIn → EQ → Comp → postComp (dry + reverb + delay + dist) → fxOut
  _fxIn.connect(eqL); eqL.connect(eqM); eqM.connect(eqH); eqH.connect(comp)

  // Dry path
  comp.connect(revDry); revDry.connect(fxOut)
  // Reverb wet
  comp.connect(revConv); revConv.connect(revWet); revWet.connect(fxOut)
  // Delay wet
  comp.connect(delNode); delWet.connect(fxOut)
  // Distortion wet
  comp.connect(distWS); distWS.connect(distWet); distWet.connect(fxOut)
}

function _getMasterIn() { _initFX(); return _fxIn }

export function getMasterAnalyser() {
  _initFX()
  if (!_analyserNode) {
    _analyserNode = getCtx().createAnalyser()
    _analyserNode.fftSize = 2048
    _analyserNode.smoothingTimeConstant = 0.8
    _fxIn.connect(_analyserNode)
  }
  return _analyserNode
}

// Allow external FX chain to intercept master output
export function getMasterFxOut()  { _initFX(); return _fxOut }
export function rerouteMasterOut(dest) { _initFX(); try { _fxOut.disconnect() } catch {} _fxOut.connect(dest) }
export function restoreMasterOut() { _initFX(); try { _fxOut.disconnect() } catch {} _fxOut.connect(getCtx().destination) }

// ─── Effect control API — called from PluginsView ─────────────────────

export function setReverbEnabled(enabled) {
  masterFX.reverb.enabled = enabled
  _initFX()
  const now = getCtx().currentTime
  _rev.wet.gain.setTargetAtTime(enabled ? masterFX.reverb.wet : 0,                      now, 0.05)
  _rev.dry.gain.setTargetAtTime(enabled ? Math.max(0.4, 1 - masterFX.reverb.wet) : 1,   now, 0.05)
  _notifyFX()
}
export function setReverbWet(wet) {
  masterFX.reverb.wet = wet
  if (!_fxReady) { _notifyFX(); return }
  const now = getCtx().currentTime
  if (masterFX.reverb.enabled) {
    _rev.wet.gain.setTargetAtTime(wet, now, 0.05)
    _rev.dry.gain.setTargetAtTime(Math.max(0.4, 1 - wet), now, 0.05)
  }
  _notifyFX()
}

export function setDelayEnabled(enabled) {
  masterFX.delay.enabled = enabled
  _initFX()
  _del.wet.gain.setTargetAtTime(enabled ? masterFX.delay.wet : 0, getCtx().currentTime, 0.05)
  _notifyFX()
}
export function setDelayParam(key, val) {
  masterFX.delay[key] = val
  if (!_fxReady) { _notifyFX(); return }
  const now = getCtx().currentTime
  if (key === 'time')     _del.node.delayTime.setTargetAtTime(val, now, 0.01)
  if (key === 'feedback') _del.fb.gain.setTargetAtTime(val, now, 0.01)
  if (key === 'wet' && masterFX.delay.enabled) _del.wet.gain.setTargetAtTime(val, now, 0.05)
  _notifyFX()
}

export function setCompressorEnabled(enabled) {
  masterFX.compressor.enabled = enabled
  _initFX()
  const now = getCtx().currentTime
  _comp.threshold.setTargetAtTime(enabled ? masterFX.compressor.threshold : 0,  now, 0.05)
  _comp.ratio.setTargetAtTime(enabled ? masterFX.compressor.ratio : 1,           now, 0.05)
  _notifyFX()
}
export function setCompressorParam(key, val) {
  masterFX.compressor[key] = val
  if (!_fxReady) { _notifyFX(); return }
  const now = getCtx().currentTime
  if (key === 'threshold' && masterFX.compressor.enabled) _comp.threshold.setTargetAtTime(val, now, 0.01)
  if (key === 'ratio'     && masterFX.compressor.enabled) _comp.ratio.setTargetAtTime(val, now, 0.01)
  _notifyFX()
}

export function setDistortionEnabled(enabled) {
  masterFX.distortion.enabled = enabled
  _initFX()
  _dist.wet.gain.setTargetAtTime(enabled ? masterFX.distortion.wet : 0, getCtx().currentTime, 0.05)
  _notifyFX()
}
export function setDistortionParam(key, val) {
  masterFX.distortion[key] = val
  if (key === 'drive' && _fxReady) _dist.ws.curve = _distCurve(val)
  if (key === 'wet' && _fxReady && masterFX.distortion.enabled)
    _dist.wet.gain.setTargetAtTime(val, getCtx().currentTime, 0.05)
  _notifyFX()
}

export function setEQEnabled(enabled) {
  masterFX.eq.enabled = enabled
  _initFX()
  const now = getCtx().currentTime
  _eq.L.gain.setTargetAtTime(enabled ? masterFX.eq.low  : 0, now, 0.05)
  _eq.M.gain.setTargetAtTime(enabled ? masterFX.eq.mid  : 0, now, 0.05)
  _eq.H.gain.setTargetAtTime(enabled ? masterFX.eq.high : 0, now, 0.05)
  _notifyFX()
}
export function setEQBand(band, val) {
  masterFX.eq[band] = val
  if (!_fxReady) { _notifyFX(); return }
  const now = getCtx().currentTime
  if (masterFX.eq.enabled) {
    if (band === 'low')  _eq.L.gain.setTargetAtTime(val, now, 0.01)
    if (band === 'mid')  _eq.M.gain.setTargetAtTime(val, now, 0.01)
    if (band === 'high') _eq.H.gain.setTargetAtTime(val, now, 0.01)
  }
  _notifyFX()
}

// ─── BPM detection from AudioBuffer ──────────────────────────────────────
// Energy-based onset detection + autocorrelation to find tempo (60–180 BPM)

export async function detectBpm(file) {
  const c = getCtx()
  const arrayBuffer = await file.arrayBuffer()
  const audioBuffer = await c.decodeAudioData(arrayBuffer)

  const sr = audioBuffer.sampleRate
  const duration = Math.min(audioBuffer.duration, 60) // analyse first 60s
  const samples = Math.ceil(duration * sr)

  // Render through a low-pass filter (isolates kick/bass energy)
  const offline = new OfflineAudioContext(1, samples, sr)
  const src = offline.createBufferSource()
  // Trim buffer if longer than 60s
  if (audioBuffer.length > samples) {
    const trimmed = offline.createBuffer(1, samples, sr)
    trimmed.copyToChannel(audioBuffer.getChannelData(0).slice(0, samples), 0)
    src.buffer = trimmed
  } else {
    src.buffer = audioBuffer
  }
  const lpf = offline.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.value = 200
  src.connect(lpf)
  lpf.connect(offline.destination)
  src.start(0)
  const rendered = await offline.startRendering()
  const data = rendered.getChannelData(0)

  // Energy in 20ms windows
  const WIN = Math.round(sr * 0.02)
  const nWin = Math.floor(data.length / WIN)
  const energy = new Float32Array(nWin)
  for (let i = 0; i < nWin; i++) {
    let s = 0
    for (let j = 0; j < WIN; j++) s += data[i * WIN + j] ** 2
    energy[i] = s / WIN
  }

  // Onset function: rectified energy derivative
  const onsets = new Float32Array(nWin)
  for (let i = 1; i < nWin; i++) onsets[i] = Math.max(0, energy[i] - energy[i - 1])

  // Autocorrelation across BPM range 60–180
  const WIN_MS = 20
  const minLag = Math.round(60000 / 180 / WIN_MS)
  const maxLag = Math.round(60000 /  60 / WIN_MS)
  let bestBpm = 120, bestScore = -Infinity

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0
    for (let i = 0; i < nWin - lag; i++) score += onsets[i] * onsets[i + lag]
    if (score > bestScore) {
      bestScore = score
      bestBpm = Math.round(60000 / (lag * WIN_MS))
    }
  }

  // Prefer the half-time value if it falls in a more musical range (70–160)
  const half = Math.round(bestBpm / 2)
  if (half >= 70 && half <= 160) bestBpm = half

  return Math.max(40, Math.min(300, bestBpm))
}

// ─── MP3 export using lamejs ──────────────────────────────────────────────

export async function bufferToMp3Blob(audioBuffer, kbps = 128) {
  const { default: lamejs } = await import('lamejs')
  const nc = Math.min(audioBuffer.numberOfChannels, 2)
  const sr = audioBuffer.sampleRate
  const len = audioBuffer.length
  const encoder = new lamejs.Mp3Encoder(nc, sr, kbps)

  const toInt16 = (f32) => {
    const out = new Int16Array(f32.length)
    for (let i = 0; i < f32.length; i++)
      out[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)))
    return out
  }

  const left  = toInt16(audioBuffer.getChannelData(0))
  const right = nc > 1 ? toInt16(audioBuffer.getChannelData(1)) : left
  const parts = []
  const BLOCK = 1152

  for (let i = 0; i < len; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK)
    const r = right.subarray(i, i + BLOCK)
    const chunk = nc > 1 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l)
    if (chunk.length > 0) parts.push(new Uint8Array(chunk))
  }
  const flushed = encoder.flush()
  if (flushed.length > 0) parts.push(new Uint8Array(flushed))

  return new Blob(parts, { type: 'audio/mp3' })
}

// ─── Mastering Chain ──────────────────────────────────────────────────────────
// Wires in after _fxOut: transient → multiband → stereo imager → limiter → dest

export const masteringState = {
  multiband: {
    enabled: false,
    low:  { crossover: 250,  threshold: -20, ratio: 3.0, gain: 0, attack: 0.010, release: 0.150 },
    mid:  { crossover: 4000, threshold: -18, ratio: 2.5, gain: 0, attack: 0.010, release: 0.100 },
    high: {                  threshold: -16, ratio: 2.0, gain: 0, attack: 0.005, release: 0.080 },
  },
  stereoWidth: 100,   // 0 = mono, 100 = normal, 200 = max wide
  limiter: { enabled: true, threshold: -1.0, release: 0.05 },
  transient: { enabled: false, attack: 0, sustain: 0, sensitivity: 0.5 },
}

const _masterCbs = new Set()
export function onMasteringChange(cb) { _masterCbs.add(cb); return () => _masterCbs.delete(cb) }
function _notifyMastering() { _masterCbs.forEach(cb => cb(masteringState)) }

let _masteringReady = false
let _mbNodes        = null
let _imagerNodes    = null
let _masterLimiter  = null
let _lufsAnalyser   = null
let _specAnalyser   = null
let _tsNodes        = null   // transient shaper

function _initMastering() {
  if (_masteringReady) return
  _masteringReady = true
  _initFX()
  const c = getCtx()

  // Disconnect _fxOut from destination so we can insert the mastering chain
  try { _fxOut.disconnect(c.destination) } catch {}

  // ── Transient Shaper ────────────────────────────────────────────────────
  // Two parallel compressors: fast (shapes attack) + slow (shapes sustain)
  const tsIn      = c.createGain()
  const tsOut     = c.createGain()
  const tsDry     = c.createGain(); tsDry.gain.value  = 1
  const tsWet     = c.createGain(); tsWet.gain.value  = 0
  const tsFast    = c.createDynamicsCompressor()  // fast attack compressor
  const tsSlow    = c.createDynamicsCompressor()  // slow release compressor
  const tsAttGain = c.createGain(); tsAttGain.gain.value = 1
  const tsSusGain = c.createGain(); tsSusGain.gain.value = 1

  tsFast.threshold.value = -24; tsFast.ratio.value = 4;  tsFast.attack.value = 0.001; tsFast.release.value = 0.05; tsFast.knee.value = 6
  tsSlow.threshold.value = -24; tsSlow.ratio.value = 2;  tsSlow.attack.value = 0.1;   tsSlow.release.value = 0.5;  tsSlow.knee.value = 10

  _fxOut.connect(tsIn)
  tsIn.connect(tsDry);    tsDry.connect(tsOut)
  tsIn.connect(tsFast);   tsFast.connect(tsAttGain); tsAttGain.connect(tsWet)
  tsIn.connect(tsSlow);   tsSlow.connect(tsSusGain); tsSusGain.connect(tsWet)
  tsWet.connect(tsOut)
  _tsNodes = { tsIn, tsOut, tsDry, tsWet, tsFast, tsSlow, tsAttGain, tsSusGain }

  // ── Multiband Compressor ─────────────────────────────────────────────────
  const dryGain = c.createGain(); dryGain.gain.value = 1
  const wetSum  = c.createGain(); wetSum.gain.value  = 0

  const lpf1 = c.createBiquadFilter(); lpf1.type = 'lowpass';  lpf1.frequency.value = masteringState.multiband.low.crossover
  const lpf2 = c.createBiquadFilter(); lpf2.type = 'lowpass';  lpf2.frequency.value = masteringState.multiband.low.crossover
  const lowComp = c.createDynamicsCompressor()
  lowComp.threshold.value = masteringState.multiband.low.threshold
  lowComp.ratio.value     = masteringState.multiband.low.ratio
  lowComp.attack.value    = masteringState.multiband.low.attack
  lowComp.release.value   = masteringState.multiband.low.release
  lowComp.knee.value      = 3
  const lowPost = c.createGain(); lowPost.gain.value = 1

  const midHpf = c.createBiquadFilter(); midHpf.type = 'highpass'; midHpf.frequency.value = masteringState.multiband.low.crossover
  const midLpf = c.createBiquadFilter(); midLpf.type = 'lowpass';  midLpf.frequency.value = masteringState.multiband.mid.crossover
  const midComp = c.createDynamicsCompressor()
  midComp.threshold.value = masteringState.multiband.mid.threshold
  midComp.ratio.value     = masteringState.multiband.mid.ratio
  midComp.attack.value    = masteringState.multiband.mid.attack
  midComp.release.value   = masteringState.multiband.mid.release
  midComp.knee.value      = 3
  const midPost = c.createGain(); midPost.gain.value = 1

  const hpf1 = c.createBiquadFilter(); hpf1.type = 'highpass'; hpf1.frequency.value = masteringState.multiband.mid.crossover
  const hpf2 = c.createBiquadFilter(); hpf2.type = 'highpass'; hpf2.frequency.value = masteringState.multiband.mid.crossover
  const highComp = c.createDynamicsCompressor()
  highComp.threshold.value = masteringState.multiband.high.threshold
  highComp.ratio.value     = masteringState.multiband.high.ratio
  highComp.attack.value    = masteringState.multiband.high.attack
  highComp.release.value   = masteringState.multiband.high.release
  highComp.knee.value      = 3
  const highPost = c.createGain(); highPost.gain.value = 1

  tsOut.connect(dryGain)
  tsOut.connect(lpf1);   lpf1.connect(lpf2);   lpf2.connect(lowComp);  lowComp.connect(lowPost);  lowPost.connect(wetSum)
  tsOut.connect(midHpf); midHpf.connect(midLpf); midLpf.connect(midComp); midComp.connect(midPost); midPost.connect(wetSum)
  tsOut.connect(hpf1);   hpf1.connect(hpf2);   hpf2.connect(highComp); highComp.connect(highPost); highPost.connect(wetSum)

  _mbNodes = { dryGain, wetSum, low: { lpf1, lpf2, comp: lowComp, post: lowPost }, mid: { hpf: midHpf, lpf: midLpf, comp: midComp, post: midPost }, high: { hpf1, hpf2, comp: highComp, post: highPost } }

  // ── Stereo Imager ────────────────────────────────────────────────────────
  const imagerIn = c.createGain()
  dryGain.connect(imagerIn)
  wetSum.connect(imagerIn)

  const splitter = c.createChannelSplitter(2)
  const merger   = c.createChannelMerger(2)
  const dirL = c.createGain(); dirL.gain.value = 1
  const dirR = c.createGain(); dirR.gain.value = 1
  const xL   = c.createGain(); xL.gain.value   = 0
  const xR   = c.createGain(); xR.gain.value   = 0

  imagerIn.connect(splitter)
  splitter.connect(dirL, 0); dirL.connect(merger, 0, 0)
  splitter.connect(dirR, 1); dirR.connect(merger, 0, 1)
  splitter.connect(xL,   1); xL.connect(merger,  0, 0)
  splitter.connect(xR,   0); xR.connect(merger,  0, 1)
  _imagerNodes = { splitter, merger, dirL, dirR, xL, xR }

  // ── Limiter ──────────────────────────────────────────────────────────────
  _masterLimiter = c.createDynamicsCompressor()
  _masterLimiter.threshold.value = masteringState.limiter.threshold
  _masterLimiter.knee.value      = 0
  _masterLimiter.ratio.value     = 20
  _masterLimiter.attack.value    = 0.001
  _masterLimiter.release.value   = masteringState.limiter.release
  merger.connect(_masterLimiter)

  // ── LUFS Analyser (K-weighted approximation) ─────────────────────────────
  const kwShelf = c.createBiquadFilter(); kwShelf.type = 'highshelf'; kwShelf.frequency.value = 1500; kwShelf.gain.value = 4
  const kwHpf   = c.createBiquadFilter(); kwHpf.type   = 'highpass';  kwHpf.frequency.value  = 38;   kwHpf.Q.value = 0.5
  _lufsAnalyser  = c.createAnalyser();    _lufsAnalyser.fftSize = 4096; _lufsAnalyser.smoothingTimeConstant = 0

  _masterLimiter.connect(kwShelf); kwShelf.connect(kwHpf); kwHpf.connect(_lufsAnalyser)
  _lufsAnalyser.connect(c.destination)

  // ── Spectrum Analyser (post-master, high-res) ─────────────────────────────
  _specAnalyser = c.createAnalyser(); _specAnalyser.fftSize = 8192; _specAnalyser.smoothingTimeConstant = 0.75
  _masterLimiter.connect(_specAnalyser)
}

export function initMasteringChain() { _initMastering() }
export function getSpectrumAnalyser() { if (!_masteringReady) _initMastering(); return _specAnalyser }
export function getLufsAnalyser()     { if (!_masteringReady) _initMastering(); return _lufsAnalyser }
export function getMasterLimiterNode(){ if (!_masteringReady) _initMastering(); return _masterLimiter }

export function setStereoWidth(width) {
  masteringState.stereoWidth = Math.max(0, Math.min(200, width))
  if (!_masteringReady) { _notifyMastering(); return }
  const w = masteringState.stereoWidth / 100
  const direct = 0.5 + 0.5 * w
  const cross  = 0.5 - 0.5 * w
  const now = getCtx().currentTime
  _imagerNodes.dirL.gain.setTargetAtTime(direct, now, 0.05)
  _imagerNodes.dirR.gain.setTargetAtTime(direct, now, 0.05)
  _imagerNodes.xL.gain.setTargetAtTime(cross,   now, 0.05)
  _imagerNodes.xR.gain.setTargetAtTime(cross,   now, 0.05)
  _notifyMastering()
}

export function setMultibandEnabled(enabled) {
  masteringState.multiband.enabled = enabled
  if (!_masteringReady) { _initMastering(); return }
  const now = getCtx().currentTime
  _mbNodes.dryGain.gain.setTargetAtTime(enabled ? 0 : 1, now, 0.05)
  _mbNodes.wetSum.gain.setTargetAtTime( enabled ? 1 : 0, now, 0.05)
  _notifyMastering()
}

export function setMultibandBand(band, param, value) {
  masteringState.multiband[band][param] = value
  if (!_masteringReady) { _notifyMastering(); return }
  const n   = _mbNodes[band]
  const now = getCtx().currentTime
  if (param === 'threshold') n.comp.threshold.setTargetAtTime(value, now, 0.01)
  if (param === 'ratio')     n.comp.ratio.setTargetAtTime(value, now, 0.01)
  if (param === 'attack')    n.comp.attack.setTargetAtTime(value, now, 0.01)
  if (param === 'release')   n.comp.release.setTargetAtTime(value, now, 0.01)
  if (param === 'gain')      n.post.gain.setTargetAtTime(Math.pow(10, value / 20), now, 0.05)
  if (param === 'crossover' && band === 'low') {
    n.lpf1.frequency.setTargetAtTime(value, now, 0.01); n.lpf2.frequency.setTargetAtTime(value, now, 0.01)
    _mbNodes.mid.hpf.frequency.setTargetAtTime(value, now, 0.01)
  }
  if (param === 'crossover' && band === 'mid') {
    n.lpf.frequency.setTargetAtTime(value, now, 0.01)
    _mbNodes.high.hpf1.frequency.setTargetAtTime(value, now, 0.01); _mbNodes.high.hpf2.frequency.setTargetAtTime(value, now, 0.01)
  }
  _notifyMastering()
}

export function setLimiterEnabled(enabled) {
  masteringState.limiter.enabled = enabled
  if (!_masteringReady) { _notifyMastering(); return }
  const now = getCtx().currentTime
  _masterLimiter.ratio.setTargetAtTime(enabled ? 20 : 1, now, 0.05)
  _masterLimiter.threshold.setTargetAtTime(enabled ? masteringState.limiter.threshold : 0, now, 0.05)
  _notifyMastering()
}

export function setLimiterParam(param, value) {
  masteringState.limiter[param] = value
  if (!_masteringReady) { _notifyMastering(); return }
  const now = getCtx().currentTime
  if (param === 'threshold' && masteringState.limiter.enabled) _masterLimiter.threshold.setTargetAtTime(value, now, 0.01)
  if (param === 'release')   _masterLimiter.release.setTargetAtTime(value, now, 0.01)
  _notifyMastering()
}

export function setTransientEnabled(enabled) {
  masteringState.transient.enabled = enabled
  if (!_masteringReady) { _notifyMastering(); return }
  const now = getCtx().currentTime
  _tsNodes.tsDry.gain.setTargetAtTime(enabled ? 0 : 1, now, 0.05)
  _tsNodes.tsWet.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.05)
  _notifyMastering()
}

export function setTransientParam(param, value) {
  masteringState.transient[param] = value
  if (!_masteringReady) { _notifyMastering(); return }
  const now = getCtx().currentTime
  const s = masteringState.transient
  if (param === 'attack') {
    const att = s.attack / 100
    _tsNodes.tsAttGain.gain.setTargetAtTime(1 + att * 1.5, now, 0.05)
    _tsNodes.tsFast.attack.setTargetAtTime(Math.max(0.001, 0.02 * (1 - Math.abs(att))), now, 0.01)
  }
  if (param === 'sustain') {
    const sus = s.sustain / 100
    _tsNodes.tsSusGain.gain.setTargetAtTime(1 + sus, now, 0.05)
  }
  if (param === 'sensitivity') {
    const thresh = -60 + (1 - s.sensitivity) * 50
    _tsNodes.tsFast.threshold.setTargetAtTime(thresh, now, 0.01)
    _tsNodes.tsSlow.threshold.setTargetAtTime(thresh + 6,  now, 0.01)
  }
  _notifyMastering()
}
