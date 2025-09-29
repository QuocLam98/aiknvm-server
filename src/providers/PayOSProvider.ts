import { defineProvider } from './Application'
import ConfigProvider from './ConfigProvider'
import PayOS from '@payos/node'

export default defineProvider([
  ConfigProvider,
], async (context) => {
  
  const payOS = new PayOS(
    context.service.config.CLIENT_ID,
    context.service.config.KEY_PAY,
    context.service.config.CHESUN_KEY,
);
//  const completions = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         store: true,
//         messages: [
//           {"role": "user", 
//           "content": "write a haiku about ai"},
//         ],
//       });
//       console.log(completions)
//       console.log(completions.choices)

  return { payOS }
})