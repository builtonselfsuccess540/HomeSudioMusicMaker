import { useState, useEffect, useCallback } from 'react'
import {
  startRecording as engineStart,
  stopRecording as engineStop,
  playRecording as enginePlay,
  stopPlayback,
  deleteRecording as engineDelete,
  downloadRecording as engineDownload,
  onWaveform,
  onRecordingChange,
  onClipsChange,
  getIsRecording,
  getRecordings,
} from '../audio/audioEngine'

export function useAudio() {
  const [isRecording, setIsRecording] = useState(getIsRecording)
  const [waveformData, setWaveformData] = useState(new Float32Array(128))
  const [recordings, setRecordings] = useState(getRecordings)
  const [recordingError, setRecordingError] = useState(null)
  const [playingId, setPlayingId] = useState(null)

  useEffect(() => {
    const unsubWave = onWaveform((data) => setWaveformData(data))
    const unsubRec = onRecordingChange((val) => setIsRecording(val))
    const unsubClips = onClipsChange((clips) => setRecordings(clips))
    return () => { unsubWave(); unsubRec(); unsubClips() }
  }, [])

  const startRecording = useCallback(async () => {
    setRecordingError(null)
    const err = await engineStart()
    if (err) setRecordingError(err)
  }, [])

  const stopRecording = useCallback(() => {
    engineStop()
  }, [])

  const playRecording = useCallback((id, url) => {
    const audio = enginePlay(url)
    setPlayingId(id)
    audio.onended = () => setPlayingId(null)
  }, [])

  const stopPlaybackHook = useCallback(() => {
    stopPlayback()
    setPlayingId(null)
  }, [])

  const deleteRecording = useCallback((id) => {
    engineDelete(id)
  }, [])

  const downloadRecording = useCallback((id) => {
    engineDownload(id)
  }, [])

  return {
    isRecording,
    waveformData,
    recordings,
    recordingError,
    playingId,
    startRecording,
    stopRecording,
    playRecording,
    stopPlayback: stopPlaybackHook,
    deleteRecording,
    downloadRecording,
  }
}
