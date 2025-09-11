'use server';

/**
 * @fileOverview Extracts addresses from a block of text.
 *
 * - extractAddressesFromText - A function that parses a string and returns a list of addresses.
 * - ExtractAddressesInput - The input type for the extractAddressesFromText function.
 * - ExtractAddressesOutput - The return type for the extractAddressesFromText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractAddressesInputSchema = z.object({
  text: z.string().describe('A block of text containing one or more addresses, typically separated by newlines.'),
});
export type ExtractAddressesInput = z.infer<typeof ExtractAddressesInputSchema>;

const ExtractAddressesOutputSchema = z.object({
    addresses: z.array(z.string()).describe('An array of street addresses found in the text.'),
});
export type ExtractAddressesOutput = z.infer<typeof ExtractAddressesOutputSchema>;

export async function extractAddressesFromText(input: ExtractAddressesInput): Promise<ExtractAddressesOutput> {
  return extractAddressesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractAddressesPrompt',
  input: {schema: ExtractAddressesInputSchema},
  output: {schema: ExtractAddressesOutputSchema},
  prompt: `You are an address parsing expert. Your task is to extract all the valid street addresses from the provided text.
Each address is usually on a new line. Identify each address and return them as a list of strings.

Text to parse:
{{{text}}}
`,
});

const extractAddressesFlow = ai.defineFlow(
  {
    name: 'extractAddressesFlow',
    inputSchema: ExtractAddressesInputSchema,
    outputSchema: ExtractAddressesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
