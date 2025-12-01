/**
 * AUDIO OPTIMIZATION FOR 50+ AUDIENCE
 * 
 * Purpose: Ensure speech clarity and comfortable listening for viewers with age-related hearing changes
 * 
 * Based on research:
 * - Presbycusis (age-related hearing loss) affects 2-8kHz range
 * - Consonant recognition depends on 2-4kHz clarity
 * - Background noise tolerance decreases with age
 * - Processing time increases (need longer pauses)
 */

export interface AudioSettings {
    speechClarity: {
        frequencyRange: string;
        boostDB: number;
        description: string;
    };
    
    mixLevels: {
        speech: number;           // 1.0 = 100%
        music: number;            // Background music
        sfxAtmospheric: number;   // Ambient sounds
        sfxSudden: number;        // Event sounds
    };
    
    pauses: {
        sentenceGap: number;      // Seconds between sentences
        paragraphGap: number;     // Seconds between paragraphs
        preRevelation: number;    // Dramatic pause before key facts
    };
    
    compression: {
        enabled: boolean;
        ratio: string;
        threshold: string;
        description: string;
    };
}

/**
 * OPTIMAL SETTINGS FOR 50+ TIER 1 AUDIENCE
 */
export const SENIOR_OPTIMIZED_AUDIO: AudioSettings = {
    speechClarity: {
        frequencyRange: '2000-4000 Hz',
        boostDB: 3,
        description: 'Boost consonant frequencies. Age-related hearing loss primarily affects this range.'
    },
    
    mixLevels: {
        speech: 0.85,          // 85% - Dominant in mix
        music: 0.15,           // 15% - Much quieter than standard 30%
        sfxAtmospheric: 0.20,  // 20% - Subtle presence
        sfxSudden: 0.40        // 40% - Noticeable but not jarring
    },
    
    pauses: {
        sentenceGap: 0.8,      // Almost 1 second - allows processing
        paragraphGap: 1.5,     // 1.5 seconds - mental reset between topics
        preRevelation: 2.5     // 2.5 seconds - builds anticipation
    },
    
    compression: {
        enabled: true,
        ratio: '3:1',
        threshold: '-18 dB',
        description: 'Gentle compression to reduce dynamic range. Prevents quiet passages from being inaudible.'
    }
};

/**
 * FREQUENCY CORRECTION FILTERS
 * To be applied in FFmpeg during video assembly
 */
export const SPEECH_CLARITY_FILTER = {
    ffmpegCommand: 'equalizer=f=3000:width_type=h:width=2000:g=3',
    explanation: {
        f: '3000 Hz = center frequency (middle of consonant range)',
        width_type: 'h = width in Hz',
        width: '2000 Hz = affects 2000-4000 Hz range',
        g: '3 dB = gentle boost, not harsh'
    },
    applyTo: 'Speech audio track only, NOT music or SFX'
};

/**
 * DYNAMIC RANGE COMPRESSION
 */
export const GENTLE_COMPRESSION_FILTER = {
    ffmpegCommand: 'acompressor=threshold=-18dB:ratio=3:attack=200:release=1000',
    explanation: {
        threshold: '-18 dB = start compressing at comfortable speech level',
        ratio: '3:1 = gentle compression (not aggressive limiting)',
        attack: '200ms = smooth onset',
        release: '1000ms = gradual release (sounds natural)'
    },
    benefit: 'Quiet words become audible without making loud words uncomfortable'
};

/**
 * VALIDATION FUNCTION
 */
export function validateAudioForSeniors(settings: Partial<AudioSettings>): {
    valid: boolean;
    warnings: string[];
    recommendations: string[];
} {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    if (!settings.mixLevels || settings.mixLevels.music > 0.20) {
        warnings.push('Music volume too high. Recommended: ≤0.15 for 50+ audience');
        recommendations.push('Reduce background music to 15% or lower');
    }
    
    if (settings.mixLevels && settings.mixLevels.sfxSudden > 0.50) {
        warnings.push('SFX volume may startle older viewers');
        recommendations.push('Keep sudden sound effects below 40%');
    }
    
    if (settings.pauses && settings.pauses.sentenceGap < 0.6) {
        warnings.push('Sentence pauses too short for 50+ processing time');
        recommendations.push('Increase to at least 0.8 seconds');
    }
    
    const valid = warnings.length === 0;
    return { valid, warnings, recommendations };
}

export default SENIOR_OPTIMIZED_AUDIO;
