// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Conquest.Launcher.Backend.Configuration;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using MySqlConnector;

namespace Conquest.Launcher.Backend.Services;

public sealed class PasswordResetService(
    IConfiguration configuration,
    IOptions<PortalOptions> portalOptions,
    SmtpEmailService email,
    ILogger<PasswordResetService> logger)
{
    private readonly string _connectionString = configuration.GetConnectionString("AuthDatabase")
        ?? throw new InvalidOperationException("ConnectionStrings:AuthDatabase is required.");
    private readonly PortalOptions _portal = portalOptions.Value;
    private readonly SmtpEmailService _email = email;
    private readonly ILogger<PasswordResetService> _logger = logger;

    public async Task<string?> RequestAsync(string emailAddress, string? remoteIp, bool previewMode, CancellationToken cancellationToken)
    {
        if (!_portal.PasswordResetEnabled || string.IsNullOrWhiteSpace(emailAddress))
            return null;

        var normalizedEmail = AzerothCoreSrp6.UppercaseLatinAscii(emailAddress.Trim());
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        uint accountId;
        string username;
        string destination;
        await using (var lookup = connection.CreateCommand())
        {
            lookup.CommandText = "SELECT `id`, `username`, `email` FROM `account` WHERE UPPER(`email`) = @email LIMIT 1;";
            lookup.Parameters.AddWithValue("@email", normalizedEmail);
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            accountId = reader.GetFieldValue<uint>(0);
            username = reader.GetString(1);
            destination = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
        }

        if (string.IsNullOrWhiteSpace(destination))
            return null;

        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var tokenHash = SHA256.HashData(Encoding.UTF8.GetBytes(token));

        await using (var insert = connection.CreateCommand())
        {
            var expiresAt = DateTime.UtcNow.AddMinutes(Math.Clamp(_portal.PasswordResetTokenMinutes, 5, 120));
            insert.CommandText = """
                INSERT INTO `coa_password_reset`
                    (`account_id`, `token_hash`, `created_at`, `expires_at`, `request_ip`)
                VALUES
                    (@accountId, @tokenHash, UTC_TIMESTAMP(), @expiresAt, @requestIp);
                """;
            insert.Parameters.AddWithValue("@accountId", accountId);
            insert.Parameters.Add("@tokenHash", MySqlDbType.Binary, 32).Value = tokenHash;
            insert.Parameters.AddWithValue("@expiresAt", expiresAt);
            insert.Parameters.AddWithValue("@requestIp", (object?)remoteIp ?? DBNull.Value);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        var resetUrl = $"{_portal.PublicBaseUrl.TrimEnd('/')}/#reset?token={Uri.EscapeDataString(token)}";
        if (previewMode)
        {
            _logger.LogInformation("Preview password reset for {AccountId}: {ResetUrl}", accountId, resetUrl);
            return resetUrl;
        }

        try
        {
            await _email.SendPasswordResetAsync(destination, username, resetUrl, cancellationToken);
        }
        catch (Exception exception) when (exception is SmtpException or InvalidOperationException)
        {
            _logger.LogError(exception, "Password reset email could not be sent for account {AccountId}.", accountId);
        }

        return null;
    }

    public async Task<bool> ResetAsync(string token, string newPassword, CancellationToken cancellationToken)
    {
        if (!_portal.PasswordResetEnabled || string.IsNullOrWhiteSpace(token))
            return false;

        var tokenHash = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        uint accountId;
        string username;
        await using (var lookup = connection.CreateCommand())
        {
            lookup.Transaction = transaction;
            lookup.CommandText = """
                SELECT r.`account_id`, a.`username`
                FROM `coa_password_reset` r
                INNER JOIN `account` a ON a.`id` = r.`account_id`
                WHERE r.`token_hash` = @tokenHash
                  AND r.`used_at` IS NULL
                  AND r.`expires_at` > UTC_TIMESTAMP()
                ORDER BY r.`id` DESC
                LIMIT 1
                FOR UPDATE;
                """;
            lookup.Parameters.Add("@tokenHash", MySqlDbType.Binary, 32).Value = tokenHash;
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                await transaction.RollbackAsync(cancellationToken);
                return false;
            }

            accountId = reader.GetFieldValue<uint>(0);
            username = reader.GetString(1);
        }

        var (salt, verifier) = AzerothCoreSrp6.CreateRegistrationData(username, newPassword);
        await using (var updateAccount = connection.CreateCommand())
        {
            updateAccount.Transaction = transaction;
            updateAccount.CommandText = "UPDATE `account` SET `salt` = @salt, `verifier` = @verifier, `session_key` = NULL WHERE `id` = @accountId;";
            updateAccount.Parameters.Add("@salt", MySqlDbType.Binary, 32).Value = salt;
            updateAccount.Parameters.Add("@verifier", MySqlDbType.Binary, 32).Value = verifier;
            updateAccount.Parameters.AddWithValue("@accountId", accountId);
            await updateAccount.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var consume = connection.CreateCommand())
        {
            consume.Transaction = transaction;
            consume.CommandText = "UPDATE `coa_password_reset` SET `used_at` = UTC_TIMESTAMP() WHERE `account_id` = @accountId AND `used_at` IS NULL;";
            consume.Parameters.AddWithValue("@accountId", accountId);
            await consume.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return true;
    }
}
