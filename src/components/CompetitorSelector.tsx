import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CompetitorSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export const CompetitorSelector = ({ value, onChange }: CompetitorSelectorProps) => {
  return (
    <div className="w-full max-w-xs">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-card">
          <SelectValue placeholder="Selecione o concorrente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="italo">Super Italo</SelectItem>
          <SelectItem value="marcon">Marcon</SelectItem>
          <SelectItem value="alfa">Alfa</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
