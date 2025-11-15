// Simple test to verify Gemini queue implementation
// This file demonstrates how the queue works and can be used for testing

import { generateContentWithFallback, withQueueAndRetries } from '../services/geminiService';

// Mock log function for testing
const mockLog = (entry: any) => {
    console.log(`[${entry.type.toUpperCase()}] ${entry.message}`, entry.data || '');
};

// Test function to demonstrate queue behavior
export const testGeminiQueue = async () => {
    console.log('=== Testing Gemini API Queue ===\n');

    try {
        // Test 1: Multiple simultaneous requests
        console.log('Test 1: Making 3 simultaneous requests...');
        
        const requests = [
            generateContentWithFallback(
                { contents: 'What is 2+2? Answer with just the number.' }, 
                mockLog,
                {}
            ),
            generateContentWithFallback(
                { contents: 'What is 3+3? Answer with just the number.' }, 
                mockLog,
                {}
            ),
            generateContentWithFallback(
                { contents: 'What is 4+4? Answer with just the number.' }, 
                mockLog,
                {}
            )
        ];

        const startTime = Date.now();
        const results = await Promise.all(requests);
        const endTime = Date.now();

        console.log(`\nAll requests completed in ${endTime - startTime}ms`);
        console.log('Results:', results.map(r => r.text?.trim()));

        // Test 2: Queue with custom API call
        console.log('\nTest 2: Queue with custom API call...');
        
        // FIX: Added missing arguments to `withQueueAndRetries` to match its definition.
        const customResult = await withQueueAndRetries(async () => {
            // This would be a custom Gemini API call
            // For testing, we'll simulate a delay
            await new Promise(resolve => setTimeout(resolve, 100));
            return { text: 'Custom API call result' };
        }, mockLog, {}, 'test-queue', 100);

        console.log('Custom result:', customResult);

        console.log('\n=== Queue Test Completed Successfully ===');
        return true;

    } catch (error) {
        console.error('Queue test failed:', error);
        return false;
    }
};

// Export for use in components or testing
export default testGeminiQueue;