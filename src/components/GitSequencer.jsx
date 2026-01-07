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
const WeekCol = memo(({ week, weekIndex, isActive, activeNotes }) => (
    <div className={`week-col ${isActive ? 'active' : ''}`}>
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
    const [username, setUsername] = useState('torvalds');
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isMock, setIsMock] = useState(false);
    const [volume, setVolume] = useState(75);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const canvasRef = useRef(null);

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

    // Load contribution data
    useEffect(() => {
        loadData(username);
    }, []);

    const loadData = async (user) => {
        setIsLoading(true);
        setError(null);
        const result = await fetchContributions(user);
        setData(result.data);
        setError(result.error);
        setIsMock(result.isMock);
        setIsLoading(false);
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

        // Background
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw Grid
        data.weeks.forEach((week, wIndex) => {
            const x = offsetX + PADDING + wIndex * (CELL_SIZE + GAP);

            // Draw Column Highlight
            if (activeCol === wIndex) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fillRect(x - 1, offsetY + PADDING - 1, CELL_SIZE + GAP, 7 * (CELL_SIZE + GAP));
            }

            week.days.forEach((day, dIndex) => {
                const y = offsetY + PADDING + dIndex * (CELL_SIZE + GAP);

                // Determine Color
                let color = '#161b22'; // Level 0
                if (day.level === 1) color = '#0e4429';
                if (day.level === 2) color = '#006d32';
                if (day.level === 3) color = '#26a641';
                if (day.level === 4) color = '#39d353';

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

    // Generate shareable URL
    const handleShare = async () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(username)}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Git Music - ${username}`,
                    text: `Listen to ${username}'s GitHub contributions as music!`,
                    url: shareUrl
                });
            } catch (err) {
                // User cancelled or error - fall back to clipboard
                copyToClipboard(shareUrl);
            }
        } else {
            copyToClipboard(shareUrl);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            alert('Link copied to clipboard!');
        }).catch(() => {
            prompt('Copy this link:', text);
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
            if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                handleTogglePlay();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleTogglePlay]);

    return (
        <div className="sequencer-container">
            <header>
                <h1>Git Music 🎵</h1>
                <form onSubmit={handleSearch}>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="GitHub Username"
                        disabled={isLoading}
                    />
                    <button type="submit" disabled={isLoading}>
                        {isLoading ? 'Loading...' : 'Load'}
                    </button>
                </form>

                {error && (
                    <div className="error-message">
                        {error} — Playing random demo data instead.
                    </div>
                )}

                {!error && isMock && (
                    <div className="info-message">
                        Playing demo data. Enter a GitHub username to load real contributions.
                    </div>
                )}

                <div className="controls">
                    <button
                        className={`play-btn ${isPlaying ? 'active' : ''}`}
                        onClick={handleTogglePlay}
                        disabled={isLoading || !data}
                    >
                        {isPlaying ? 'STOP' : 'PLAY'}
                    </button>
                </div>

                <div className="share-controls">
                    <button
                        className={`export-btn ${isRecording ? 'recording' : ''}`}
                        onClick={handleExport}
                        disabled={isLoading || !data}
                        title="Record Video"
                    >
                        {isRecording ? '⏹ Stop' : '⏺ Record'}
                    </button>
                    <button
                        className="share-btn"
                        onClick={handleShare}
                        disabled={isLoading || !data}
                    >
                        🔗 Share
                    </button>
                </div>
            </header>

            {isLoading && !data ? (
                <div className="loading-state">Loading contribution graph...</div>
            ) : data ? (
                <div className="graph-grid">
                    {data.weeks.map((week, wIndex) => (
                        <WeekCol
                            key={wIndex}
                            week={week}
                            weekIndex={wIndex}
                            isActive={activeCol === wIndex}
                            activeNotes={activeCol === wIndex ? activeNotes : []}
                        />
                    ))}
                </div>
            ) : null}
            {/* Hidden Canvas for Video Recording */}
            <canvas
                ref={canvasRef}
                style={{ position: 'fixed', top: '-10000px', left: '-10000px', pointerEvents: 'none' }}
            />
        </div>
    );
};

export default GitSequencer;
