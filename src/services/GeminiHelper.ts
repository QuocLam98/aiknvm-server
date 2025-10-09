import Decimal from 'decimal.js';
import mammoth from 'mammoth';
import imageUrlToBase64 from './Base64';
import { Model } from 'mongoose';
import FileManageModel from '~/models/FileManageModel'

// Types kept minimal to avoid importing all model typings
interface IMessageDoc {
  contentUser: string;
  contentBot: string;
  fileUser?: string;
  status: number;
  createdAt: Date;
}

interface PrepareParams {
  app: any;
  bot: any;
  historyId?: string;
  userPrompt: string;
  fileUrl?: string; // user attachment
  includeTemplate: boolean;
  MessageModel: Model<any>;
}

export interface PreparedGeminiInput {
  contents: any[];
  contextNote: string; // aggregate context text used
}

/**
 * Build Gemini multi-modal user message (single turn) by aggregating:
 *  - Bot template (only first turn if includeTemplate)
 *  - Bot files (summarised)
 *  - Recent history (last 5 exchanges)
 *  - Current user prompt
 *  - Optional user attachment (pdf/word/txt summarised or inline image)
 */
export async function prepareGeminiInput({ app, bot, historyId, userPrompt, fileUrl, includeTemplate, MessageModel }: PrepareParams): Promise<PreparedGeminiInput> {
  const botFileSnippets: string[] = [];
  try {
    const filesBot = await FileManageModel.find({ bot: bot._id, active: true });
    for (const f of filesBot) {
      try {
        const resp = await imageUrlToBase64(f.url);
        if (resp.type === 'application/pdf') {
          botFileSnippets.push(`[PDF]: ${resp.file}`);
        } else if (resp.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const r = await mammoth.extractRawText({ buffer: resp.content });
          botFileSnippets.push(r.value.substring(0, 1500));
        } else if (resp.type === 'text/plain') {
          botFileSnippets.push(resp.content.toString('utf-8').substring(0, 1500));
        }
      } catch (err) {
        app.logger.error(err);
      }
    }
  } catch (e) {
    app.logger.error(e);
  }

  const historyPairs: string[] = [];
  if (historyId) {
    const lastMessages: IMessageDoc[] = await MessageModel.find({ history: historyId, status: { $in: [0, 1] }, active: true })
      .limit(5).sort({ createdAt: -1 });
    lastMessages.reverse();
    for (const m of lastMessages) {
      historyPairs.push(`User: ${m.contentUser}`);
      historyPairs.push(`Bot: ${m.contentBot}`);
    }
  }

  let userFileSnippet = '';
  let imageInlinePart: any | undefined;
  if (fileUrl) {
    try {
      const rf = await imageUrlToBase64(fileUrl);
      if (rf.type === 'application/pdf') {
        userFileSnippet = `[User gửi PDF: ${rf.file}]`;
      } else if (rf.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const r = await mammoth.extractRawText({ buffer: rf.content });
        userFileSnippet = r.value.substring(0, 1500);
      } else if (rf.type === 'text/plain') {
        userFileSnippet = rf.content.toString('utf-8').substring(0, 1500);
      } else if (rf.type.startsWith('image/')) {
        imageInlinePart = {
          inlineData: {
            data: rf.content.toString('base64'),
            mimeType: rf.type
          }
        };
        userFileSnippet = '[User gửi hình ảnh]';
      }
    } catch (err) {
      app.logger.error(err);
    }
  }

  const templateText = (includeTemplate && bot.templateMessage?.trim()) ? `Hướng dẫn hệ thống:\n${bot.templateMessage.trim()}\n\n` : '';

  const aggregateContext = `${templateText}Thông tin bot:\n${botFileSnippets.join('\n---\n')}\n\nLịch sử gần nhất:\n${historyPairs.join('\n')}\n\nNội dung người dùng hiện tại:\n${userPrompt}\n\nThông tin file người dùng (nếu có):\n${userFileSnippet}`;

  const userParts: any[] = [{ text: aggregateContext }];
  if (imageInlinePart) userParts.push(imageInlinePart);

  return { contents: [{ role: 'user', parts: userParts }], contextNote: aggregateContext };
}

export interface PricingResult {
  creditCost: Decimal;
  promptTokens: number;
  outputTokens: number;
}

/**
 * Compute pricing for Gemini usage according to tiered table provided by user.
 * Returns creditCost (already multiplied by 5 conversion factor).
 */
export function computeGeminiPricing(usage: any, modelNameRaw?: string): PricingResult {
  const promptTokens: number = usage?.promptTokenCount || 0;
  const outputTokens: number = usage?.candidatesTokenCount || 0;
  const modelName = modelNameRaw || 'gemini-2.5-pro';
  const isFlash = /flash/i.test(modelName);

  let inputPerMillionUSD: number;
  let outputPerMillionUSD: number;
  if (isFlash) {
    inputPerMillionUSD = 0.30;
    outputPerMillionUSD = 2.50;
  } else {
    inputPerMillionUSD = promptTokens <= 200_000 ? 1.25 : 2.50;
    outputPerMillionUSD = outputTokens <= 200_000 ? 10.00 : 15.00;
  }

  const promptDec = new Decimal(promptTokens);
  const outputDec = new Decimal(outputTokens);
  const costInputUSD = promptDec.mul(inputPerMillionUSD).div(1_000_000);
  const costOutputUSD = outputDec.mul(outputPerMillionUSD).div(1_000_000);
  const creditCost = costInputUSD.add(costOutputUSD).mul(5); // conversion factor

  return { creditCost, promptTokens, outputTokens };
}
