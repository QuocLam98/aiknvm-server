import { defineProvider } from './Application'
import ConfigProvider from './ConfigProvider'
import OpenAI from "openai"

export default defineProvider([
  ConfigProvider,
], async (context) => {
  
  const openai = new OpenAI({
    apiKey: context.service.config.OPENAI_KEY,
  });
  return { openai }
})