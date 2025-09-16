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
    .describe('The text of the customer review for a delivery driver.'),
  driverName: z.string().describe('The name of the delivery driver.'),
});
export type AnalyzeDriverReviewsInput = z.infer<
  typeof AnalyzeDriverReviewsInputSchema
>;

const AnalyzeDriverReviewsOutputSchema = z.object({
  sentiment: z
    .string()
    .describe(
      'The sentiment of the review (e.g., positive, negative, neutral)'
    ),
  summary: z
    .string()
    .describe('A short summary of the review, highlighting key points.'),
  tags: z
    .array(z.string())
    .describe(
      'Tags extracted from the review, such as \'speed\', \'friendliness\', \'accuracy\', etc.'
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
  prompt: `You are an AI assistant tasked with analyzing customer reviews of delivery drivers.

  Driver Name: {{driverName}}

  Analyze the following customer review:
  {{{reviewText}}}

  Determine the sentiment of the review (positive, negative, or neutral).
  Create a short summary of the review, highlighting the key points mentioned by the customer.
  Extract relevant tags from the review that describe the driver's performance.  Some example tags are: speed, friendliness, accuracy, communication, professionalism.

  Return the sentiment, summary, and tags in the specified JSON format. Make sure the 'tags' field is an array of strings.
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
