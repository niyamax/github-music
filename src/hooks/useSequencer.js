import { useState, useRef, useCallback } from 'react';
import * as Tone from 'tone';

export function useSequencer(audioEngine) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeCol, setActiveCol] = useState(-1);
    const [activeNotes, setActiveNotes] = useState([]);
    const [scaleType, setScaleType] = useState('pentatonic');
    const [currentPattern, setCurrentPattern] = useState('Zen');
    const [bpm, setBpm] = useState(80);
    const [autoScale, setAutoScale] = useState(true);

    const scaleTypeRef = useRef('pentatonic');
    const autoScaleRef = useRef(true);
    const sequenceRef = useRef(null);

    const { playNote, playChord, playKick, playSnare, playHiHat } = audioEngine;

    // Determine scale based on activity level
    const getScaleForActivity = (activity) => {
        if (activity > 50) return { scale: 'phrygianDom', pattern: 'Intense (Extreme)' };
        if (activity > 30) return { scale: 'dorian', pattern: 'Focus (High)' };
        if (activity > 10) return { scale: 'lydian', pattern: 'Dreamy (Med)' };
        return { scale: 'pentatonic', pattern: 'Zen (Low)' };
    };

    // Calculate block activity (sum of levels in a 4-week block)
    const getBlockActivity = (data, colIndex) => {
        const blockStart = Math.floor(colIndex / 4) * 4;
        let activity = 0;
        for (let i = 0; i < 4; i++) {
            if (data.weeks[blockStart + i]) {
                data.weeks[blockStart + i].days.forEach(d => activity += d.level);
            }
        }
        return activity;
    };

    // Find chord root from upcoming weeks
    const findChordRoot = (data, colIndex) => {
        let foundRootIndex = 0;
        let maxLevel = -1;

        for (let i = 0; i < 4; i++) {
            const targetWeek = data.weeks[colIndex + i];
            if (targetWeek) {
                targetWeek.days.forEach((d, idx) => {
                    if (d.level > 2 && d.level > maxLevel) {
                        maxLevel = d.level;
                        foundRootIndex = idx;
                    }
                });
            }
        }
        return foundRootIndex;
    };

    // Start playback
    const play = useCallback(async (data) => {
        if (!data) return;

        await Tone.start();
        Tone.context.lookAhead = 0.1; // Increase lookahead for mobile stability

        const cols = data.weeks.map((_, i) => i);

        if (sequenceRef.current) sequenceRef.current.dispose();

        sequenceRef.current = new Tone.Sequence((time, colIndex) => {
            const week = data.weeks[colIndex];
            if (!week) return;

            const beat = colIndex % 4;
            const blockActivity = getBlockActivity(data, colIndex);

            // --- CHORD PAD LOGIC ---
            if (colIndex % 4 === 0) {
                const rootIndex = findChordRoot(data, colIndex);
                playChord(scaleTypeRef.current, rootIndex, time);
            }

            // --- SCALE/MOOD LOGIC ---
            if (autoScaleRef.current && beat === 0) {
                const { scale, pattern } = getScaleForActivity(blockActivity);
                setScaleType(scale);
                scaleTypeRef.current = scale;
                setCurrentPattern(pattern);
            }

            // --- DRUM LOGIC ---
            const isBusy = blockActivity > 15;
            const isMedium = blockActivity > 5;

            if (beat === 0) {
                playKick(time);
            } else if (beat === 2 && isMedium) {
                playSnare(time);
            } else if (isBusy) {
                playHiHat(time, 0.3);
            } else if (isMedium && (beat === 1 || beat === 3)) {
                playHiHat(time, 0.2);
            }

            // --- MELODY LOGIC ---
            const activeDays = week.days
                .map((d, i) => ({ day: d, index: i }))
                .filter(item => item.day.level > 0);

            if (activeDays.length > 0) {
                let selectedNotes = [];
                const roll = Math.random();

                // 40% chance: Single Note (Melodic)
                // 40% chance: Sparse Chord (2-3 notes)
                // 20% chance: Cluster (up to 4 notes)

                if (roll < 0.4) {
                    // Pick one random note for a clear melody line
                    const randomIdx = Math.floor(Math.random() * activeDays.length);
                    selectedNotes = [activeDays[randomIdx]];
                } else if (roll < 0.8) {
                    // Pick 2-3 random notes for a sparse chord
                    const shuffled = [...activeDays].sort(() => 0.5 - Math.random());
                    selectedNotes = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));
                } else {
                    // Play up to 4 notes for a richer texture, but avoid full 7-note chords
                    const shuffled = [...activeDays].sort(() => 0.5 - Math.random());
                    selectedNotes = shuffled.slice(0, 4);
                }

                selectedNotes.forEach(({ day, index }) => {
                    playNote(scaleTypeRef.current, index, day.level, time);
                });

                Tone.Draw.schedule(() => {
                    setActiveCol(colIndex);
                    setActiveNotes(selectedNotes.map(n => n.index));
                }, time);
            }
        }, cols, "8n").start("0:0:0");

        // Adaptive BPM
        let totalContribs = 0;
        data.weeks.forEach(w => w.days.forEach(d => totalContribs += d.count));
        const calculatedBpm = Math.min(110, Math.max(80, 80 + Math.floor(totalContribs / 50)));

        Tone.Transport.bpm.value = calculatedBpm;
        setBpm(calculatedBpm);
        Tone.Transport.start();
        setIsPlaying(true);
    }, [playNote, playChord, playKick, playSnare, playHiHat]);

    // Stop playback
    const stop = useCallback(() => {
        // Stop sequence first to avoid referencing halted transport time
        if (sequenceRef.current) {
            sequenceRef.current.stop();
            sequenceRef.current.dispose();
            sequenceRef.current = null;
        }

        Tone.Transport.stop();
        Tone.Transport.cancel(); // Clear all scheduled events
        Tone.Transport.position = "0:0:0"; // Reset position safely

        setIsPlaying(false);
        setActiveCol(-1);
        setActiveNotes([]);
    }, []);

    // Toggle playback
    const toggle = useCallback(async (data) => {
        if (isPlaying) {
            stop();
        } else {
            await play(data);
        }
    }, [isPlaying, play, stop]);

    // Change scale manually
    const changeScale = useCallback((value) => {
        if (value === 'auto') {
            setAutoScale(true);
            autoScaleRef.current = true;
        } else {
            setAutoScale(false);
            autoScaleRef.current = false;
            setScaleType(value);
            scaleTypeRef.current = value;
        }
    }, []);

    return {
        isPlaying,
        activeCol,
        activeNotes,
        scaleType,
        currentPattern,
        bpm,
        autoScale,
        play,
        stop,
        toggle,
        changeScale
    };
}
