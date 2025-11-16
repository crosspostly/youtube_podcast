import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import * as lamejs from 'lamejs';
import { API_KEYS } from '../config/appConfig';

// ... остальной код ...

const JAMENDO_CLIENT_ID = API_KEYS.jamendo || import.meta.env.VITE_JAMENDO_API_KEY || process.env.JAMENDO_API_KEY;

if (!JAMENDO_CLIENT_ID) {
  console.error('❌ Jamendo API Key не найден!');
}
// ... остальной код ...
