import { GoogleGenAI, Type } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: 'dummy-key' });
ai.models.generateContent({ 
  model: 'gemini-1.5-pro', 
  contents: 'hello', 
  config: { 
    responseMimeType: 'application/json', 
    responseSchema: { 
      type: Type.OBJECT, 
      properties: { 
        title: { type: Type.STRING } 
      } 
    } 
  } 
}).then(res => console.log(res)).catch(e => console.error("SDK Error:", e));
