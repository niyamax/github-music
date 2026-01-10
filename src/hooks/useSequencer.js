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
            let weekDensity = 0;
            week.days.forEach(d => weekDensity += d.level);

            // Only sample if extremely dense (prevent "wall of sound" while keeping most notes)
            if (weekDensity > 25) {
                // Busy week: random sampling
                const activeDays = week.days
                    .map((d, i) => ({ day: d, index: i }))
                    .filter(item => item.day.level > 0);

                // Shuffle
                for (let i = activeDays.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [activeDays[i], activeDays[j]] = [activeDays[j], activeDays[i]];
                }

                const noteCount = 1 + Math.floor(Math.random() * 3);
                const selectedNotes = activeDays.slice(0, noteCount);

                selectedNotes.forEach(({ day, index }) => {
                    playNote(scaleTypeRef.current, index, day.level, time);
                });

                Tone.Draw.schedule(() => {
                    setActiveCol(colIndex);
                    setActiveNotes(selectedNotes.map(n => n.index));
                }, time);
            } else {
                // Chill week: play all active notes
                const playingIndices = [];
                week.days.forEach((day, dayIndex) => {
                    if (day.level > 0) {
                        playingIndices.push(dayIndex);
                        playNote(scaleTypeRef.current, dayIndex, day.level, time);
                    }
                });

                Tone.Draw.schedule(() => {
                    setActiveCol(colIndex);
                    setActiveNotes(playingIndices);
                }, time);
            }
        }, cols, "8n").start("0:0:0");

        // Adaptive BPM
        let totalContribs = 0;
        data.weeks.forEach(w => w.days.forEach(d => totalContribs += d.count));
        const calculatedBpm = Math.min(180, Math.max(80, 80 + Math.floor(totalContribs / 50)));

        Tone.Transport.bpm.value = calculatedBpm;
        setBpm(calculatedBpm);
        Tone.Transport.start();
        setIsPlaying(true);
    }, [playNote, playChord, playKick, playSnare, playHiHat]);

    // Stop playback
    const stop = useCallback(() => {
        Tone.Transport.stop();
        Tone.Transport.cancel(); // Clear all scheduled events
        Tone.Transport.position = "0:0:0"; // Reset position safely
        if (sequenceRef.current) {
            sequenceRef.current.stop();
            sequenceRef.current.dispose();
            sequenceRef.current = null;
        }
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
