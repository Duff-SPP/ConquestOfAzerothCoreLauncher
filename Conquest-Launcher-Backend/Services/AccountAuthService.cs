using Conquest.Launcher.Backend.Models;
using MySqlConnector;
using System.Security.Cryptography;

namespace Conquest.Launcher.Backend.Services;

public sealed class AccountAuthService(IConfiguration configuration, ILogger<AccountAuthService> logger)
{
    private readonly string _connectionString = configuration.GetConnectionString("AuthDatabase")
        ?? throw new InvalidOperationException("ConnectionStrings:AuthDatabase is required.");
    private readonly ILogger<AccountAuthService> _logger = logger;

    public async Task<AuthenticatedAccount?> AuthenticateAsync(string login, string password, CancellationToken cancellationToken)
    {
        var normalizedLogin = AzerothCoreSrp6.UppercaseLatinAscii(login.Trim());

        try
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT `id`, `username`, `salt`, `verifier`, `email`
                FROM `account`
                WHERE `username` = @login OR UPPER(`email`) = @login
                LIMIT 1;
                """;
            command.Parameters.AddWithValue("@login", normalizedLogin);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            var id = reader.GetFieldValue<uint>(0);
            var username = reader.GetString(1);
            var salt = reader.GetFieldValue<byte[]>(2);
            var verifier = reader.GetFieldValue<byte[]>(3);
            var email = reader.IsDBNull(4) ? string.Empty : reader.GetString(4);

            if (!AzerothCoreSrp6.VerifyPassword(username, password, salt, verifier))
                return null;

            return new AuthenticatedAccount(id, username, email, CredentialStamp(salt, verifier));
        }
        catch (MySqlException exception)
        {
            _logger.LogError(exception, "Unable to authenticate account.");
            throw;
        }
    }

    private static string CredentialStamp(byte[] salt, byte[] verifier)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        hash.AppendData(salt);
        hash.AppendData(verifier);
        return Convert.ToHexString(hash.GetHashAndReset());
    }

    public async Task<bool> ValidateSessionAsync(uint accountId, string? stamp, CancellationToken cancellationToken)
    {
        // Legacy cookies have no stamp and must sign in again.
        if (string.IsNullOrEmpty(stamp)) return false;
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand("SELECT salt,verifier FROM account WHERE id=@id LIMIT 1", connection);
        command.Parameters.AddWithValue("@id", accountId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return false;
        return string.Equals(stamp, CredentialStamp(reader.GetFieldValue<byte[]>(0), reader.GetFieldValue<byte[]>(1)), StringComparison.Ordinal);
    }

    public async Task<AccountOverview?> GetOverviewAsync(uint accountId, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT `id`, `username`, `email`, `joindate`, `last_login`, `expansion`
            FROM `account`
            WHERE `id` = @id
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("@id", accountId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            return null;

        return new AccountOverview(
            reader.GetFieldValue<uint>(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
            reader.GetDateTime(3),
            reader.IsDBNull(4) ? null : reader.GetDateTime(4),
            reader.GetFieldValue<byte>(5));
    }
}
