// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Net.Mail;
using Conquest.Launcher.Backend.Configuration;
using Conquest.Launcher.Backend.Models;
using Microsoft.Extensions.Options;

namespace Conquest.Launcher.Backend.Services;

public sealed class RegistrationValidator(IOptions<RegistrationOptions> options)
{
    private readonly RegistrationOptions _options = options.Value;

    public RegistrationResult? Validate(RegisterRequest request)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        var email = request.Email?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;
        var confirmPassword = request.ConfirmPassword ?? string.Empty;

        // Honeypot. Normal browsers never fill this hidden field.
        if (!string.IsNullOrWhiteSpace(request.Website))
            return RegistrationResult.Invalid("Account creation failed.");

        if (!request.AcceptTestWarning)
            return RegistrationResult.Invalid("You must confirm that you understand this account is for the live and PTR realms.");

        if (username.Length < _options.UsernameMinLength || username.Length > _options.UsernameMaxLength)
            return RegistrationResult.Invalid($"Account name must be {_options.UsernameMinLength}-{_options.UsernameMaxLength} characters.");

        var passwordValidation = ValidatePassword(password, confirmPassword);
        if (passwordValidation is not null)
            return passwordValidation;

        if (_options.RequireAsciiCredentials && !IsSafeAsciiUsername(username))
            return RegistrationResult.Invalid("Use standard English letters/numbers for the account name and printable ASCII characters for the password.");

        if (_options.RequireEmail && string.IsNullOrWhiteSpace(email))
            return RegistrationResult.Invalid("Email is required.");

        if (email.Length > _options.EmailMaxLength || (!string.IsNullOrWhiteSpace(email) && !IsValidEmail(email)))
            return RegistrationResult.Invalid("Enter a valid email address.");

        return null;
    }

    public RegistrationResult? ValidatePassword(string password, string confirmPassword)
    {
        if (password.Length < _options.PasswordMinLength || password.Length > _options.PasswordMaxLength)
            return RegistrationResult.Invalid($"Password must be {_options.PasswordMinLength}-{_options.PasswordMaxLength} characters.");

        if (!string.Equals(password, confirmPassword, StringComparison.Ordinal))
            return RegistrationResult.Invalid("The passwords do not match.");

        if (_options.RequireAsciiCredentials && !IsSafeAsciiPassword(password))
            return RegistrationResult.Invalid("Use printable ASCII characters for the password.");

        return null;
    }

    private static bool IsSafeAsciiUsername(string value)
    {
        foreach (var c in value)
        {
            if (!(c is >= 'A' and <= 'Z') && !(c is >= 'a' and <= 'z') && !(c is >= '0' and <= '9') && c is not '_' and not '-' and not '.')
                return false;
        }

        return true;
    }

    private static bool IsSafeAsciiPassword(string value)
    {
        foreach (var c in value)
        {
            if (c < 0x21 || c > 0x7E)
                return false;
        }

        return true;
    }

    private static bool IsValidEmail(string value)
    {
        try
        {
            var parsed = new MailAddress(value);
            return string.Equals(parsed.Address, value, StringComparison.OrdinalIgnoreCase);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
