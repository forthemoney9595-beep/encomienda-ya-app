'use server';

/**
 * @fileOverview Analyzes customer reviews of delivery drivers using AI.
 *
 * - analyzeDriverReviews - A function that handles the analysis of driver reviews.
 * - AnalyzeDriverReviewsInput - The input type for the analyzeDriverReviews function.
 * - AnalyzeDriverReviewsOutput - The return type for the analyzeDriverReviews function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeDriverReviewsInputSchema = z.object({
  reviewText: z
    .string()
    .describe('El texto de la reseña del cliente para un conductor de reparto.'),
  driverName: z.string().describe('El nombre del conductor de reparto.'),
});
export type AnalyzeDriverReviewsInput = z.infer<
  typeof AnalyzeDriverReviewsInputSchema
>;

const AnalyzeDriverReviewsOutputSchema = z.object({
  sentiment: z
    .string()
    .describe(
      'El sentimiento de la reseña (ej. positivo, negativo, neutral)'
    ),
  summary: z
    .string()
    .describe('Un breve resumen de la reseña, destacando los puntos clave.'),
  tags: z
    .array(z.string())
    .describe(
      'Etiquetas extraídas de la reseña, como \'velocidad\', \'amabilidad\', \'precisión\', etc.'
    ),
});
export type AnalyzeDriverReviewsOutput = z.infer<
  typeof AnalyzeDriverReviewsOutputSchema
>;

export async function analyzeDriverReviews(
  input: AnalyzeDriverReviewsInput
): Promise<AnalyzeDriverReviewsOutput> {
  return analyzeDriverReviewsFlow(input);
}

const analyzeDriverReviewsPrompt = ai.definePrompt({
  name: 'analyzeDriverReviewsPrompt',
  input: {schema: AnalyzeDriverReviewsInputSchema},
  output: {schema: AnalyzeDriverReviewsOutputSchema},
  prompt: `Eres un asistente de IA encargado de analizar las reseñas de los clientes sobre los conductores de reparto.

Nombre del conductor: {{driverName}}

Analiza la siguiente reseña de cliente:
{{{reviewText}}}

Determina el sentimiento de la reseña (positivo, negativo o neutral).
Crea un breve resumen de la reseña, destacando los puntos clave mencionados por el cliente.
Extrae etiquetas relevantes de la reseña que describan el desempeño del conductor. Algunos ejemplos de etiquetas son: velocidad, amabilidad, precisión, comunicación, profesionalismo.

Devuelve el sentimiento, el resumen y las etiquetas en el formato JSON especificado. Asegúrate de que el campo 'tags' sea un array de strings.
  `,
});

const analyzeDriverReviewsFlow = ai.defineFlow(
  {
    name: 'analyzeDriverReviewsFlow',
    inputSchema: AnalyzeDriverReviewsInputSchema,
    outputSchema: AnalyzeDriverReviewsOutputSchema,
  },
  async input => {
    const {output} = await analyzeDriverReviewsPrompt(input);
    return output!;
  }
);
