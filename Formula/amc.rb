class Amc < Formula
  desc "AI Agent Trust Scoring — execution-verified maturity scores with cryptographic evidence"
  homepage "https://agentmaturity.co/"
  url "https://github.com/AgentMaturity/AgentMaturityCompass/releases/download/v1.1.0/agent-maturity-compass-1.1.0.tgz"
  sha256 "c1a9931a50ff1c1e2be3e0965a4e37d34f8c6181040f98dafe24fb373fd440d7"
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
