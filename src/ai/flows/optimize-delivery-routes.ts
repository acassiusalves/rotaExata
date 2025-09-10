'use server';

/**
 * @fileOverview This file defines a Genkit flow for optimizing delivery routes.
 *
 * - optimizeDeliveryRoutes - A function that suggests optimized delivery routes based on current location, delivery locations, and real-time traffic data.
 * - OptimizeDeliveryRoutesInput - The input type for the optimizeDeliveryRoutes function.
 * - OptimizeDeliveryRoutesOutput - The return type for the optimizeDeliveryRoutes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeDeliveryRoutesInputSchema = z.object({
  currentLocationLat: z.number().describe('The latitude of the driver\u0027s current location.'),
  currentLocationLng: z.number().describe('The longitude of the driver\u0027s current location.'),
  deliveryLocations: z
    .array(
      z.object({
        lat: z.number().describe('The latitude of the delivery location.'),
        lng: z.number().describe('The longitude of the delivery location.'),
        orderId: z.string().describe('The ID of the order associated with this location.'),
      })
    )
    .describe('An array of delivery locations with latitude, longitude, and order ID.'),
});
export type OptimizeDeliveryRoutesInput = z.infer<typeof OptimizeDeliveryRoutesInputSchema>;

const OptimizeDeliveryRoutesOutputSchema = z.object({
  optimizedRoutes: z
    .array(
      z.object({
        orderId: z.string().describe('The ID of the order associated with this location.'),
        lat: z.number().describe('The latitude of the delivery location.'),
        lng: z.number().describe('The longitude of the delivery location.'),
      })
    )
    .describe('An array of optimized delivery routes, each with order ID, latitude, and longitude.'),
  estimatedTotalTravelTimeMinutes: z
    .number()
    .optional()
    .describe('Estimated total travel time in minutes for the optimized route.'),
  estimatedTotalDistanceKm: z
    .number()
    .optional()
    .describe('Estimated total travel distance in kilometers for the optimized route.'),
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

Given the driver's current location and a list of delivery locations, you will determine the most efficient route to minimize travel time and distance.

Driver's current location: Latitude: {{{currentLocationLat}}}, Longitude: {{{currentLocationLng}}}

Delivery Locations:
{{#each deliveryLocations}}
- Order ID: {{{orderId}}}, Latitude: {{{lat}}}, Longitude: {{{lng}}}
{{/each}}

Consider real-time traffic data and provide the optimized routes.

Output the optimized routes as an array of objects, including the order ID, latitude, and longitude for each delivery location in the optimized order.
Include also the estimated total travel time in minutes and the estimated total distance in kilometers.
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
    return output!;
  }
);
