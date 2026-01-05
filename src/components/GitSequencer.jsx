import React, { useEffect, useState, useCallback, memo } from 'react';
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

    // Export audio recording
    const handleExport = async () => {
        if (isRecording) {
            // Stop recording and download
            const recording = await audioEngine.stopRecording();
            if (recording) {
                const url = URL.createObjectURL(recording);
                const a = document.createElement('a');
                a.href = url;
                a.download = `git-music-${username}.webm`;
                a.click();
                URL.revokeObjectURL(url);
            }
            setIsRecording(false);
        } else {
            // Start recording
            await audioEngine.startRecording();
            setIsRecording(true);
            // Auto-start playback when recording
            if (!isPlaying && data) {
                toggle(data);
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

                    <select value={autoScale ? 'auto' : scaleType} onChange={handleScaleChange}>
                        <option value="auto">Auto Scale</option>
                        <option value="pentatonic">Pentatonic (Zen)</option>
                        <option value="lydian">Lydian (Dreamy)</option>
                        <option value="dorian">Dorian (Focus)</option>
                        <option value="phrygianDom">Phrygian Dom (Intense)</option>
                    </select>

                    <div className="volume-control">
                        <label htmlFor="volume">Vol</label>
                        <input
                            id="volume"
                            type="range"
                            min="0"
                            max="100"
                            value={volume}
                            onChange={(e) => setVolume(Number(e.target.value))}
                        />
                    </div>

                    <div className="status-display">
                        <span className="bpm-display">{bpm} BPM</span>
                        {isPlaying && <span className="mood-display">{currentPattern}</span>}
                    </div>
                </div>

                <div className="share-controls">
                    <button
                        className={`export-btn ${isRecording ? 'recording' : ''}`}
                        onClick={handleExport}
                        disabled={isLoading || !data}
                    >
                        {isRecording ? '⏹ Stop & Save' : '⏺ Record'}
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
        </div>
    );
};

export default GitSequencer;
