// Publish the built site (web/dist) to the gh-pages branch of the repo's `origin` remote.
//
//   npm run build && node scripts/publish-pages.mjs [--with-lyrics] [--dry-run]
//
// By default the lyrics text is stripped from data/lyrics/*.json (only the source links
// are kept), because song lyrics are copyrighted and GitHub Pages sites are public.
// The branch is rebuilt from scratch on every publish (a single commit, force-pushed).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const webDir = resolve(import.meta.dirname, "..");
const dist = join(webDir, "dist");
const withLyrics = process.argv.includes("--with-lyrics");
const dryRun = process.argv.includes("--dry-run");

const git = (args, cwd, inherit = false) =>
  execFileSync("git", args, { cwd, stdio: inherit ? "inherit" : ["ignore", "pipe", "inherit"] })
    ?.toString()
    .trim();

if (!existsSync(join(dist, "index.html"))) {
  console.error("web/dist is missing. Run `npm run build` first.");
  process.exit(1);
}

const config = (key, fallback) => {
  try {
    return git(["config", key], webDir) || fallback;
  } catch {
    return fallback; // `git config` exits non-zero when the key is unset
  }
};
const remote = git(["remote", "get-url", "origin"], webDir);
const name = config("user.name", "Song Graph publisher");
const email = config("user.email", "song-graph@users.noreply.github.com");

const out = mkdtempSync(join(tmpdir(), "song-graph-pages-"));
cpSync(dist, out, { recursive: true });
writeFileSync(join(out, ".nojekyll"), ""); // serve files as-is, skip Jekyll

if (!withLyrics) {
  const dir = join(out, "data", "lyrics");
  for (const f of readdirSync(dir)) {
    const rows = JSON.parse(readFileSync(join(dir, f), "utf8"));
    writeFileSync(join(dir, f), JSON.stringify(rows.map(([, link]) => ["", link])));
  }
}

git(["init", "-q", "-b", "gh-pages"], out);
git(["add", "-A"], out);
git(["-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-q", "-m", "Publish Song Graph"], out);

if (dryRun) {
  console.log(`Dry run: site prepared in ${out} (lyrics ${withLyrics ? "included" : "stripped"}). Not pushed.`);
} else {
  // The temporary repo has no config of its own, so carry over the GitHub account this
  // repo is set to push with (credential.<url>.username); otherwise git would use the
  // machine's default saved login.
  const account = (() => {
    try {
      return git(["config", "--get-urlmatch", "credential.username", remote], webDir);
    } catch {
      return "";
    }
  })();
  const auth = account ? ["-c", `credential.username=${account}`] : [];
  console.log(`Pushing to ${remote} (gh-pages)${account ? ` as ${account}` : ""}…`);
  git([...auth, "push", "--force", remote, "gh-pages"], out, true);
  rmSync(out, { recursive: true, force: true });
  console.log("Published. GitHub Pages serves it from the gh-pages branch.");
}
