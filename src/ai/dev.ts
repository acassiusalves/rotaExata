import { config } from 'dotenv';
config();

import '@/ai/flows/optimize-delivery-routes.ts';
import '@/ai/flows/summarize-order-notes.ts';
import '@/ai/flows/extract-addresses-from-text.ts';
