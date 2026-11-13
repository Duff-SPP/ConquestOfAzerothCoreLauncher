// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
namespace Conquest.Launcher.Backend.Models;

public sealed record RegisterRequest(
    string? Username,
    string? Email,
    string? Password,
    string? ConfirmPassword,
    // Legacy JSON field retained for launcher compatibility; acknowledges live and PTR access.
    bool AcceptTestWarning,
    string? TurnstileToken,
    string? Website);
