// Analyzes payment receipt images to extract transaction values for automatic reconciliation.

'use server';

/**
 * @fileOverview Analyzes payment receipt images using AI to extract transaction values.
 *
 * - analyzePaymentReceipt - A function that analyzes a payment receipt image.
 * - AnalyzePaymentReceiptInput - The input type for the analyzePaymentReceipt function.
 * - AnalyzePaymentReceiptOutput - The return type for the analyzePaymentReceipt function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzePaymentReceiptInputSchema = z.object({
  imageUrl: z.string().describe('The URL of the payment receipt image to analyze.'),
});
export type AnalyzePaymentReceiptInput = z.infer<typeof AnalyzePaymentReceiptInputSchema>;

const AnalyzePaymentReceiptOutputSchema = z.object({
  extractedValue: z.number().describe('The total transaction value extracted from the receipt in BRL.'),
  success: z.boolean().describe('Whether the value was successfully extracted.'),
  error: z.string().optional().describe('Error message if extraction failed.'),
});
export type AnalyzePaymentReceiptOutput = z.infer<typeof AnalyzePaymentReceiptOutputSchema>;

export async function analyzePaymentReceipt(input: AnalyzePaymentReceiptInput): Promise<AnalyzePaymentReceiptOutput> {
  return analyzePaymentReceiptFlow(input);
}

const analyzePaymentReceiptFlow = ai.defineFlow(
  {
    name: 'analyzePaymentReceiptFlow',
    inputSchema: AnalyzePaymentReceiptInputSchema,
    outputSchema: AnalyzePaymentReceiptOutputSchema,
  },
  async (input) => {
    try {
      const response = await ai.generate({
        prompt: [
          {
            media: {
              url: input.imageUrl,
            },
          },
          {
            text: `Você é um especialista em análise de comprovantes de pagamento com cartão de crédito/débito.

Analise esta imagem de comprovante de pagamento e extraia o VALOR TOTAL da transação.

Instruções:
1. Procure pelo valor total da transação (geralmente indicado como "TOTAL", "VALOR", "AMOUNT" ou similar)
2. O valor deve estar em Reais (R$)
3. Ignore valores parciais, taxas ou descontos - extraia apenas o VALOR TOTAL FINAL
4. Se houver múltiplos valores, extraia o maior (valor total)

Retorne APENAS um JSON válido no seguinte formato:
- Se conseguir extrair o valor: {"extractedValue": NUMERO, "success": true}
- Se NÃO conseguir extrair: {"extractedValue": 0, "success": false, "error": "motivo"}

Exemplos de resposta válida:
{"extractedValue": 150.50, "success": true}
{"extractedValue": 0, "success": false, "error": "Imagem ilegível"}

IMPORTANTE: Retorne APENAS o JSON, sem texto adicional.`,
          },
        ],
      });

      // Parse the response
      const responseText = response.text.trim();

      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          extractedValue: 0,
          success: false,
          error: 'Não foi possível processar a resposta da IA',
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        extractedValue: typeof parsed.extractedValue === 'number' ? parsed.extractedValue : 0,
        success: parsed.success === true,
        error: parsed.error,
      };
    } catch (error) {
      console.error('Error analyzing payment receipt:', error);
      return {
        extractedValue: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido ao analisar comprovante',
      };
    }
  }
);
