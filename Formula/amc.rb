class Amc < Formula
  desc "AI Agent Trust Scoring — execution-verified maturity scores with cryptographic evidence"
  homepage "https://agentmaturity.co/"
  url "https://github.com/AgentMaturity/AgentMaturityCompass/releases/download/v1.1.1/agent-maturity-compass-1.1.1.tgz"
  sha256 "dfc370a884803159a7d8b8a42830c3f8303747a8f2caaa0c5f00513d74f9fbf6"
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
