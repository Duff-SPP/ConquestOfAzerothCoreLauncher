// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
namespace Conquest.Launcher.Backend.Configuration;

public sealed class SmtpOptions
{
    public const string SectionName = "Smtp";

    public string Host { get; init; } = "SET_VIA_ENVIRONMENT_VARIABLE";
    public int Port { get; init; } = 587;
    public bool EnableSsl { get; init; } = true;
    public string Username { get; init; } = "SET_VIA_ENVIRONMENT_VARIABLE";
    public string Password { get; init; } = "SET_VIA_ENVIRONMENT_VARIABLE";
    public string FromAddress { get; init; } = "noreply@YOUR.PUBLIC.DOMAIN";
    public string FromName { get; init; } = "Conquest of AzerothCore";
}
