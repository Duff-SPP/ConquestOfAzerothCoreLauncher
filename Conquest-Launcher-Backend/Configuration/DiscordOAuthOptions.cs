namespace Conquest.Launcher.Backend.Configuration;

public sealed class DiscordOAuthOptions
{
    public const string SectionName = "DiscordOAuth";

    public bool Enabled { get; init; }
    public string ClientId { get; init; } = "";
    public string ClientSecret { get; init; } = "";
    public string RedirectUri { get; init; } = "";
    public int StateMinutes { get; init; } = 10;
}
