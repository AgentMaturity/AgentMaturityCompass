// Semantic Kernel Agent with AMC Integration
//
// Demonstrates a .NET Semantic Kernel agent that routes LLM calls through
// the AMC Gateway for evidence collection and maturity scoring.
//
// Semantic Kernel reads OPENAI_BASE_URL from the environment when configured
// with a custom endpoint — AMC integration is straightforward.

using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using System.ComponentModel;

// ─── AMC Integration ───────────────────────────────────────────────
// AMC sets OPENAI_BASE_URL and OPENAI_API_KEY to route calls through the gateway.
var gatewayUrl = Environment.GetEnvironmentVariable("AMC_GATEWAY_URL")
              ?? Environment.GetEnvironmentVariable("OPENAI_BASE_URL");
var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? "";

if (!string.IsNullOrEmpty(gatewayUrl))
{
    Console.WriteLine($"[AMC] Routing LLM calls through gateway: {gatewayUrl}");
}
// ────────────────────────────────────────────────────────────────────

// Build the kernel with OpenAI (or AMC Gateway as proxy)
var builder = Kernel.CreateBuilder();

if (!string.IsNullOrEmpty(gatewayUrl))
{
    // Use custom endpoint (AMC Gateway)
    builder.AddOpenAIChatCompletion(
        modelId: "gpt-4o-mini",
        apiKey: apiKey,
        endpoint: new Uri(gatewayUrl)
    );
}
else
{
    builder.AddOpenAIChatCompletion(
        modelId: "gpt-4o-mini",
        apiKey: apiKey
    );
}

// Register plugins (tools)
builder.Plugins.AddFromType<MathPlugin>();
var kernel = builder.Build();

// Run a simple prompt
Console.WriteLine("=== Semantic Kernel Agent ===");

var chatService = kernel.GetRequiredService<IChatCompletionService>();
var history = new ChatHistory();
history.AddSystemMessage("You are a helpful math tutor. Use the calculator plugin when needed.");
history.AddUserMessage("What is 42 * 17? Use the calculator to verify.");

// Enable auto function calling
var settings = new OpenAIPromptExecutionSettings
{
    ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions
};

var response = await chatService.GetChatMessageContentAsync(history, settings, kernel);
Console.WriteLine($"Response: {response.Content}");

Console.WriteLine("\n[AMC] All LLM calls captured as evidence via gateway proxy.");

// ─── Plugin Definition ─────────────────────────────────────────────
public class MathPlugin
{
    [KernelFunction, Description("Multiply two numbers")]
    public static double Multiply(
        [Description("First number")] double a,
        [Description("Second number")] double b)
    {
        return a * b;
    }

    [KernelFunction, Description("Add two numbers")]
    public static double Add(
        [Description("First number")] double a,
        [Description("Second number")] double b)
    {
        return a + b;
    }
}
