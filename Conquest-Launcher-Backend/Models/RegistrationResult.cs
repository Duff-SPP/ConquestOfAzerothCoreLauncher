// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
namespace Conquest.Launcher.Backend.Models;

public enum RegistrationStatus
{
    Success,
    InvalidRequest,
    DuplicateUsername,
    DuplicateEmail,
    DatabaseUnavailable
}

public sealed record RegistrationResult(RegistrationStatus Status, string Message)
{
    public static RegistrationResult Success() => new(RegistrationStatus.Success, "Your test account has been created.");
    public static RegistrationResult Invalid(string message) => new(RegistrationStatus.InvalidRequest, message);
    public static RegistrationResult Duplicate() => new(RegistrationStatus.DuplicateUsername, "That account name is already in use.");
    public static RegistrationResult DuplicateEmail() => new(RegistrationStatus.DuplicateEmail, "That email address is already attached to an account.");
    public static RegistrationResult DatabaseUnavailable() => new(RegistrationStatus.DatabaseUnavailable, "Registration is temporarily unavailable.");
}
