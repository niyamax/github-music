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

const VELOCITIES = [0, 0.5, 0.6, 0.7, 0.8];

// Default volumes if not provided
const DEFAULT_VOLUMES = { melody: -10, pad: -20, drum: -8, metal: -14 };

// Palette of soothing sounds
const SOOTHING_TYPES = ['fmsine', 'fattriangle', 'fmtriangle', 'pulse'];

// Fallback hash for initial load
export const getSignatureOscillator = (username) => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return SOOTHING_TYPES[Math.abs(hash) % SOOTHING_TYPES.length];
};

export function useAudioEngine(username, volumes = DEFAULT_VOLUMES, data = null) {
    const gainRef = useRef(null);
    const limiterRef = useRef(null);
    const filterRef = useRef(null); // Low-pass filter for soothing tone
    const padFilterRef = useRef(null); // Dedicated filter for pads
    const synthRef = useRef(null);
    const padSynthRef = useRef(null);
    const drumSynthRef = useRef(null);
    const metalSynthRef = useRef(null);
    const recorderRef = useRef(null);
    const pianoReverbRef = useRef(null); // Reverb for Lead/Piano
    const padReverbRef = useRef(null);   // Massive Reverb for Pads

    // Initialize audio engine
    useEffect(() => {
        // Master Gain (Fixed at 0dB, individual tracks controlled separately)
        gainRef.current = new Tone.Gain(1).toDestination();

        // Recorder
        recorderRef.current = new Tone.Recorder();

        // Master Limiter
        limiterRef.current = new Tone.Limiter(-3);
        limiterRef.current.connect(gainRef.current);
        limiterRef.current.connect(recorderRef.current);

        // 1. Piano Reverb (Clean but spacious)
        pianoReverbRef.current = new Tone.Reverb({
            decay: 12,
            preDelay: 0.01,
            wet: 0.7
        }).toDestination();
        pianoReverbRef.current.connect(limiterRef.current);

        // 2. Pad Reverb (Deep, atmospheric wash)
        padReverbRef.current = new Tone.Reverb({
            decay: 10,       // Huge decay
            preDelay: 0.5,  // Slow onset
            wet: 0.8       // 100% Wet (pure atmosphere)
        }).toDestination();
        padReverbRef.current.connect(limiterRef.current);

        // Low-Pass Filter (Connects to Piano Reverb)
        filterRef.current = new Tone.Filter(2500, "lowpass", -12);
        filterRef.current.connect(pianoReverbRef.current);

        // Determine Oscillator Type (Ambient Palette)
        // If data exists, choose based on activity. Else, fallback to username hash.
        let oscType = getSignatureOscillator(username);

        if (data && data.weeks) {
            let totalContribs = 0;
            data.weeks.forEach(w => w.days.forEach(d => totalContribs += d.count));

            // // Map intensity to sound texture - AMBIENT EDITION
            // if (totalContribs < 500) oscType = 'fmsine';        // Electric Piano
            // else if (totalContribs < 1500) oscType = 'fmsine';    // Soft Flute
            // else if (totalContribs < 3000) oscType = 'fmsine'; // Warm Pad-like Lead
            // else oscType = 'fmsine';                                // Richer tone for high energy
        }

        // Lead Synth (Piano/Pluck Vibe) -> Piano Reverb
        synthRef.current = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'fmsine' },
            envelope: {
                attack: 0.02,  // Faster attack (piano-like)
                decay: 1,
                sustain: 0.2,
                release: 2     // Long release tail
            }
        }).connect(pianoReverbRef.current);
        synthRef.current.volume.value = volumes.melody ?? DEFAULT_VOLUMES.melody;

        // Pad Synth (Deep Background) -> Pad Reverb
        // 1. Create a LowPass filter to cut the buzz
        padFilterRef.current = new Tone.Filter(800, "lowpass");
        padFilterRef.current.connect(padReverbRef.current);

        padSynthRef.current = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "sawtooth" },
            envelope: {
                attack: 2,
                decay: 0.1,
                sustain: 1,
                release: 4
            }
        }).connect(padFilterRef.current);
        padSynthRef.current.volume.value = volumes.pad ?? DEFAULT_VOLUMES.pad;

        // Drum Synth (Kick & Snare) - Very Soft / Lo-fi
        drumSynthRef.current = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 4,
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.4, sustain: 0.01, release: 1.4 }
        }).connect(limiterRef.current); // Drums skip reverb to stay punchy (or maybe light reverb?)
        drumSynthRef.current.volume.value = volumes.drum ?? DEFAULT_VOLUMES.drum;

        // Metal Synth (HiHats) - Shaker Vibe
        metalSynthRef.current = new Tone.MetalSynth({
            frequency: 200,
            envelope: { attack: 0.01, decay: 0.05, release: 0.05 },
            harmonicity: 3.1,
            modulationIndex: 10,
            resonance: 2000,
            octaves: 1
        }).connect(limiterRef.current); // Connect to Limiter for clarity (bypass filter)
        metalSynthRef.current.volume.value = volumes.metal ?? DEFAULT_VOLUMES.metal;

        return () => {
            if (synthRef.current) synthRef.current.dispose();
            if (padSynthRef.current) padSynthRef.current.dispose();
            if (drumSynthRef.current) drumSynthRef.current.dispose();
            if (metalSynthRef.current) metalSynthRef.current.dispose();
            if (filterRef.current) filterRef.current.dispose();

            // FIX 2 (Cleanup): Dispose the pad filter
            if (padFilterRef.current) padFilterRef.current.dispose();

            if (pianoReverbRef.current) pianoReverbRef.current.dispose();
            if (padReverbRef.current) padReverbRef.current.dispose();
            if (limiterRef.current) limiterRef.current.dispose();
            if (gainRef.current) gainRef.current.dispose();
            if (recorderRef.current) recorderRef.current.dispose();
        };
    }, [username, data]); // Re-run when data loads to switch instrument

    // Update separate volumes live
    useEffect(() => {
        if (synthRef.current) synthRef.current.volume.rampTo(volumes.melody ?? DEFAULT_VOLUMES.melody, 0.1);
        if (padSynthRef.current) padSynthRef.current.volume.rampTo(volumes.pad ?? DEFAULT_VOLUMES.pad, 0.1);
        if (drumSynthRef.current) drumSynthRef.current.volume.rampTo(volumes.drum ?? DEFAULT_VOLUMES.drum, 0.1);
        if (metalSynthRef.current) metalSynthRef.current.volume.rampTo(volumes.metal ?? DEFAULT_VOLUMES.metal, 0.1);
    }, [volumes]);

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
        drumSynthRef.current?.triggerAttackRelease("C2", "8n", time);
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
