class Amc < Formula
  desc "AI Agent Trust Scoring — execution-verified maturity scores with cryptographic evidence"
  homepage "https://agentmaturity.co/"
  url "https://registry.npmjs.org/agent-maturity-compass/-/agent-maturity-compass-1.0.0.tgz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"
  head "https://github.com/AgentMaturity/AgentMaturityCompass.git", branch: "main"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/amc"]
  end

  def post_install
    ohai "AMC installed! Run: amc init && amc quickscore"
    ohai "Docs: https://agentmaturity.co/"
  end

  test do
    system "#{bin}/amc", "--version"
  end
end
