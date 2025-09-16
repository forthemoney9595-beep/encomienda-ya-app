import PageHeader from "@/components/page-header";
import { ReviewAnalyzer } from "./review-analyzer";

export default function DriverReviewsPage() {
  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Driver Review Analysis"
        description="Use AI to analyze customer reviews and automatically tag driver performance."
      />
      <ReviewAnalyzer />
    </div>
  );
}
