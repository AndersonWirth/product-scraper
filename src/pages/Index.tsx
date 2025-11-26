import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { CompetitorSelector } from "@/components/CompetitorSelector";
import { ItaloScraper } from "@/components/ItaloScraper";
import { MarconScraper } from "@/components/MarconScraper";
import { AlfaScraper } from "@/components/AlfaScraper";

const Index = () => {
  const [selectedCompetitor, setSelectedCompetitor] = useState("italo");

  const renderCompetitorScraper = () => {
    switch (selectedCompetitor) {
      case "italo":
        return <ItaloScraper />;
      case "marcon":
        return <MarconScraper />;
      case "alfa":
        return <AlfaScraper />;
      default:
        return <ItaloScraper />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <ShoppingBag className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Scraping Concorrentes
              </h1>
              <p className="text-sm text-muted-foreground">
                Busque e compare produtos de diferentes lojas
              </p>
            </div>
          </div>
          
          <CompetitorSelector
            value={selectedCompetitor}
            onChange={setSelectedCompetitor}
          />
        </div>

        {renderCompetitorScraper()}
      </div>
    </div>
  );
};

export default Index;
