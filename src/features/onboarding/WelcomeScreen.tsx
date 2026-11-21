import { Cloud, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/Button";
import { CofferLogo } from "@/components/CofferLogo";
import { t } from "@/lib/i18n";
import { StepFrame } from "./StepFrame";

/**
 * The count in "Works with N+ providers": the presets rounded down to a ten, so
 * adding one provider does not make the claim wrong the other way.
 */
export function providerCountClaim(presets: number): number {
  return Math.floor(presets / 10) * 10;
}

/** O10. "Explore with sample files" is not drawn: the demo is v1 (FR-120, AC-1.1). */
export function WelcomeScreen({ onConnect }: { onConnect: () => void }) {
  const facts = [
    { icon: KeyRound, text: t("ob.factKeys") },
    { icon: ShieldCheck, text: t("ob.factFree") },
    { icon: Cloud, text: t("ob.factProviders", { count: providerCountClaim(__PROVIDER_COUNT__) }) },
  ];
  return (
    <StepFrame title={t("ob.welcome.title")} focusHeading={false} lead={<CofferLogo width={24} label={t("app.name")} className="self-start" />}>
      <p className="text-md text-fg-muted">{t("ob.welcome.body")}</p>
      <ul aria-label={t("ob.welcome.factsLabel")} className="flex flex-col gap-3">
        {facts.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-base">
            <Icon aria-hidden="true" className="size-5 shrink-0 text-accent" />
            {text}
          </li>
        ))}
      </ul>
      <Button variant="primary" size="lg" block onClick={onConnect}>
        {t("ob.connect")}
      </Button>
    </StepFrame>
  );
}
