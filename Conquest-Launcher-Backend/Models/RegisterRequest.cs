namespace Conquest.Launcher.Backend.Models;

public sealed record RegisterRequest(
    string? Username,
    string? Email,
    string? Password,
    string? ConfirmPassword,
    bool AcceptTestWarning,
    string? TurnstileToken,
    string? Website);
