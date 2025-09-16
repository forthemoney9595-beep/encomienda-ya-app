'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { analyzeDriverReviews, AnalyzeDriverReviewsOutput } from '@/ai/flows/analyze-driver-reviews';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deliveryPersonnel } from '@/lib/placeholder-data';
import { Loader2, Wand2, ThumbsUp, ThumbsDown, Meh } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  driverName: z.string().min(1, 'Please select a driver.'),
  reviewText: z.string().min(10, 'Review must be at least 10 characters.'),
});

export function ReviewAnalyzer() {
  const [analysis, setAnalysis] = useState<AnalyzeDriverReviewsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      driverName: '',
      reviewText: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setAnalysis(null);
    try {
      const result = await analyzeDriverReviews(values);
      setAnalysis(result);
    } catch (error) {
      console.error("Error analyzing review:", error);
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: "There was an error processing the review. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  const SentimentIcon = ({ sentiment }: { sentiment: string }) => {
    switch (sentiment.toLowerCase()) {
      case 'positive':
        return <ThumbsUp className="h-6 w-6 text-green-500" />;
      case 'negative':
        return <ThumbsDown className="h-6 w-6 text-red-500" />;
      default:
        return <Meh className="h-6 w-6 text-yellow-500" />;
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Submit a Review</CardTitle>
          <CardDescription>Enter a customer's review for a driver to analyze it.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="driverName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a driver" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {deliveryPersonnel.map((driver) => (
                          <SelectItem key={driver.id} value={driver.name}>
                            {driver.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reviewText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Review Text</FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g., 'The driver was very fast and friendly!'" {...field} rows={6} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Analyze Review
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Analysis Result</CardTitle>
          <CardDescription>The AI-powered analysis of the review will appear here.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow">
          {isLoading && (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p>Analyzing...</p>
              </div>
            </div>
          )}
          {!isLoading && analysis && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Sentiment</h3>
                <div className="flex items-center gap-2 mt-1">
                  <SentimentIcon sentiment={analysis.sentiment} />
                  <p className="text-lg font-semibold capitalize">{analysis.sentiment}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Summary</h3>
                <p className="mt-1">{analysis.summary}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Performance Tags</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {analysis.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-base">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
           {!isLoading && !analysis && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p>Results will be shown here once a review is submitted.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
