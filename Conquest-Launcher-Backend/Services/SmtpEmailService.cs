// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Net;
using System.Net.Mail;
using Conquest.Launcher.Backend.Configuration;
using Microsoft.Extensions.Options;

namespace Conquest.Launcher.Backend.Services;

public sealed class SmtpEmailService(IOptions<SmtpOptions> options)
{
    private readonly SmtpOptions _options = options.Value;

    public async Task SendPasswordResetAsync(string recipient, string username, string resetUrl, CancellationToken cancellationToken)
    {
        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromAddress, _options.FromName),
            Subject = "Conquest of AzerothCore password reset",
            Body = $"Hello {username},\n\nA password reset was requested for your Conquest of AzerothCore test account.\n\nReset password:\n{resetUrl}\n\nThis link expires shortly and can only be used once. If you did not request this, you can ignore this email.\n",
            IsBodyHtml = false
        };
        message.To.Add(new MailAddress(recipient));

        using var client = new SmtpClient(_options.Host, _options.Port)
        {
            EnableSsl = _options.EnableSsl,
            DeliveryMethod = SmtpDeliveryMethod.Network,
            UseDefaultCredentials = false
        };

        if (!string.IsNullOrWhiteSpace(_options.Username))
            client.Credentials = new NetworkCredential(_options.Username, _options.Password);

        cancellationToken.ThrowIfCancellationRequested();
        await client.SendMailAsync(message);
        cancellationToken.ThrowIfCancellationRequested();
    }
}
