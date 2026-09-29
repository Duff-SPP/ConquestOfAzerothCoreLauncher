using Conquest.Launcher.Backend.Models;
using MySqlConnector;

namespace Conquest.Launcher.Backend.Services;

public sealed class CharacterPortalService(IConfiguration configuration)
{
    private readonly string _connectionString = configuration.GetConnectionString("CharactersDatabase")
        ?? throw new InvalidOperationException("ConnectionStrings:CharactersDatabase is required.");


    public async Task<int> GetOnlineCountAsync(CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM `characters` WHERE `online` = 1 AND `deleteDate` IS NULL;";
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(value ?? 0);
    }

    public async Task<List<CharacterSummary>> GetCharactersAsync(uint accountId, CancellationToken cancellationToken)
    {
        var result = new List<CharacterSummary>();
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT `guid`, `name`, `race`, `class`, `gender`, `level`, `money`, `totaltime`, `online`, `logout_time`
            FROM `characters`
            WHERE `account` = @accountId AND `deleteDate` IS NULL
            ORDER BY `level` DESC, `name` ASC;
            """;
        command.Parameters.AddWithValue("@accountId", accountId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new CharacterSummary(
                reader.GetFieldValue<uint>(0), reader.GetString(1), reader.GetFieldValue<byte>(2), reader.GetFieldValue<byte>(3),
                reader.GetFieldValue<byte>(4), reader.GetFieldValue<byte>(5), reader.GetFieldValue<uint>(6), reader.GetFieldValue<uint>(7),
                reader.GetFieldValue<byte>(8) != 0, reader.GetFieldValue<uint>(9)));
        }

        return result;
    }

    public async Task<List<CharacterMail>?> GetMailAsync(uint accountId, uint characterGuid, CancellationToken cancellationToken)
    {
        var result = new List<CharacterMail>();
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT m.`id`, m.`sender`, COALESCE(m.`subject`, ''), COALESCE(m.`body`, ''), m.`has_items`, m.`money`, m.`deliver_time`, m.`expire_time`, m.`checked`
            FROM `mail` m
            INNER JOIN `characters` c ON c.`guid` = m.`receiver`
            WHERE c.`account` = @accountId AND c.`guid` = @guid AND c.`deleteDate` IS NULL
            ORDER BY m.`id` DESC
            LIMIT 50;
            """;
        command.Parameters.AddWithValue("@accountId", accountId);
        command.Parameters.AddWithValue("@guid", characterGuid);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new CharacterMail(
                reader.GetFieldValue<uint>(0), reader.GetFieldValue<uint>(1), reader.GetString(2), reader.GetString(3),
                reader.GetFieldValue<byte>(4) != 0, reader.GetFieldValue<uint>(5), reader.GetFieldValue<uint>(6),
                reader.GetFieldValue<uint>(7), reader.GetFieldValue<byte>(8)));
        }

        if (result.Count != 0)
            return result;

        await using var ownership = connection.CreateCommand();
        ownership.CommandText = "SELECT 1 FROM `characters` WHERE `guid` = @guid AND `account` = @accountId AND `deleteDate` IS NULL LIMIT 1;";
        ownership.Parameters.AddWithValue("@guid", characterGuid);
        ownership.Parameters.AddWithValue("@accountId", accountId);
        return await ownership.ExecuteScalarAsync(cancellationToken) is null ? null : result;
    }
}
