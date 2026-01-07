import React, { useEffect, useState, useCallback, memo, useRef } from 'react';
import * as Tone from 'tone';
import { fetchContributions } from '../services/github';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useSequencer } from '../hooks/useSequencer';
import './GitSequencer.css';

// Memoized day cell to prevent unnecessary re-renders
const DayCell = memo(({ day, isPlaying }) => (
    <div
        className={`day-cell level-${day.level} ${isPlaying ? 'playing' : ''}`}
        title={`${day.date}: ${day.count} contribs`}
    />
));

// Memoized week column
const WeekCol = memo(({ week, weekIndex, isActive, activeNotes, style }) => (
    <div className={`week-col ${isActive ? 'active' : ''}`} style={style}>
        {week.days.map((day, dIndex) => (
            <DayCell
                key={dIndex}
                day={day}
                isPlaying={isActive && activeNotes.includes(dIndex)}
            />
        ))}
    </div>
));

const GitSequencer = () => {
    const [username, setUsername] = useState('');
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isMock, setIsMock] = useState(false);
    const [volume, setVolume] = useState(75);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const canvasRef = useRef(null);
    const inputRef = useRef(null);

    // Custom hooks for audio
    const audioEngine = useAudioEngine(username, volume);
    const sequencer = useSequencer(audioEngine);

    const {
        isPlaying,
        activeCol,
        activeNotes,
        scaleType,
        currentPattern,
        bpm,
        autoScale,
        toggle,
        stop,
        changeScale
    } = sequencer;

    // Focus input on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // State for animation (separate from actual loading)
    const [isAnimating, setIsAnimating] = useState(false);

    // State for toast notification
    const [showToast, setShowToast] = useState(false);

    // Auto-hide toast
    useEffect(() => {
        if (showToast) {
            const timer = setTimeout(() => setShowToast(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [showToast]);

    const loadData = async (user) => {
        setIsLoading(true);
        setIsAnimating(true);
        setError(null);

        // Start animation timer (3 waves x 2s = 6 seconds)
        const animationTimer = new Promise(resolve => setTimeout(resolve, 3000));

        // Fetch data
        const result = await fetchContributions(user);
        setData(result.data);
        setError(result.error);
        setIsMock(result.isMock);
        setIsLoading(false);

        // Wait for animation to complete
        await animationTimer;
        setIsAnimating(false);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (isPlaying) stop();
        loadData(username);
    };

    const handleScaleChange = (e) => {
        changeScale(e.target.value);
    };

    const handleTogglePlay = useCallback(() => {
        toggle(data);
    }, [toggle, data]);

    // Draw to hidden canvas for video export
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data) return;

        const ctx = canvas.getContext('2d');
        const CELL_SIZE = 12;
        const GAP = 3;
        const PADDING = 20;

        // Reset canvas size if needed (once or on resize)
        const gridWidth = PADDING * 2 + data.weeks.length * (CELL_SIZE + GAP);
        const gridHeight = PADDING * 2 + 7 * (CELL_SIZE + GAP);

        // Enforce 9:16 Aspect Ratio (Vertical/Social Media)
        let canvasWidth = gridWidth;
        let canvasHeight = gridHeight;

        // Since grid is wide, we typically need to increase height to match 9:16
        // Target ratio = 9/16 = 0.5625
        if (gridWidth / gridHeight > 9 / 16) {
            // Width is the constraint. Calculate height.
            canvasHeight = gridWidth * (16 / 9);
        } else {
            // Height is the constraint (unlikely for git graph). Calculate width.
            canvasWidth = gridHeight * (9 / 16);
        }

        // Center grid in canvas
        const offsetX = (canvasWidth - gridWidth) / 2;
        const offsetY = (canvasHeight - gridHeight) / 2;

        if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
        if (canvas.height !== canvasHeight) canvas.height = canvasHeight;

        // Background - Dark LCD Style
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw Grid
        data.weeks.forEach((week, wIndex) => {
            const x = offsetX + PADDING + wIndex * (CELL_SIZE + GAP);

            // Draw Column Highlight
            if (activeCol === wIndex) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fillRect(x - 1, offsetY + PADDING - 1, CELL_SIZE + GAP, 7 * (CELL_SIZE + GAP));
            }

            week.days.forEach((day, dIndex) => {
                const y = offsetY + PADDING + dIndex * (CELL_SIZE + GAP);

                // Determine Color - Green tones on dark (matching new CSS)
                let color = '#222'; // Level 0 - Dark
                if (day.level === 1) color = '#1a4a1a';
                if (day.level === 2) color = '#2a6a2a';
                if (day.level === 3) color = '#3a8a3a';
                if (day.level === 4) color = '#4aba4a';

                // Playing Highlight (Flash White)
                if (activeCol === wIndex && activeNotes.includes(dIndex)) {
                    color = '#ffffff';
                    // Optional: Add glow effect
                    ctx.shadowColor = 'white';
                    ctx.shadowBlur = 10;
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.fillStyle = color;

                // Draw rounded rect (simplified to rect for perf)
                ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            });
        });

    }, [data, activeCol, activeNotes]);

    // Export VIDEO recording (Universal Canvas Capture)
    const handleExport = async () => {
        if (isRecording) {
            // STOP RECORDING
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
            if (isPlaying) stop();
        } else {
            // START RECORDING
            try {
                // 1. Get Canvas Stream (30 FPS)
                const canvas = canvasRef.current;
                const canvasStream = canvas.captureStream(30);

                // 2. Get Tone.js Audio Stream
                const audioDest = Tone.context.createMediaStreamDestination();
                Tone.getDestination().connect(audioDest);
                await Tone.start();
                const toneStream = audioDest.stream;

                // 3. Merge Streams
                const tracks = [
                    ...canvasStream.getVideoTracks(),
                    ...toneStream.getAudioTracks()
                ];
                const combinedStream = new MediaStream(tracks);

                // 4. Setup Recorder
                // Try to find supported mime type (Prioritize MP4)
                let mimeType = 'video/mp4; codecs=h264,aac';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/mp4';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm; codecs=vp9';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm';
                }

                const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 2500000 }); // 2.5Mbps
                mediaRecorderRef.current = recorder;
                chunksRef.current = [];

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunksRef.current.push(e.data);
                };

                recorder.onstop = () => {
                    const blob = new Blob(chunksRef.current, { type: mimeType });
                    const url = URL.createObjectURL(blob);

                    // Determine extension
                    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `git-music-${username}.${ext}`;
                    a.click();
                    URL.revokeObjectURL(url);
                };

                // Start
                recorder.start();
                setIsRecording(true);

                // Auto-start playback
                if (!isPlaying && data) {
                    toggle(data);
                }

            } catch (err) {
                console.error("Recording failed:", err);
                setIsRecording(false);
                alert("Recording failed. Your browser might not support this feature.");
            }
        }
    };

    // URL to clipboard
    const handleShare = () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(username)}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            setShowToast(true);
        }).catch(() => {
            // Fallback
            try {
                const textArea = document.createElement("textarea");
                textArea.value = shareUrl;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setShowToast(true);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        });
    };

    // Load user from URL on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const userParam = params.get('user');
        if (userParam) {
            setUsername(userParam);
            loadData(userParam);
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Skip if typing in input
            if (e.target.tagName === 'INPUT') return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    handleTogglePlay();
                    break;
                case 'KeyR':
                    if (data) handleExport();
                    break;
                case 'KeyS':
                    if (data) handleShare();
                    break;
                case 'Escape':
                    if (isPlaying) stop();
                    if (isRecording) handleExport();
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleTogglePlay, data, isPlaying, isRecording, stop, handleExport, handleShare]);

    return (
        <div className="terminal-window">
            {/* Toast Notification */}
            <div className={`toast-notification ${showToast ? 'show' : ''}`}>
                Link copied to clipboard
            </div>

            {/* Simple Header */}
            <div className="header-box">
                <div className="header-title">
                    <span className="header-line">───</span>
                    <span className="header-text">Git Music</span>
                    <span className="header-version">v1.0.0</span>
                    <span className="header-line">────────────────────</span>
                </div>
                <div className="header-subtitle">
                    Turn your GitHub contributions into music
                </div>
            </div>

            {/* Command Input */}
            <div className="command-section">
                <form onSubmit={handleSearch} className="command-line">
                    <span className="prompt">$</span>
                    <span className="cmd">git-music fetch</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="username"
                        disabled={isLoading}
                        autoComplete="off"
                        spellCheck="false"
                    />
                </form>

                {/* Status Message - always reserve space */}
                <div className="status-msg">
                    {isAnimating ? (
                        <span className="dim">Loading...</span>
                    ) : error ? (
                        <span className="error">✗ {error}</span>
                    ) : data && !isMock ? (
                        <span className="success">✓ loaded {data.weeks.length} weeks</span>
                    ) : (
                        <span className="dim">Enter a GitHub username to load data ↑</span>
                    )}
                </div>
            </div>

            {/* Contribution Graph */}
            <div className="graph-section">
                {data && !isAnimating && !error ? (
                    <div className="graph-grid">
                        {data.weeks.map((week, wIndex) => (
                            <WeekCol
                                key={wIndex}
                                week={week}
                                weekIndex={wIndex}
                                isActive={activeCol === wIndex}
                                activeNotes={activeCol === wIndex ? activeNotes : []}
                                style={{ '--col-index': wIndex }}
                            />
                        ))}
                    </div>
                ) : (
                    <div className={`graph-grid empty ${isAnimating ? 'loading' : ''} ${error && !isAnimating ? 'error' : ''}`}>
                        {/* Empty 52x7 grid placeholder */}
                        {Array.from({ length: 52 }).map((_, wIndex) => (
                            <div
                                key={wIndex}
                                className="week-col"
                            >
                                {Array.from({ length: 7 }).map((_, dIndex) => (
                                    <div
                                        key={dIndex}
                                        className="day-cell"
                                        style={{ '--cell-index': wIndex + dIndex * 2 }}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="controls-row">
                <button
                    className={`ctrl-btn ${isPlaying ? 'active' : ''}`}
                    onClick={handleTogglePlay}
                    disabled={!data || isAnimating || error}
                >
                    {isPlaying ? '■ Stop' : '▶ Play'}
                </button>
                <button
                    className={`ctrl-btn ${isRecording ? 'recording' : ''}`}
                    onClick={handleExport}
                    disabled={!data || isAnimating || error}
                >
                    {isRecording ? '● Stop' : '○ Record'}
                </button>
                <button
                    className="ctrl-btn"
                    onClick={handleShare}
                    disabled={!data || isAnimating || error}
                    title="Copy link to clipboard"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy
                </button>
            </div>

            {/* Footer hint */}
            <div className="footer-hint">
                {data && !isAnimating && !error
                    ? 'Space: play · R: record · S: share · Esc: stop'
                    : '\u00A0'
                }
            </div>

            {/* Hidden Canvas */}
            <canvas
                ref={canvasRef}
                style={{ position: 'fixed', top: '-10000px', left: '-10000px', pointerEvents: 'none' }}
            />
        </div>
    );
};

export default GitSequencer;
