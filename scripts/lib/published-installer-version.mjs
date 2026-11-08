import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Hosted installers select an observed published release, not the source candidate. */
export function verifyPublishedInstallerVersion(root) {
  const read = path => readFileSync(resolve(root, path), "utf8");
  const channel = JSON.parse(read("website/install-channel.json"));
  const publication = JSON.parse(read("website/publication-status.json"));
  const release = channel.channels?.githubRelease;
  const version = release?.version;
  if (release?.status !== "available" || typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Hosted installers require an explicit available GitHub release version in install-channel.json");
  }
  const published = publication.channels?.githubRelease;
  if (published?.status !== "live" || published.version !== version) {
    throw new Error(`Hosted installer version ${version} has no matching live GitHub release in publication-status.json`);
  }
  const unix = read("website/install.sh");
  const windows = read("website/install.ps1");
  const pins = {
    unixInstaller: /PINNED_AMC_RELEASE_VERSION="([^"]+)"/.exec(unix)?.[1],
    windowsInstaller: /\$PinnedAmcReleaseVersion = "([^"]+)"/.exec(windows)?.[1],
  };
  for (const [source, pin] of Object.entries(pins)) {
    if (pin !== version) throw new Error(`Published installer version mismatch: ${source}=${String(pin)} expected=${version}`);
  }
  if (read("install.sh") !== unix) throw new Error("Repository and hosted Unix installers differ");
  // The homepage download buttons name and link the same pinned release, so the pins pull request moves them too.
  const homepage = read("website/index.html");
  if (homepage.includes("AgentMaturityCompass/releases/latest")) {
    throw new Error("website/index.html links releases/latest; link the pinned release tag instead");
  }
  const downloads = [...homepage.matchAll(/<a\b[^>]*\bhref="https:\/\/github\.com\/AgentMaturity\/AgentMaturityCompass\/releases\/([^"]*)"[^>]*>\s*(Download\b[^<]*?)\s*<\/a>/g)];
  for (const [, target, label] of downloads) {
    if (target !== `tag/v${version}` || !label.includes(` ${version} `)) {
      throw new Error(`Published installer version mismatch: website/index.html "${label}" links releases/${target} expected=${version}`);
    }
  }
  return { version, ...pins, websiteDownloads: downloads.length };
}
