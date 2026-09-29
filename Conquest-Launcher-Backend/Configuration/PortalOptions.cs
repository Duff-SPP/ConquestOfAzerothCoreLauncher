namespace Conquest.Launcher.Backend.Configuration;

public sealed class PortalOptions
{
    public const string SectionName = "Portal";

    public string PublicBaseUrl { get; init; } = "https://YOUR.PUBLIC.DOMAIN";
    public int SessionHours { get; init; } = 8;
    public int StoreRequestsPerFiveMinutes { get; init; } = 10;
    public int LoginAttemptsPerTenMinutes { get; init; } = 10;
    public int PasswordResetAttemptsPerHour { get; init; } = 5;
    public int PasswordResetTokenMinutes { get; init; } = 30;
    public bool PasswordResetEnabled { get; init; } = true;
}
