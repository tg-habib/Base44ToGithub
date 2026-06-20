import { HelpCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CodeBlock } from "@/components/shared/CodeBlock";

const FAQS = [
  {
    q: "What does 'Eject' actually do?",
    a: (
      <p>
        It calls <code className="bg-muted px-1 rounded text-xs font-mono">GET https://app.base44.com/api/apps/&#123;appId&#125;/eject?api_key=&#123;apiKey&#125;</code>,
        which returns a gzipped tar archive of all your source files. The server
        extracts that archive and pushes every text file to GitHub as a single commit — no CLI needed.
      </p>
    ),
  },
  {
    q: "Where do I find my App ID?",
    a: (
      <p>
        In Base44, open your app and go to <strong>Settings → App ID</strong>. It also appears in
        the browser URL when you're in the editor, e.g.
        <code className="ml-1 bg-muted px-1 rounded text-xs font-mono">/apps/69dff787f3edfb6f77adcfb0/…</code>
      </p>
    ),
  },
  {
    q: "Where do I find my API Key?",
    a: (
      <div className="space-y-2">
        <p>In Base44, go to <strong>Settings → API Keys</strong> and copy the <strong>SDK runtime key</strong>.</p>
        <p className="text-muted-foreground text-xs">
          Note: this is NOT a CLI auth token and NOT a Bearer token. It only works as a query parameter on the eject endpoint.
        </p>
      </div>
    ),
  },
  {
    q: "GitHub OAuth only works on the deployed app — why?",
    a: (
      <p>
        GitHub OAuth apps only redirect to registered callback URLs. The callback is configured for the
        production URL. On the dev URL, use a Personal Access Token instead — click "use a Personal Access Token"
        on the GitHub connection screen. Generate one at{" "}
        <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
          github.com/settings/tokens
        </a>{" "}
        with the <code className="bg-muted px-1 rounded text-xs font-mono">repo</code> scope.
      </p>
    ),
  },
  {
    q: "Will it overwrite my existing files?",
    a: (
      <p>
        Yes — it creates a single commit that replaces the pushed files. Your full git history
        is preserved. The commit replaces only the files that were in the Base44 export;
        any extra files you added manually will remain untouched.
      </p>
    ),
  },
  {
    q: "Does it work with private repositories?",
    a: (
      <p>
        Yes. Toggle "Private repository" in Step 2. For existing repos, private/public status
        is controlled by GitHub — the toggle only affects <em>newly created</em> repos.
        The GitHub token (OAuth or PAT) always needs{" "}
        <code className="bg-muted px-1 rounded text-xs font-mono">repo</code> scope.
      </p>
    ),
  },
  {
    q: "What files are included?",
    a: (
      <div className="space-y-2">
        <p>All text files from the Base44 export. Skipped automatically:</p>
        <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
          <li><code className="bg-muted px-1 rounded font-mono">.git/</code> — git internals</li>
          <li><code className="bg-muted px-1 rounded font-mono">node_modules/</code> — dependencies</li>
          <li><code className="bg-muted px-1 rounded font-mono">dist/</code> — build output</li>
          <li>Binary files (images, fonts, etc.) are skipped if they can't be decoded as UTF-8</li>
        </ul>
      </div>
    ),
  },
  {
    q: "How long does it take?",
    a: (
      <p>
        Typically <strong>5–15 seconds</strong> for a full eject (100+ files).
        The speed depends on Base44's eject API response time and GitHub's API latency.
      </p>
    ),
  },
  {
    q: "Can I test with cURL?",
    a: (
      <div className="space-y-2">
        <p>Yes — download the archive directly:</p>
        <CodeBlock code={`curl -o my-app.tar.gz \\
  "https://app.base44.com/api/apps/{APP_ID}/eject?api_key={API_KEY}"`} />
      </div>
    ),
  },
];

export function FAQView() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <HelpCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">FAQ &amp; Help</h1>
            <p className="text-sm text-muted-foreground">Common questions about exporting from Base44.</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className={i < FAQS.length - 1 ? "border-b border-border" : ""}>
              <AccordionTrigger className="text-sm font-medium text-foreground px-5 py-4 hover:no-underline hover:bg-muted/30 transition-colors text-left">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed [&_strong]:text-foreground [&_code]:text-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
