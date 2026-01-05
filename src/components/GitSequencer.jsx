import React, { useEffect, useState, useRef } from 'react';
import * as Tone from 'tone';
import { fetchContributions } from '../services/github';
import './GitSequencer.css';

const SCALES = {
    pentatonic: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5'],      // Low: Zen
    lydian: ['C4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4'],         // Med: Dreamy
    dorian: ['C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4'],        // High: Focus
    phrygianDom: ['C4', 'Db4', 'E4', 'F4', 'G4', 'Ab4', 'Bb4']   // Extreme: Intense
};

const CHORD_ROOTS = {
    pentatonic: ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4'],
    lydian: ['C3', 'D3', 'E3', 'F#3', 'G3', 'A3', 'B3'],
    dorian: ['C3', 'D3', 'Eb3', 'F3', 'G3', 'A3', 'Bb3'],
    phrygianDom: ['C3', 'Db3', 'E3', 'F3', 'G3', 'Ab3', 'Bb3']
};

const VELOCITIES = [0, 0.3, 0.5, 0.8, 1.0]; // Level 0-4

// Helper: Deterministic hash for synth type
const getSignatureOscillator = (username) => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const oscTypes = ['triangle', 'sawtooth', 'square', 'sine']; // 'pulse' can be tricky without width
    return oscTypes[Math.abs(hash) % oscTypes.length];
};

const GitSequencer = () => {
    const [username, setUsername] = useState('torvalds');
    const [data, setData] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeCol, setActiveCol] = useState(-1);
    const [activeNotes, setActiveNotes] = useState([]); // Array of day indices (0-7) playing now
    const [scaleType, setScaleType] = useState('pentatonic');
    const [currentPattern, setCurrentPattern] = useState('Zen');

    // Refs
    const scaleTypeRef = useRef('pentatonic');
    const synthRef = useRef(null);
    const padSynthRef = useRef(null);
    const drumSynthRef = useRef(null);
    const metalSynthRef = useRef(null);
    const sequenceRef = useRef(null);

    useEffect(() => {
        // Master Limiter to prevent clipping
        const limiter = new Tone.Limiter(-3).toDestination();

        // Signature Synth (Oscillator depends on Username)
        const oscType = getSignatureOscillator(username);

        // Lead Synth
        synthRef.current = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: oscType },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
        }).connect(limiter);
        synthRef.current.volume.value = -6;

        // Pad Synth
        padSynthRef.current = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 2 }
        }).connect(limiter);
        padSynthRef.current.volume.value = -12;

        // Drum Synth (Kick & Snare)
        drumSynthRef.current = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 10,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
        }).connect(limiter);
        drumSynthRef.current.volume.value = -6;

        // Metal Synth (HiHats)
        metalSynthRef.current = new Tone.MetalSynth({
            frequency: 200,
            envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5
        }).connect(limiter);
        metalSynthRef.current.volume.value = -15; // Quiet hats

        return () => {
            if (synthRef.current) synthRef.current.dispose();
            if (padSynthRef.current) padSynthRef.current.dispose();
            if (drumSynthRef.current) drumSynthRef.current.dispose();
            if (metalSynthRef.current) metalSynthRef.current.dispose();
            if (sequenceRef.current) sequenceRef.current.dispose();
            limiter.dispose();
        };
    }, [username]); // Re-init synth if username changes (for signature sound)

    useEffect(() => {
        loadData(username);
    }, []);

    const loadData = async (user) => {
        const graphData = await fetchContributions(user);
        setData(graphData);
    };

    const togglePlay = async () => {
        await Tone.start();

        if (isPlaying) {
            Tone.Transport.stop();
            if (sequenceRef.current) sequenceRef.current.stop();
            setIsPlaying(false);
            setActiveCol(-1);
        } else {
            if (!data) return;

            // Setup Sequence
            const cols = data.weeks.map((week, i) => i);

            if (sequenceRef.current) sequenceRef.current.dispose();

            sequenceRef.current = new Tone.Sequence((time, colIndex) => {
                setActiveCol(colIndex);

                const week = data.weeks[colIndex];
                if (!week) return;

                // --- CHORD PAD LOGIC ---
                // Trigger every 4 columns (1 Bar)
                if (colIndex % 4 === 0) {
                    // Look ahead 4 columns to find a "Root" contribution
                    let foundRootIndex = 0; // Default to C (first note)
                    let maxLevel = -1;

                    // Scan next 4 weeks (or less if end of graph)
                    for (let i = 0; i < 4; i++) {
                        const targetWeek = data.weeks[colIndex + i];
                        if (targetWeek) {
                            // Find highest contribution in this week
                            targetWeek.days.forEach((d, idx) => {
                                // We prefer high contributions for roots
                                if (d.level > 2 && d.level > maxLevel) {
                                    maxLevel = d.level;
                                    foundRootIndex = idx; // 0-6 (Mon-Sun)
                                }
                            });
                        }
                    }

                    // If no high contribution found, fallback to just the first available note or random
                    if (maxLevel === -1) {
                        // Simple fallback: first day of current week
                        foundRootIndex = 0;
                    }

                    // Build Triad (Root, +2, +4 scale degrees)
                    const currentRoots = CHORD_ROOTS[scaleTypeRef.current] || CHORD_ROOTS.major;
                    const rootNote = currentRoots[foundRootIndex % 7];
                    const thirdNote = currentRoots[(foundRootIndex + 2) % 7];
                    const fifthNote = currentRoots[(foundRootIndex + 4) % 7];

                    // Trigger Pad
                    padSynthRef.current.triggerAttackRelease([rootNote, thirdNote, fifthNote], "1n", time);
                }

                // --- DRUM LOGIC ---
                // Calculate "Activity Level" for this bar (4 columns) to determine intensity
                // We need the activity of the block we are currently IN.
                const blockStart = Math.floor(colIndex / 4) * 4;
                let currentBlockActivity = 0;
                for (let i = 0; i < 4; i++) {
                    if (data.weeks[blockStart + i]) {
                        data.weeks[blockStart + i].days.forEach(d => currentBlockActivity += d.level);
                    }
                }

                // Determine Mood/Scale based on Activity
                let newScale = 'pentatonic';
                let patternName = 'Zen (Low)';

                if (currentBlockActivity > 50) {
                    newScale = 'phrygianDom';
                    patternName = 'Intense (Extreme)';
                } else if (currentBlockActivity > 30) {
                    newScale = 'dorian';
                    patternName = 'Focus (High)';
                } else if (currentBlockActivity > 10) {
                    newScale = 'lydian';
                    patternName = 'Dreamy (Med)';
                }

                // Update State (beat 0 only to avoid flicker/perf issues)
                const beat = colIndex % 4;
                if (beat === 0) {
                    setScaleType(newScale);
                    scaleTypeRef.current = newScale;
                    setCurrentPattern(patternName);
                }

                // 4-step pattern
                // const beat = colIndex % 4; // Already declared above

                // Thresholds: Determine "Hype" level
                const isBusy = currentBlockActivity > 15; // High activity
                const isMedium = currentBlockActivity > 5; // Medium activity

                if (beat === 0) {
                    // Kick (Always)
                    drumSynthRef.current.triggerAttackRelease("C1", "8n", time);
                } else if (beat === 2) {
                    // Snare (Only if Medium or Busy)
                    if (isMedium) {
                        drumSynthRef.current.triggerAttackRelease("G2", "8n", time);
                    }
                } else {
                    // HiHats
                    if (isBusy) {
                        // Busy: Play hats on every off-beat (1, 3) AND maybe ghost notes? 
                        // Let's just do hats on 1 & 3 but louder/sharper
                        metalSynthRef.current.triggerAttackRelease("32n", time, 0.3);
                    } else if (isMedium && (beat === 1 || beat === 3)) {
                        // Medium: Standard hats on 2 & 4 (which are beat 1 & 3 in 0-index)
                        metalSynthRef.current.triggerAttackRelease("32n", time, 0.2);
                    }
                }

                // --- MELODY LOGIC ---
                // Calculate density for the current week column
                let weekDensity = 0;
                week.days.forEach(d => weekDensity += d.level);

                // If Busy Week (>10), use Random Sampling of 1-3 notes
                if (weekDensity > 10) {
                    const activeDays = week.days
                        .map((d, i) => ({ day: d, index: i }))
                        .filter(item => item.day.level > 0);

                    // Shuffle array
                    for (let i = activeDays.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [activeDays[i], activeDays[j]] = [activeDays[j], activeDays[i]];
                    }

                    // Pick 1 to 3 notes randomly
                    const noteCount = 1 + Math.floor(Math.random() * 3);
                    const selectedNotes = activeDays.slice(0, noteCount);

                    selectedNotes.forEach(({ day, index }) => {
                        const currentScale = SCALES[scaleTypeRef.current] || SCALES.major;
                        const noteIndex = (index + day.level) % currentScale.length; // Smart Pitching
                        const note = currentScale[noteIndex];
                        const vel = VELOCITIES[day.level] || 0.5;
                        synthRef.current.triggerAttackRelease(note, "8n", time, vel);
                    });

                    // Visual Sync (Granular)
                    Tone.Draw.schedule(() => {
                        setActiveCol(colIndex);
                        setActiveNotes(selectedNotes.map(n => n.index));
                    }, time);

                } else {
                    // Normal playback for chill weeks (Play all active notes)
                    const playingIndices = [];
                    week.days.forEach((day, dayIndex) => {
                        if (day.level > 0) {
                            playingIndices.push(dayIndex);
                            const currentScale = SCALES[scaleTypeRef.current] || SCALES.major;

                            // Smart Pitching
                            const noteIndex = (dayIndex + day.level) % currentScale.length;
                            const note = currentScale[noteIndex];

                            const vel = VELOCITIES[day.level] || 0.5;
                            synthRef.current.triggerAttackRelease(note, "8n", time, vel);
                        }
                    });

                    // Visual Sync (Full)
                    Tone.Draw.schedule(() => {
                        setActiveCol(colIndex);
                        setActiveNotes(playingIndices);
                    }, time);
                }

            }, cols, "8n").start(0);

            // Adaptive BPM Calculation
            let totalContribs = 0;
            data.weeks.forEach(w => w.days.forEach(d => totalContribs += d.count));

            // Formula: Base 80 + (Total / 50). Cap at 180.
            const calculatedBpm = Math.min(180, Math.max(80, 80 + Math.floor(totalContribs / 50)));

            Tone.Transport.bpm.value = calculatedBpm;
            Tone.Transport.start();
            setIsPlaying(true);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        // Stop playback if running
        if (isPlaying) {
            Tone.Transport.stop();
            if (sequenceRef.current) sequenceRef.current.stop();
            setIsPlaying(false);
            setActiveCol(-1);
            setActiveNotes([]);
        }
        loadData(username);
    };

    const handleScaleChange = (e) => {
        const val = e.target.value;
        setScaleType(val);
        scaleTypeRef.current = val;
    };

    if (!data) return <div>Loading contribution graph...</div>;

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
                    />
                    <button type="submit">Load</button>
                </form>

                <div className="controls">
                    <button className={`play-btn ${isPlaying ? 'active' : ''}`} onClick={togglePlay}>
                        {isPlaying ? 'STOP' : 'PLAY'}
                    </button>
                </div>
            </header>

            <div className="graph-grid">
                {data.weeks.map((week, wIndex) => (
                    <div key={wIndex} className={`week-col ${activeCol === wIndex ? 'active' : ''}`}>
                        {week.days.map((day, dIndex) => {
                            const isPlayingNote = activeCol === wIndex && activeNotes.includes(dIndex);
                            return (
                                <div
                                    key={dIndex}
                                    className={`day-cell level-${day.level} ${isPlayingNote ? 'playing' : ''}`}
                                    title={`${day.date}: ${day.count} contribs`}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GitSequencer;
