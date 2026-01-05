import { useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';

const SCALES = {
    pentatonic: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5'],
    lydian: ['C4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4'],
    dorian: ['C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4'],
    phrygianDom: ['C4', 'Db4', 'E4', 'F4', 'G4', 'Ab4', 'Bb4']
};

const CHORD_ROOTS = {
    pentatonic: ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4'],
    lydian: ['C3', 'D3', 'E3', 'F#3', 'G3', 'A3', 'B3'],
    dorian: ['C3', 'D3', 'Eb3', 'F3', 'G3', 'A3', 'Bb3'],
    phrygianDom: ['C3', 'Db3', 'E3', 'F3', 'G3', 'Ab3', 'Bb3']
};

const VELOCITIES = [0, 0.3, 0.5, 0.8, 1.0];

// Deterministic hash for synth oscillator type based on username
export const getSignatureOscillator = (username) => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const oscTypes = ['triangle', 'sawtooth', 'square', 'sine'];
    return oscTypes[Math.abs(hash) % oscTypes.length];
};

export function useAudioEngine(username, volume) {
    const gainRef = useRef(null);
    const limiterRef = useRef(null);
    const synthRef = useRef(null);
    const padSynthRef = useRef(null);
    const drumSynthRef = useRef(null);
    const metalSynthRef = useRef(null);
    const recorderRef = useRef(null);

    // Initialize audio engine
    useEffect(() => {
        // Master Gain for volume control
        gainRef.current = new Tone.Gain(volume / 100).toDestination();

        // Recorder for export functionality
        recorderRef.current = new Tone.Recorder();

        // Master Limiter to prevent clipping
        limiterRef.current = new Tone.Limiter(-3);
        limiterRef.current.connect(gainRef.current);
        limiterRef.current.connect(recorderRef.current);

        // Signature Synth (Oscillator depends on Username)
        const oscType = getSignatureOscillator(username);

        // Lead Synth
        synthRef.current = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: oscType },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
        }).connect(limiterRef.current);
        synthRef.current.volume.value = -6;

        // Pad Synth
        padSynthRef.current = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 2 }
        }).connect(limiterRef.current);
        padSynthRef.current.volume.value = -12;

        // Drum Synth (Kick & Snare)
        drumSynthRef.current = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 10,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
        }).connect(limiterRef.current);
        drumSynthRef.current.volume.value = -6;

        // Metal Synth (HiHats)
        metalSynthRef.current = new Tone.MetalSynth({
            frequency: 200,
            envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5
        }).connect(limiterRef.current);
        metalSynthRef.current.volume.value = -15;

        return () => {
            if (synthRef.current) synthRef.current.dispose();
            if (padSynthRef.current) padSynthRef.current.dispose();
            if (drumSynthRef.current) drumSynthRef.current.dispose();
            if (metalSynthRef.current) metalSynthRef.current.dispose();
            if (limiterRef.current) limiterRef.current.dispose();
            if (gainRef.current) gainRef.current.dispose();
            if (recorderRef.current) recorderRef.current.dispose();
        };
    }, [username]);

    // Update gain when volume changes
    useEffect(() => {
        if (gainRef.current) {
            gainRef.current.gain.value = volume / 100;
        }
    }, [volume]);

    // Play a melody note
    const playNote = useCallback((scaleType, dayIndex, level, time) => {
        const scale = SCALES[scaleType] || SCALES.pentatonic;
        const noteIndex = (dayIndex + level) % scale.length;
        const note = scale[noteIndex];
        const vel = VELOCITIES[level] || 0.5;
        synthRef.current?.triggerAttackRelease(note, "8n", time, vel);
    }, []);

    // Play a chord
    const playChord = useCallback((scaleType, rootIndex, time) => {
        const roots = CHORD_ROOTS[scaleType] || CHORD_ROOTS.pentatonic;
        const rootNote = roots[rootIndex % 7];
        const thirdNote = roots[(rootIndex + 2) % 7];
        const fifthNote = roots[(rootIndex + 4) % 7];
        padSynthRef.current?.triggerAttackRelease([rootNote, thirdNote, fifthNote], "1n", time);
    }, []);

    // Play kick drum
    const playKick = useCallback((time) => {
        drumSynthRef.current?.triggerAttackRelease("C1", "8n", time);
    }, []);

    // Play snare
    const playSnare = useCallback((time) => {
        drumSynthRef.current?.triggerAttackRelease("G2", "8n", time);
    }, []);

    // Play hi-hat
    const playHiHat = useCallback((time, velocity = 0.2) => {
        metalSynthRef.current?.triggerAttackRelease("32n", time, velocity);
    }, []);

    // Start recording
    const startRecording = useCallback(async () => {
        await Tone.start();
        recorderRef.current?.start();
    }, []);

    // Stop recording and return blob
    const stopRecording = useCallback(async () => {
        if (recorderRef.current) {
            const recording = await recorderRef.current.stop();
            return recording;
        }
        return null;
    }, []);

    return {
        playNote,
        playChord,
        playKick,
        playSnare,
        playHiHat,
        startRecording,
        stopRecording,
        SCALES,
        CHORD_ROOTS,
        VELOCITIES
    };
}
