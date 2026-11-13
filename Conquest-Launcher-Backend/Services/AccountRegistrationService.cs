// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using Conquest.Launcher.Backend.Configuration;
using Conquest.Launcher.Backend.Models;
using Microsoft.Extensions.Options;
using MySqlConnector;

namespace Conquest.Launcher.Backend.Services;

public sealed class AccountRegistrationService(
    IConfiguration configuration,
    IOptions<RegistrationOptions> options,
    ILogger<AccountRegistrationService> logger)
{
    private readonly string _connectionString = configuration.GetConnectionString("AuthDatabase")
        ?? throw new InvalidOperationException("ConnectionStrings:AuthDatabase is required.");
    private readonly RegistrationOptions _options = options.Value;
    private readonly ILogger<AccountRegistrationService> _logger = logger;

    public async Task<RegistrationResult> CreateAsync(RegisterRequest request, CancellationToken cancellationToken)
    {
        var username = AzerothCoreSrp6.UppercaseLatinAscii(request.Username!.Trim());
        var password = AzerothCoreSrp6.UppercaseLatinAscii(request.Password!);
        var email = AzerothCoreSrp6.UppercaseLatinAscii(request.Email?.Trim() ?? string.Empty);
        var (salt, verifier) = AzerothCoreSrp6.CreateRegistrationData(username, password);

        try
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

            await using (var duplicateCommand = connection.CreateCommand())
            {
                duplicateCommand.Transaction = transaction;
                duplicateCommand.CommandText = "SELECT 1 FROM `account` WHERE `username` = @username LIMIT 1;";
                duplicateCommand.Parameters.AddWithValue("@username", username);
                var existing = await duplicateCommand.ExecuteScalarAsync(cancellationToken);
                if (existing is not null)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return RegistrationResult.Duplicate();
                }
            }

            if (!string.IsNullOrWhiteSpace(email))
            {
                await using var duplicateEmailCommand = connection.CreateCommand();
                duplicateEmailCommand.Transaction = transaction;
                duplicateEmailCommand.CommandText = "SELECT 1 FROM `account` WHERE UPPER(`email`) = @email LIMIT 1;";
                duplicateEmailCommand.Parameters.AddWithValue("@email", email);
                var existingEmail = await duplicateEmailCommand.ExecuteScalarAsync(cancellationToken);
                if (existingEmail is not null)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return RegistrationResult.DuplicateEmail();
                }
            }

            long accountId;
            await using (var accountCommand = connection.CreateCommand())
            {
                accountCommand.Transaction = transaction;
                accountCommand.CommandText = """
                    INSERT INTO `account`
                        (`username`, `salt`, `verifier`, `expansion`, `reg_mail`, `email`, `joindate`)
                    VALUES
                        (@username, @salt, @verifier, @expansion, @regMail, @email, NOW());
                    """;
                accountCommand.Parameters.AddWithValue("@username", username);
                accountCommand.Parameters.Add("@salt", MySqlDbType.Binary, 32).Value = salt;
                accountCommand.Parameters.Add("@verifier", MySqlDbType.Binary, 32).Value = verifier;
                accountCommand.Parameters.AddWithValue("@expansion", _options.Expansion);
                accountCommand.Parameters.AddWithValue("@regMail", email);
                accountCommand.Parameters.AddWithValue("@email", email);
                await accountCommand.ExecuteNonQueryAsync(cancellationToken);
                accountId = accountCommand.LastInsertedId;
            }

            await using (var realmCommand = connection.CreateCommand())
            {
                realmCommand.Transaction = transaction;
                realmCommand.CommandText = """
                    INSERT INTO `realmcharacters` (`realmid`, `acctid`, `numchars`)
                    SELECT `id`, @accountId, 0 FROM `realmlist`;
                    """;
                realmCommand.Parameters.AddWithValue("@accountId", accountId);
                await realmCommand.ExecuteNonQueryAsync(cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);
            _logger.LogInformation("Created test account {AccountId} ({Username}).", accountId, username);
            return RegistrationResult.Success();
        }
        catch (MySqlException exception) when (exception.Number == 1062)
        {
            return RegistrationResult.Duplicate();
        }
        catch (MySqlException exception)
        {
            _logger.LogError(exception, "Unable to create AzerothCore account for {Username}.", username);
            return RegistrationResult.DatabaseUnavailable();
        }
    }
}
