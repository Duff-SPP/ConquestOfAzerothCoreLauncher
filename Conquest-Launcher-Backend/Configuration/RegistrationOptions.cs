namespace Conquest.Launcher.Backend.Configuration;

public sealed class RegistrationOptions
{
    public const string SectionName = "Registration";

    public int Expansion { get; init; } = 2;
    public int UsernameMinLength { get; init; } = 3;
    public int UsernameMaxLength { get; init; } = 17;
    public int PasswordMinLength { get; init; } = 6;
    public int PasswordMaxLength { get; init; } = 16;
    public int EmailMaxLength { get; init; } = 255;
    public bool RequireEmail { get; init; } = true;
    public bool RequireAsciiCredentials { get; init; } = true;
    public bool PreviewMode { get; init; }
    public int RateLimitPermitLimit { get; init; } = 5;
    public int RateLimitWindowMinutes { get; init; } = 10;
    public string RealmName { get; init; } = "Conquest of AzerothCore - Public Bug Test";
    public string Realmlist { get; init; } = "set realmlist YOUR.REALMLIST.HERE";
}
