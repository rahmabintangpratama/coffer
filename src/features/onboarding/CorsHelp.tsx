import { useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { HelpInline } from "@/components/HelpInline";
import { Tab, TabList, TabPanel, Tabs } from "@/components/Tabs";
import { t } from "@/lib/i18n";
import { corsJson, corsXml } from "@/lib/s3/cors";
import type { ProviderPreset } from "@/lib/types";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * O42: the bucket refused the browser's request. Shows the exact origin to
 * allow and the rule in JSON and XML. The rule never contains `*` (AC-6.2).
 */
export function CorsHelp({
  preset,
  origin,
  bucket,
  onCheckAgain,
}: {
  preset: ProviderPreset;
  /** window.location.origin, passed in so a test can set it. */
  origin: string;
  bucket: string | undefined;
  onCheckAgain: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    setCopied((await copyText(text)) ? id : null);
  };
  const rules = [
    { id: "json", label: t("ob.cors.tabJson"), text: corsJson(origin) },
    { id: "xml", label: t("ob.cors.tabXml"), text: corsXml(origin) },
  ];
  const browserWarning = preset.badges?.some((badge) => badge.tone === "warning") ?? false;

  return (
    <div data-component="CorsHelp" className="flex flex-col gap-5">
      <p className="text-base">{t("ob.cors.why", { origin })}</p>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg-muted">{t("ob.cors.originLabel")}</span>
        <code className="rounded-sm border border-line bg-subtle px-3 py-2 font-mono text-base break-all">{origin}</code>
      </div>
      {browserWarning ? <Banner tone="warning">{t("ob.cred.browserWarn", { provider: preset.displayName })}</Banner> : null}

      <ol className="flex list-decimal flex-col gap-1 pl-5 text-base">
        <li>{t("ob.cors.stepOpen", { target: bucket ?? t("ob.cors.anyBucket"), provider: preset.displayName })}</li>
        <li>{t("ob.cors.s2")}</li>
      </ol>

      <Tabs defaultValue="json">
        <TabList label={t("ob.cors.ruleLabel")}>
          {rules.map((rule) => (
            <Tab key={rule.id} value={rule.id}>
              {rule.label}
            </Tab>
          ))}
        </TabList>
        {rules.map((rule) => (
          <TabPanel key={rule.id} value={rule.id}>
            <div className="flex flex-col gap-2">
              <pre className="overflow-x-auto rounded-sm border border-line bg-subtle p-3 font-mono text-sm" tabIndex={0}>
                {rule.text}
              </pre>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void copy(rule.id, rule.text);
                  }}
                >
                  {t("ob.cors.copyRule")}
                </Button>
                <span role="status" className="ml-3 text-sm text-fg-muted">
                  {copied === rule.id ? t("toast.copied") : ""}
                </span>
              </div>
            </div>
          </TabPanel>
        ))}
      </Tabs>

      <Banner tone="warning">{t("ob.cors.warn")}</Banner>

      <HelpInline summary={t("ob.help.title")}>
        <ol className="flex list-decimal flex-col gap-1 pl-5 pt-1">
          {preset.helpSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </HelpInline>

      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" block onClick={onCheckAgain}>
          {t("ob.cors.cta")}
        </Button>
        <p className="text-sm text-fg-muted">{t("ob.cors.stillFailing")}</p>
      </div>
    </div>
  );
}
