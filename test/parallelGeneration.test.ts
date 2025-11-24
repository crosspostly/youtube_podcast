// Test for parallel SFX and image generation
import { findSfxForScript } from '../services/sfxService';
import { generateStyleImages } from '../services/imageService';
import type { ScriptLine, LogEntry } from '../types';

// Mock log function
const mockLog = (entry: Omit<LogEntry, 'timestamp'>) => {
    console.log(`[${entry.type}] ${entry.message}`, entry.data || '');
};

// Mock script with SFX lines
const mockScript: ScriptLine[] = [
    { speaker: 'Narrator', text: 'Welcome to our show' },
    { speaker: 'SFX', text: 'Thunder sound', searchKeywords: 'thunder storm' },
    { speaker: 'Narrator', text: 'The story begins' },
    { speaker: 'SFX', text: 'Door creak', searchKeywords: 'door creaking' },
    { speaker: 'Narrator', text: 'Something is happening' },
    { speaker: 'SFX', text: 'Wind howl', searchKeywords: 'wind howling' }
];

// Test parallel execution
export const testParallelGeneration = async () => {
    console.log('🧪 Testing parallel SFX and image generation...');
    
    try {
        // Test 1: Parallel SFX processing
        console.log('\n📊 Test 1: SFX Processing Time');
        const startTime = Date.now();
        
        const sfxResult = await findSfxForScript(mockScript, mockLog);
        
        const sfxTime = Date.now() - startTime;
        console.log(`✅ SFX processing completed in ${sfxTime}ms`);
        console.log(`📊 Processed ${sfxResult.length} script lines`);
        
        // Count SFX that were found
        const sfxFound = sfxResult.filter(line => 
            line.speaker.toUpperCase() === 'SFX' && line.soundEffect
        ).length;
        console.log(`🔊 Found ${sfxFound} SFX out of ${mockScript.filter(l => l.speaker.toUpperCase() === 'SFX').length} expected`);
        
        // Test 2: Image generation (mock)
        console.log('\n📊 Test 2: Image Generation (Mock)');
        const imageStartTime = Date.now();
        
        // Mock image generation - simulate 2 second delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const imageTime = Date.now() - imageStartTime;
        console.log(`✅ Image generation completed in ${imageTime}ms (mock)`);
        
        // Test 3: Parallel execution simulation
        console.log('\n📊 Test 3: Parallel Execution Simulation');
        const parallelStartTime = Date.now();
        
        // Simulate parallel execution
        const [,] = await Promise.all([
            findSfxForScript(mockScript, mockLog),
            new Promise(resolve => setTimeout(resolve, 2000)) // Mock image generation
        ]);
        
        const parallelTime = Date.now() - parallelStartTime;
        console.log(`✅ Parallel execution completed in ${parallelTime}ms`);
        
        // Test 4: Sequential execution simulation
        console.log('\n📊 Test 4: Sequential Execution Simulation');
        const sequentialStartTime = Date.now();
        
        await findSfxForScript(mockScript, mockLog);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Mock image generation
        
        const sequentialTime = Date.now() - sequentialStartTime;
        console.log(`✅ Sequential execution completed in ${sequentialTime}ms`);
        
        // Calculate time savings
        const timeSaved = sequentialTime - parallelTime;
        const percentSaved = ((timeSaved / sequentialTime) * 100).toFixed(1);
        
        console.log('\n📈 Results Summary:');
        console.log(`⚡ Time saved: ${timeSaved}ms (${percentSaved}%)`);
        console.log(`🚀 Parallel execution is ${percentSaved}% faster!`);
        
        return {
            sfxTime,
            imageTime,
            parallelTime,
            sequentialTime,
            timeSaved,
            percentSaved: parseFloat(percentSaved)
        };
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
};

// Test the parallel SFX processing in findSfxForScript specifically
export const testSfxParallelProcessing = async () => {
    console.log('\n🔊 Testing SFX Parallel Processing Implementation...');
    
    // Create a script with many SFX to test parallel processing
    const scriptWithManySfx: ScriptLine[] = [
        { speaker: 'Narrator', text: 'Welcome to our show' },
        { speaker: 'SFX', text: 'Thunder', searchKeywords: 'thunder' },
        { speaker: 'Narrator', text: 'The story continues' },
        { speaker: 'SFX', text: 'Rain', searchKeywords: 'rain falling' },
        { speaker: 'Narrator', text: 'Something happens' },
        { speaker: 'SFX', text: 'Door', searchKeywords: 'door slam' },
        { speaker: 'Narrator', text: 'More story' },
        { speaker: 'SFX', text: 'Wind', searchKeywords: 'wind blowing' },
        { speaker: 'Narrator', text: 'Even more story' },
        { speaker: 'SFX', text: 'Footsteps', searchKeywords: 'footsteps walking' }
    ];
    
    const startTime = Date.now();
    const result = await findSfxForScript(scriptWithManySfx, mockLog);
    const totalTime = Date.now() - startTime;
    
    const sfxCount = scriptWithManySfx.filter(line => line.speaker.toUpperCase() === 'SFX').length;
    const foundCount = result.filter(line => 
        line.speaker.toUpperCase() === 'SFX' && line.soundEffect
    ).length;
    
    console.log(`🔊 Processed ${sfxCount} SFX in parallel`);
    console.log(`✅ Found ${foundCount} SFX`);
    console.log(`⏱️ Total time: ${totalTime}ms`);
    console.log(`⚡ Average time per SFX: ${(totalTime / sfxCount).toFixed(1)}ms`);
    
    return {
        totalSfx: sfxCount,
        foundSfx: foundCount,
        totalTime,
        averageTimePerSfx: totalTime / sfxCount
    };
};