namespace Conquest.Launcher.Backend.Configuration;

public sealed class TurnstileOptions
{
    public const string SectionName = "Turnstile";

    public bool Enabled { get; init; } = false;
    public string SiteKey { get; init; } = string.Empty;
    public string SecretKey { get; init; } = string.Empty;
    public string ExpectedAction { get; init; } = "coa-register";
    public string[] AllowedHostnames { get; init; } = [];
}
