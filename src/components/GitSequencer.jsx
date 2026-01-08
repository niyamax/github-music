import React, { useEffect, useState, useCallback, memo, useRef, forwardRef } from 'react';
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

// Memoized week column with forwardRef to allow scrolling to it
const WeekCol = memo(forwardRef(({ week, weekIndex, isActive, activeNotes, style }, ref) => (
    <div ref={ref} className={`week-col ${isActive ? 'active' : ''}`} style={style}>
        {week.days.map((day, dIndex) => (
            <DayCell
                key={dIndex}
                day={day}
                isPlaying={isActive && activeNotes.includes(dIndex)}
            />
        ))}
    </div>
)));

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

    // Auto-scroll graph
    const graphSectionRef = useRef(null);
    const activeWeekRef = useRef(null);

    useEffect(() => {
        if (activeCol !== null && activeWeekRef.current && graphSectionRef.current) {
            // Check if user is on mobile/overflowing
            const section = graphSectionRef.current;
            if (section.scrollWidth > section.clientWidth) {
                // Scroll strictly to center active element
                const sectionRect = section.getBoundingClientRect();
                const activeRect = activeWeekRef.current.getBoundingClientRect();

                const relativeLeft = activeRect.left - sectionRect.left;
                const scrollLeft = section.scrollLeft;

                // Desired position: center of container
                const targetLeft = scrollLeft + relativeLeft - (section.clientWidth / 2) + (activeRect.width / 2);

                section.scrollTo({
                    left: targetLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeCol]);

    const handleTogglePlay = useCallback(() => {
        toggle(data);
    }, [toggle, data]);

    // Draw to hidden canvas for video export (exact mobile layout, HQ 1080x1920)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data) return;

        const ctx = canvas.getContext('2d');

        // Colors from CSS variables (exact match)
        const colors = {
            bg: '#0d0d0d',
            accent: '#f23400',
            text: '#aaaaaa',
            textDim: '#555555',
            textBright: '#ffffff',
            accentCyan: '#66cccc',
            accentYellow: '#dcdcaa',
            success: '#4ec9b0',
            level0: '#1a1a1a',
            level1: '#0e4429',
            level2: '#006d32',
            level3: '#26a641',
            level4: '#39d353',
        };

        // HQ resolution (3x scale for 1080p)
        const scale = 3;
        const CELL_SIZE = 10 * scale;
        const GAP = 3 * scale;
        const PADDING = 8 * scale; // 0.5rem on mobile

        // Full HD portrait (1080x1920)
        const canvasWidth = 1080;
        const canvasHeight = 1920;

        if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
        if (canvas.height !== canvasHeight) canvas.height = canvasHeight;

        // Exact mobile CSS spacing (base 16px, scaled 3x)
        // .header-fieldset: padding 0.75rem 1rem, margin-bottom 1rem
        // .header-content: gap 1rem
        // .command-section: margin-bottom 1.5rem
        // .status-msg: margin-top 0.5rem
        // .graph-section: margin-bottom 2rem

        const fieldsetPaddingX = 16 * scale;  // 1rem
        const fieldsetPaddingY = 12 * scale;  // 0.75rem
        const fieldsetMarginBottom = 16 * scale;  // 1rem
        const headerContentGap = 16 * scale;  // 1rem
        const statusMarginTop = 8 * scale;  // 0.5rem
        const graphMarginTop = 24 * scale;  // 1.5rem (command-section margin-bottom)

        // Calculate fieldset content height
        const asciiHeight = 4 * 9 * scale;  // 4 lines at ~9px each
        const subtitleHeight = 14 * scale;
        const fieldsetContentHeight = asciiHeight + headerContentGap + subtitleHeight;
        const fieldsetHeight = fieldsetPaddingY * 2 + fieldsetContentHeight;

        // Calculate total content height for vertical centering
        const commandLineHeight = 15 * scale;
        const statusLineHeight = 14 * scale;
        const gridHeight = 7 * (CELL_SIZE + GAP);

        const totalContentHeight =
            fieldsetHeight +
            fieldsetMarginBottom +
            commandLineHeight +
            statusMarginTop +
            statusLineHeight +
            graphMarginTop +
            gridHeight;

        // Vertical offset to center content
        const offsetY = (canvasHeight - totalContentHeight) / 2;

        // Background
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        let currentY = offsetY;

        // ===== FIELDSET HEADER =====
        const fieldsetWidth = canvasWidth - PADDING * 2;

        // Fieldset border
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = scale;
        ctx.beginPath();
        ctx.roundRect(PADDING, currentY, fieldsetWidth, fieldsetHeight, 4 * scale);
        ctx.stroke();

        // Legend background
        ctx.fillStyle = colors.bg;
        ctx.fillRect(PADDING + 8 * scale, currentY - 8 * scale, 145 * scale, 16 * scale);

        // Legend text: "GitHub Music v1.0.0"
        ctx.textAlign = 'left';
        ctx.fillStyle = colors.accent;
        ctx.font = `bold ${16 * scale}px monospace`;  // 1rem on mobile
        ctx.fillText('GitHub Music', PADDING + 12 * scale, currentY + 4 * scale);
        ctx.fillStyle = colors.textDim;
        ctx.font = `${12 * scale}px monospace`;
        ctx.fillText('v1.0.0', PADDING + 130 * scale, currentY + 4 * scale);

        // ASCII art (centered in fieldset) - font-size: 0.55rem = ~9px
        const asciiStartY = currentY + fieldsetPaddingY + 10 * scale;
        ctx.fillStyle = colors.accent;
        ctx.font = `${9 * scale}px monospace`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.8;
        const asciiLines = [
            '   ♫       ♪',
            ' ▄ █ ▄ █ ▄ █',
            ' █ █ █ █ █ █',
            ' ▀ ▀ ▀ ▀ ▀ ▀'
        ];
        asciiLines.forEach((line, i) => {
            ctx.fillText(line, canvasWidth / 2, asciiStartY + i * 9 * scale);
        });
        ctx.globalAlpha = 1;

        // Subtitle (centered) - font-size: 0.85rem = ~14px
        const subtitleY = asciiStartY + asciiHeight + headerContentGap;
        ctx.fillStyle = colors.accent;
        ctx.font = `bold ${14 * scale}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('Turn your GitHub contributions into music', canvasWidth / 2, subtitleY);

        currentY += fieldsetHeight + fieldsetMarginBottom;

        // ===== COMMAND LINE (left-aligned) - font-size: 15px =====
        ctx.textAlign = 'left';
        ctx.fillStyle = colors.accentCyan;
        ctx.font = `${15 * scale}px monospace`;
        ctx.fillText('$', PADDING + fieldsetPaddingX, currentY);

        ctx.fillStyle = colors.accentYellow;
        ctx.fillText('git-music fetch', PADDING + fieldsetPaddingX + 18 * scale, currentY);

        ctx.fillStyle = colors.textBright;
        ctx.fillText(username, PADDING + fieldsetPaddingX + 170 * scale, currentY);

        currentY += commandLineHeight + statusMarginTop;

        // ===== STATUS MESSAGE (left-aligned) - font-size: 14px, margin-top: 0.5rem =====
        ctx.fillStyle = colors.success;
        ctx.font = `${14 * scale}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`✓ loaded ${data.weeks.length} weeks`, PADDING + fieldsetPaddingX, currentY);

        currentY += statusLineHeight + graphMarginTop;

        // ===== CONTRIBUTION GRID WITH SCROLL =====
        const gridTotalWidth = data.weeks.length * (CELL_SIZE + GAP);
        const visibleWidth = canvasWidth - (PADDING + fieldsetPaddingX) * 2;

        // Calculate scroll offset to center active column
        let scrollOffset = 0;
        if (activeCol !== null && gridTotalWidth > visibleWidth) {
            const activeX = activeCol * (CELL_SIZE + GAP);
            const centerOffset = visibleWidth / 2 - CELL_SIZE / 2;
            scrollOffset = Math.max(0, Math.min(activeX - centerOffset, gridTotalWidth - visibleWidth));
        }

        // Clip region for grid
        ctx.save();
        ctx.beginPath();
        ctx.rect(PADDING + fieldsetPaddingX, currentY, visibleWidth, gridHeight + 5 * scale);
        ctx.clip();

        // Draw Grid with scroll offset
        data.weeks.forEach((week, wIndex) => {
            const x = PADDING + fieldsetPaddingX + wIndex * (CELL_SIZE + GAP) - scrollOffset;

            // Skip if outside visible area
            if (x + CELL_SIZE < PADDING + fieldsetPaddingX || x > canvasWidth - PADDING - fieldsetPaddingX) return;

            week.days.forEach((day, dIndex) => {
                const y = currentY + dIndex * (CELL_SIZE + GAP);

                // Determine Color
                let color = colors.level0;
                if (day.level === 1) color = colors.level1;
                if (day.level === 2) color = colors.level2;
                if (day.level === 3) color = colors.level3;
                if (day.level === 4) color = colors.level4;

                // Playing Highlight
                if (activeCol === wIndex && activeNotes.includes(dIndex)) {
                    color = colors.textBright;
                    ctx.shadowColor = colors.textBright;
                    ctx.shadowBlur = 12 * scale;
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.roundRect(x, y, CELL_SIZE, CELL_SIZE, 2 * scale);
                ctx.fill();
            });
        });

        ctx.restore();
        ctx.shadowBlur = 0;

        // ===== FOOTER WITH PRODUCTION LINK =====
        ctx.fillStyle = colors.textDim;
        ctx.font = `${13 * scale}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('github-music.pages.dev', canvasWidth / 2, canvasHeight - 40 * scale);

    }, [data, activeCol, activeNotes, username]);

    // Export VIDEO recording (Universal Canvas Capture)
    const handleExport = async () => {
        if (isRecording) {
            // STOP RECORDING
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
            stop(); // Always stop playback when recording ends
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

                const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 8000000 }); // 8Mbps for HQ
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

                // Start playback for recording (audio will be captured)
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
            {/* Simple Fieldset Header */}
            <fieldset className="header-fieldset">
                <legend className="header-legend">
                    <span className="header-title">GitHub Music</span> <span className="header-version">v1.0.0</span>
                </legend>

                <div className="header-content">
                    <div className="header-left">
                        <pre className="header-ascii">{`   ♫       ♪
 ▄ █ ▄ █ ▄ █
 █ █ █ █ █ █
 ▀ ▀ ▀ ▀ ▀ ▀`}</pre>
                    </div>

                    <div className="header-divider"></div>

                    <div className="header-right">
                        <div className="header-section">
                            <div className="header-label">Turn your GitHub contributions into music</div>
                        </div>
                    </div>
                </div>
            </fieldset>

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
                        onBlur={() => {
                            if (username && username.length >= 2 && !isLoading) {
                                if (isPlaying) stop();
                                loadData(username);
                            }
                        }}
                        placeholder="username"
                        disabled={isLoading}
                        autoComplete="off"
                        spellCheck="false"
                        autoFocus
                        inputMode="text"
                        autoCapitalize="none"
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
            <div className="graph-section" ref={graphSectionRef}>
                {data && !isAnimating && !error ? (
                    <div className="graph-grid">
                        {data.weeks.map((week, wIndex) => (
                            <WeekCol
                                key={wIndex}
                                ref={activeCol === wIndex ? activeWeekRef : null}
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
                    className={`ctrl-btn ${isPlaying && !isRecording ? 'active' : ''}`}
                    onClick={handleTogglePlay}
                    disabled={!data || isAnimating || error || isRecording}
                >
                    {isPlaying && !isRecording ? '■ Stop' : '▶ Play'}
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
