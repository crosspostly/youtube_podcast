// utils/audioUtils.ts

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

/**
 * Creates a WAV file Blob from raw PCM audio data.
 * The Gemini TTS API returns raw 16-bit PCM audio at a 24000Hz sample rate.
 * This function wraps it with the necessary 44-byte WAV header.
 * @param pcmData - The raw audio data as a Uint8Array.
 * @param sampleRate - The sample rate of the audio (e.g., 24000).
 * @param numChannels - The number of audio channels (e.g., 1 for mono).
 * @returns A Blob representing the WAV file.
 */
export function createWavBlob(pcmData: Uint8Array, sampleRate: number, numChannels: number): Blob {
    const dataLength = pcmData.byteLength;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    const bitsPerSample = 16; // Assuming 16-bit PCM
    const blockAlign = numChannels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true); // file size - 8
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Write PCM data
    const pcmBytes = new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
    for (let i = 0; i < dataLength; i++) {
        view.setUint8(44 + i, pcmBytes[i]);
    }

    return new Blob([view], { type: 'audio/wav' });
}