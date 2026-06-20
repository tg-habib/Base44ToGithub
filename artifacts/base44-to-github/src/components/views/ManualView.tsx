import { BookOpen, Terminal, Download, Copy } from "lucide-react";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { InfoBanner } from "@/components/shared/InfoBanner";

export function ManualView() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Manual methods</h1>
            <p className="text-sm text-muted-foreground">Other ways to export your Base44 source code.</p>
          </div>
        </div>
      </div>

      <InfoBanner variant="info" title="When to use this">
        The Eject tab handles everything automatically. Use these manual methods if you prefer the CLI, need offline access, or want to run the export yourself.
      </InfoBanner>

      {/* Method 1: cURL */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <Terminal className="h-3.5 w-3.5 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">cURL — Download the archive</p>
            <p className="text-xs text-muted-foreground">Works in any terminal. Downloads a .tar.gz of your entire app.</p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <CodeBlock code={`curl -o my-app.tar.gz \\
  "https://app.base44.com/api/apps/{YOUR_APP_ID}/eject?api_key={YOUR_API_KEY}"`} />
          <CodeBlock code={`# Then extract it:
tar -xzf my-app.tar.gz -C ./my-app-source`} />
          <p className="text-xs text-muted-foreground">
            Find <code className="bg-muted px-1 rounded">YOUR_APP_ID</code> in Base44 → Settings. The{" "}
            <code className="bg-muted px-1 rounded">api_key</code> is the SDK runtime key (not a Bearer token).
          </p>
        </div>
      </div>

      {/* Method 2: wget */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <Download className="h-3.5 w-3.5 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">wget alternative</p>
            <p className="text-xs text-muted-foreground">If cURL is not available.</p>
          </div>
        </div>
        <div className="p-5">
          <CodeBlock code={`wget -O my-app.tar.gz \\
  "https://app.base44.com/api/apps/{YOUR_APP_ID}/eject?api_key={YOUR_API_KEY}"`} />
        </div>
      </div>

      {/* Method 3: Node.js script */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <Copy className="h-3.5 w-3.5 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Node.js script — download &amp; extract</p>
            <p className="text-xs text-muted-foreground">Useful for automation or CI pipelines.</p>
          </div>
        </div>
        <div className="p-5">
          <CodeBlock code={`import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { extract } from "tar-stream";

const APP_ID  = process.env.BASE44_APP_ID;
const API_KEY = process.env.BASE44_API_KEY;

const res = await fetch(
  \`https://app.base44.com/api/apps/\${APP_ID}/eject?api_key=\${API_KEY}\`
);

const gunzip = createGunzip();
const tar    = extract();

tar.on("entry", (header, stream, next) => {
  // header.name is the file path
  stream.resume(); // or pipe to a file
  stream.on("end", next);
});

await pipeline(res.body, gunzip, tar);
console.log("Done!");`} />
        </div>
      </div>

      {/* Method 4: then push to GitHub */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground">After downloading — push to GitHub with git</p>
        </div>
        <div className="p-5 space-y-3">
          <CodeBlock code={`cd ./my-app-source
git init
git add -A
git commit -m "feat: eject from Base44"
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main`} />
          <p className="text-xs text-muted-foreground">
            Or use the <strong>Eject</strong> tab to do all of this in a single click.
          </p>
        </div>
      </div>
    </div>
  );
}
