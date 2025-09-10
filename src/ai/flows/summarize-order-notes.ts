// Summarizes lengthy order notes or special instructions for dispatchers to quickly understand critical information.

'use server';

/**
 * @fileOverview Summarizes lengthy order notes for dispatchers.
 *
 * - summarizeOrderNotes - A function that summarizes order notes.
 * - SummarizeOrderNotesInput - The input type for the summarizeOrderNotes function.
 * - SummarizeOrderNotesOutput - The return type for the summarizeOrderNotes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeOrderNotesInputSchema = z.object({
  notes: z.string().describe('The order notes to summarize.'),
});
export type SummarizeOrderNotesInput = z.infer<typeof SummarizeOrderNotesInputSchema>;

const SummarizeOrderNotesOutputSchema = z.object({
  summary: z.string().describe('The summarized order notes.'),
});
export type SummarizeOrderNotesOutput = z.infer<typeof SummarizeOrderNotesOutputSchema>;

export async function summarizeOrderNotes(input: SummarizeOrderNotesInput): Promise<SummarizeOrderNotesOutput> {
  return summarizeOrderNotesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeOrderNotesPrompt',
  input: {schema: SummarizeOrderNotesInputSchema},
  output: {schema: SummarizeOrderNotesOutputSchema},
  prompt: `You are an expert summarizer, tasked with summarizing order notes for dispatchers.

  Please provide a concise summary of the following order notes, highlighting any critical information that the driver should be aware of:

  Order Notes: {{{notes}}}`,
});

const summarizeOrderNotesFlow = ai.defineFlow(
  {
    name: 'summarizeOrderNotesFlow',
    inputSchema: SummarizeOrderNotesInputSchema,
    outputSchema: SummarizeOrderNotesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
