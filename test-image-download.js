#!/usr/bin/env node

/**
 * Test script for image download proxy functionality
 * Usage: node test-image-download.js
 */

import https from 'https';

const API_BASE = 'http://localhost:3000';

// Test data - replace with actual Unsplash API key to test
const TEST_API_KEY = 'YOUR_UNSPLASH_API_KEY'; // Replace with real key for testing

const testUrls = {
  unsplash: 'https://api.unsplash.com/photos/LBI7cgq3pbM/download_location',
  pexels: 'https://images.pexels.com/photos/255379/pexels-photo.jpg' // Direct image URL for Pexels
};

async function testImageDownload(source, url, apiKey) {
  console.log(`\n🧪 Testing ${source} image download...`);
  console.log(`URL: ${url}`);
  
  const testData = {
    url: url,
    source: source,
    apiKey: apiKey
  };

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(testData);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/download-image',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log(`✅ Status: ${res.statusCode}`);
          console.log(`📄 Response:`, result);
          
          if (result.base64) {
            console.log(`📏 Image size: ${result.base64.length} characters (base64)`);
            const sizeInMB = (result.base64.length * 0.75) / (1024 * 1024); // Approximate
            console.log(`💾 Approx size: ${sizeInMB.toFixed(2)} MB`);
          }
          
          resolve({ success: true, result });
        } catch (parseError) {
          console.error(`❌ Failed to parse response:`, parseError);
          console.log(`📄 Raw response:`, data);
          resolve({ success: false, error: parseError, rawResponse: data });
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request failed:`, error);
      reject(error);
    });

    req.on('timeout', () => {
      console.error(`❌ Request timeout`);
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(60000); // 60 seconds timeout
    req.write(postData);
    req.end();
  });
}

async function testImageDownloadTestEndpoint(source, url, apiKey) {
  console.log(`\n🧪 Testing ${source} with test endpoint...`);
  
  const testUrl = `${API_BASE}/api/test-image-download?url=${encodeURIComponent(url)}&source=${source}&apiKey=${encodeURIComponent(apiKey)}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/test-image-download?url=${encodeURIComponent(url)}&source=${source}&apiKey=${encodeURIComponent(apiKey)}`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log(`✅ Test endpoint status: ${res.statusCode}`);
          console.log(`📄 Test results:`, JSON.stringify(result.testResults, null, 2));
          resolve({ success: true, result });
        } catch (parseError) {
          console.error(`❌ Failed to parse test response:`, parseError);
          console.log(`📄 Raw response:`, data);
          resolve({ success: false, error: parseError, rawResponse: data });
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Test request failed:`, error);
      reject(error);
    });

    req.setTimeout(30000);
    req.end();
  });
}

async function main() {
  console.log('🚀 Starting Image Download Proxy Tests');
  console.log('=====================================');

  if (TEST_API_KEY === 'YOUR_UNSPLASH_API_KEY') {
    console.log('\n⚠️  WARNING: Please replace TEST_API_KEY with a real Unsplash API key to test properly');
    console.log('Continuing with basic connectivity tests...\n');
  }

  const tests = [
    { source: 'unsplash', url: testUrls.unsplash, apiKey: TEST_API_KEY },
    { source: 'pexels', url: testUrls.pexels, apiKey: 'YOUR_PEXELS_API_KEY' }
  ];

  for (const test of tests) {
    if (test.apiKey.includes('YOUR_')) {
      console.log(`⏭️  Skipping ${test.source} test (no API key provided)`);
      continue;
    }

    try {
      // Test the main endpoint
      await testImageDownload(test.source, test.url, test.apiKey);
      
      // Test the test endpoint
      await testImageDownloadTestEndpoint(test.source, test.url, test.apiKey);
      
    } catch (error) {
      console.error(`❌ Test failed for ${test.source}:`, error.message);
    }
  }

  console.log('\n🏁 Tests completed');
  console.log('\n📋 Summary:');
  console.log('- Check the logs above for success/failure indicators');
  console.log('- Look for "Image downloaded successfully" messages');
  console.log('- If tests failed, ensure the dev server is running on port 3000');
  console.log('- Make sure API keys are valid if testing with real services');
}

// Run the tests
main().catch(console.error);