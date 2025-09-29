import { defineProvider } from './Application'
import ConfigProvider from './ConfigProvider'
import { GoogleGenAI } from "@google/genai";

export default defineProvider([
  ConfigProvider,
], async (context) => {
  
  const gemini = new GoogleGenAI({
    apiKey: context.service.config.GEMINI_KEY,
  });
  return { gemini }
})