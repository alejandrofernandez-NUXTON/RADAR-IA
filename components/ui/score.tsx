import { Badge } from "@/components/ui/badge";
import { scoreTone } from "@/lib/utils";

export function ScoreBadge({ score, label = "Score" }: { score: number; label?: string }) {
  return (
    <Badge tone={scoreTone(score)}>
      {label} {score}
    </Badge>
  );
}
