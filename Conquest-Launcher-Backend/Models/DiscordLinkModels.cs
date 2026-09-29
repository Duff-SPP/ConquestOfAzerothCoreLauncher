namespace Conquest.Launcher.Backend.Models;

public sealed record DiscordLinkStatus(
    bool Available,
    bool Linked,
    string? UserId,
    string? Username,
    string? GlobalName,
    DateTime? LinkedAt,
    string? Message = null);

public sealed record DiscordLinkStart(string AuthorizeUrl, int ExpiresInSeconds);
public sealed record DiscordLinkCallbackResult(bool Success, string Message);
