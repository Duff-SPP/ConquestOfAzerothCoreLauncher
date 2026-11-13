// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
namespace Conquest.Launcher.Backend.Models;

public sealed record LoginRequest(string? Login, string? Password);
public sealed record ForgotPasswordRequest(string? Email);
public sealed record ResetPasswordRequest(string? Token, string? Password, string? ConfirmPassword);
public sealed record StoreCheckoutRequest(string? ProductKey, uint CharacterGuid);
