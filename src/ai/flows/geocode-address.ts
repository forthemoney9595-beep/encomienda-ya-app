'use server';
/**
 * @fileOverview A flow for geocoding addresses using a simulated tool.
 *
 * - geocodeAddress - A function that handles the geocoding process.
 * - GeocodeAddressInput - The input type for the geocodeAddress function.
 * - GeocodeAddressOutput - The return type for the geocodeAddress function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Simulate a database of known addresses for the prototype
const knownAddresses: Record<string, { lat: number, lon: number }> = {
    "Calle Pizza 123": { lat: 40.7128, lon: -74.0060 },
    "Av. Hamburguesa 456": { lat: 34.0522, lon: -118.2437 },
    "Paseo Sushi 789": { lat: 35.6895, lon: 139.6917 },
};

const geocodeTool = ai.defineTool(
    {
        name: 'geocodeTool',
        description: 'Convierte una dirección postal en coordenadas de latitud y longitud. Devuelve 0,0 si no se encuentra.',
        inputSchema: z.object({
            address: z.string().describe('La dirección a geocodificar.'),
        }),
        outputSchema: z.object({
            lat: z.number().describe('La latitud de la dirección.'),
            lon: z.number().describe('La longitud de la dirección.'),
        }),
    },
    async (input) => {
        // In a real app, this would call a service like Google Maps Geocoding API.
        // For this prototype, we'll use a simple lookup.
        console.log(`Geocoding (simulated): ${input.address}`);
        for (const [knownAddress, coords] of Object.entries(knownAddresses)) {
            if (input.address.toLowerCase().includes(knownAddress.toLowerCase().substring(0, 10))) {
                return coords;
            }
        }
        
        // Return a pseudo-random, but deterministic, location for unknown addresses
        const hash = input.address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const lat = 40.7 + (hash % 1000) / 10000;
        const lon = -74.0 + (hash % 2000) / 10000;
        return { lat, lon };
    }
);

const GeocodeAddressInputSchema = z.object({
    address: z.string().describe("La dirección postal a convertir en coordenadas."),
});
export type GeocodeAddressInput = z.infer<typeof GeocodeAddressInputSchema>;

const GeocodeAddressOutputSchema = z.object({
    lat: z.number().describe("La latitud de la dirección."),
    lon: z.number().describe("La longitud de la dirección."),
});
export type GeocodeAddressOutput = z.infer<typeof GeocodeAddressOutputSchema>;

const geocodeAddressPrompt = ai.definePrompt({
    name: 'geocodeAddressPrompt',
    input: { schema: GeocodeAddressInputSchema },
    output: { schema: GeocodeAddressOutputSchema },
    tools: [geocodeTool],
    prompt: `Usa la herramienta geocodeTool para encontrar las coordenadas de la dirección proporcionada. Dirección: {{{address}}}`,
});

const geocodeAddressFlow = ai.defineFlow(
    {
        name: 'geocodeAddressFlow',
        inputSchema: GeocodeAddressInputSchema,
        outputSchema: GeocodeAddressOutputSchema,
    },
    async (input) => {
        const result = await geocodeAddressPrompt(input);
        return result.output!;
    }
);


export async function geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeAddressOutput> {
    return geocodeAddressFlow(input);
}
