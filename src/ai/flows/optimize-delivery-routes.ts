'use server';

/**
 * @fileOverview This file defines a Genkit flow for optimizing delivery routes.
 *
 * - optimizeDeliveryRoutes - A function that suggests optimized delivery routes based on a list of delivery locations.
 * - OptimizeDeliveryRoutesInput - The input type for the optimizeDeliveryRoutes function.
 * - OptimizeDeliveryRoutesOutput - The return type for the optimizeDeliveryRoutes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeDeliveryRoutesInputSchema = z.object({
  origin: z.object({
    lat: z.number().describe('The latitude of the starting location.'),
    lng: z.number().describe('The longitude of the starting location.'),
  }),
  deliveryLocations: z
    .array(
      z.object({
        id: z.string().describe('The unique ID of the stop.'),
        lat: z.number().describe('The latitude of the delivery location.'),
        lng: z.number().describe('The longitude of the delivery location.'),
        hasTimePreference: z.boolean().optional().describe('Whether this stop has a time preference and should be prioritized earlier in the route.'),
      })
    )
    .describe('An array of delivery locations with latitude, longitude, and a unique ID.'),
});
export type OptimizeDeliveryRoutesInput = z.infer<typeof OptimizeDeliveryRoutesInputSchema>;

const OptimizeDeliveryRoutesOutputSchema = z.object({
  optimizedStops: z
    .array(
      z.object({
        id: z.string().describe('The unique ID of the stop.'),
        lat: z.number().describe('The latitude of the delivery location.'),
        lng: z.number().describe('The longitude of the delivery location.'),
      })
    )
    .describe('An array of stops in the optimized order.'),
});
export type OptimizeDeliveryRoutesOutput = z.infer<typeof OptimizeDeliveryRoutesOutputSchema>;

export async function optimizeDeliveryRoutes(
  input: OptimizeDeliveryRoutesInput
): Promise<OptimizeDeliveryRoutesOutput> {
  return optimizeDeliveryRoutesFlow(input);
}

const optimizeDeliveryRoutesPrompt = ai.definePrompt({
  name: 'optimizeDeliveryRoutesPrompt',
  input: {schema: OptimizeDeliveryRoutesInputSchema},
  output: {schema: OptimizeDeliveryRoutesOutputSchema},
  prompt: `You are an expert route optimization specialist for delivery drivers.

Given a starting origin point and a list of delivery locations, you will determine the optimal sequence of stops. The route starts at the origin and must visit every delivery location.

IMPORTANT PRIORITY RULE: Stops marked with "hasTimePreference: true" MUST be visited FIRST, before any other stops. These customers have specific time windows and must be prioritized at the beginning of the route. Among the priority stops, optimize for minimum travel distance. After all priority stops are completed, continue with the remaining stops in the most efficient order.

Origin Location: Latitude: {{{origin.lat}}}, Longitude: {{{origin.lng}}}

Delivery Locations to visit:
{{#each deliveryLocations}}
- Stop ID: {{{id}}}, Latitude: {{{lat}}}, Longitude: {{{lng}}}{{#if hasTimePreference}} [PRIORITY - TIME PREFERENCE]{{/if}}
{{/each}}

Your task is to return the list of stops in the optimized order, ensuring all stops with time preference come first (optimized among themselves), followed by the remaining stops (also optimized). The output should be an array of stop objects, sorted by the optimized route sequence.
`,
});

const optimizeDeliveryRoutesFlow = ai.defineFlow(
  {
    name: 'optimizeDeliveryRoutesFlow',
    inputSchema: OptimizeDeliveryRoutesInputSchema,
    outputSchema: OptimizeDeliveryRoutesOutputSchema,
  },
  async input => {
    const {output} = await optimizeDeliveryRoutesPrompt(input);
    // The output from the prompt is already the sorted list of stops.
    // We need to ensure the format matches OptimizeDeliveryRoutesOutputSchema
    return { optimizedStops: output!.optimizedStops };
  }
);
