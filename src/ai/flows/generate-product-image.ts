
'use server';

/**
 * @fileOverview Generates a product image using AI based on its name and description.
 * 
 * - generateProductImage - A function that handles the image generation.
 * - GenerateProductImageInput - The input type for the function.
 * - GenerateProductImageOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateProductImageInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productDescription: z.string().describe('A brief description of the product.'),
});
export type GenerateProductImageInput = z.infer<typeof GenerateProductImageInputSchema>;

const GenerateProductImageOutputSchema = z.object({
  imageUrl: z.string().describe("The data URI of the generated image. Expected format: 'data:image/png;base64,<encoded_data>'."),
});
export type GenerateProductImageOutput = z.infer<typeof GenerateProductImageOutputSchema>;


export async function generateProductImage(
  input: GenerateProductImageInput
): Promise<GenerateProductImageOutput> {
  return generateProductImageFlow(input);
}


const generateProductImageFlow = ai.defineFlow(
  {
    name: 'generateProductImageFlow',
    inputSchema: GenerateProductImageInputSchema,
    outputSchema: GenerateProductImageOutputSchema,
  },
  async (input) => {
    const { media } = await ai.generate({
        model: 'googleai/imagen-4.0-fast-generate-001',
        prompt: `Eres un asistente de fotografía culinaria experto. Tu trabajo es generar una foto para el menú de un restaurante que sea apetitosa y profesional.
        El producto es: '${input.productName}'. 
        Descripción: '${input.productDescription}'.
        
        Si la descripción es breve o genérica, toma la iniciativa creativa para imaginar una escena visualmente atractiva para el producto. Por ejemplo, si el producto es solo 'Refresco', podrías imaginarlo en un vaso alto con hielo, una rodaja de limón y gotas de condensación.
        
        La imagen debe estar sobre un fondo limpio y neutro, y parecer realista y atractiva.`,
    });

    if (!media.url) {
        throw new Error('La generación de la imagen ha fallado.');
    }
    
    return {
        imageUrl: media.url,
    };
  }
);
