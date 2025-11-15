// Test file to verify enhanced retry functionality
import { withRetries, type RetryConfig } from '../services/geminiService';

// Mock log function
const mockLog = (entry: any) => {
    console.log(`[${entry.type.toUpperCase()}] ${entry.message}`, entry.data || '');
};

// Test function that simulates API failures
const createFailingApiCall = (failCount: number, errorType: '429' | '503' | 'other' = '429') => {
    let attempts = 0;
    return async () => {
        attempts++;
        console.log(`API attempt ${attempts}`);
        
        if (attempts <= failCount) {
            const error = new Error(`Simulated ${errorType} error`);
            (error as any).status = errorType === 'other' ? 500 : parseInt(errorType);
            throw error;
        }
        
        return 'Success!';
    };
};

// Test enhanced retry behavior
export const testEnhancedRetry = async () => {
    console.log('=== Testing Enhanced Retry Functionality ===\n');
    
    // Test 1: Basic retry with 429 errors
    console.log('Test 1: Retry with 2 consecutive 429 errors...');
    try {
        const result = await withRetries(
            createFailingApiCall(2, '429'), 
            mockLog,
            { retries: 4, initialDelay: 500, maxDelay: 5000 }
        );
        console.log('✅ Success:', result);
    } catch (error: any) {
        console.log('❌ Failed:', error.message);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Custom exponential backoff
    console.log('Test 2: Custom exponential backoff (1.5x base)...');
    try {
        const result = await withRetries(
            createFailingApiCall(2, '503'), 
            mockLog,
            { retries: 4, exponentialBase: 1.5, initialDelay: 300 }
        );
        console.log('✅ Success:', result);
    } catch (error: any) {
        console.log('❌ Failed:', error.message);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 3: High jitter factor
    console.log('Test 3: High jitter factor (80%)...');
    try {
        const result = await withRetries(
            createFailingApiCall(1, '429'), 
            mockLog,
            { retries: 3, jitterFactor: 0.8, initialDelay: 400 }
        );
        console.log('✅ Success:', result);
    } catch (error: any) {
        console.log('❌ Failed:', error.message);
    }
    
    console.log('\n=== Test Complete ===');
};