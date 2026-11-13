// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Conquest.Launcher.Backend.Configuration;
using Conquest.Launcher.Backend.Models;
using Microsoft.Extensions.Options;
using MySqlConnector;

namespace Conquest.Launcher.Backend.Services;

public sealed class DiscordAccountLinkService
{
    private const string AuthorizeEndpoint = "https://discord.com/oauth2/authorize";
    private const string TokenEndpoint = "https://discord.com/api/v10/oauth2/token";
    private const string RevokeEndpoint = "https://discord.com/api/v10/oauth2/token/revoke";
    private const string CurrentUserEndpoint = "https://discord.com/api/v10/users/@me";

    private readonly DiscordOAuthOptions _options;
    private readonly IHttpClientFactory _httpClients;
    private readonly ILogger<DiscordAccountLinkService> _logger;
    private readonly string _connectionString;

    public DiscordAccountLinkService(
        IOptions<DiscordOAuthOptions> options,
        IHttpClientFactory httpClients,
        IConfiguration configuration,
        ILogger<DiscordAccountLinkService> logger)
    {
        _options = options.Value;
        _httpClients = httpClients;
        _logger = logger;
        _connectionString = configuration.GetConnectionString("AuthDatabase") ?? "";
    }

    public bool Enabled =>
        _options.Enabled &&
        !string.IsNullOrWhiteSpace(_connectionString) &&
        !string.IsNullOrWhiteSpace(_options.ClientId) &&
        !string.IsNullOrWhiteSpace(_options.ClientSecret) &&
        ValidRedirectUri(_options.RedirectUri);

    public async Task<DiscordLinkStatus> GetStatusAsync(uint accountId, CancellationToken cancellationToken)
    {
        if (!Enabled)
            return new DiscordLinkStatus(false, false, null, null, null, null, "Discord account linking is not configured on this backend.");

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand("SELECT discord_user_id,discord_username,discord_global_name,linked_at FROM coa_discord_link WHERE account_id=@accountId LIMIT 1", connection);
        command.Parameters.AddWithValue("@accountId", accountId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            return new DiscordLinkStatus(true, false, null, null, null, null);

        return new DiscordLinkStatus(
            true,
            true,
            reader.GetString(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.GetDateTime(3));
    }

    public async Task<DiscordLinkStart> BeginAsync(uint accountId, CancellationToken cancellationToken)
    {
        if (!Enabled) throw new InvalidOperationException("Discord account linking is not configured.");

        var minutes = Math.Clamp(_options.StateMinutes, 1, 15);
        var state = Base64Url(RandomNumberGenerator.GetBytes(32));
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using (var cleanup = new MySqlCommand("DELETE FROM coa_discord_pending WHERE expires_at <= UTC_TIMESTAMP(6)", connection))
            await cleanup.ExecuteNonQueryAsync(cancellationToken);
        await using (var save = new MySqlCommand("""
            INSERT INTO coa_discord_pending (account_id,state_hash,expires_at)
            VALUES (@id,@hash,TIMESTAMPADD(MINUTE,@minutes,UTC_TIMESTAMP(6)))
            ON DUPLICATE KEY UPDATE state_hash=@hash,expires_at=TIMESTAMPADD(MINUTE,@minutes,UTC_TIMESTAMP(6))
            """, connection))
        {
            save.Parameters.AddWithValue("@id", accountId);
            save.Parameters.AddWithValue("@hash", StateHash(state));
            save.Parameters.AddWithValue("@minutes", minutes);
            await save.ExecuteNonQueryAsync(cancellationToken);
        }

        var authorizeUrl = string.Concat(
            AuthorizeEndpoint,
            "?response_type=code",
            "&client_id=", Uri.EscapeDataString(_options.ClientId.Trim()),
            "&scope=identify",
            "&state=", Uri.EscapeDataString(state),
            "&redirect_uri=", Uri.EscapeDataString(_options.RedirectUri.Trim()),
            "&prompt=consent");

        return new DiscordLinkStart(authorizeUrl, minutes * 60);
    }

    public async Task<DiscordLinkCallbackResult> CompleteAsync(string? code, string? state, string? error, CancellationToken cancellationToken)
    {
        if (!Enabled) return new DiscordLinkCallbackResult(false, "Discord account linking is not configured.");
        if (string.IsNullOrWhiteSpace(state)) return new DiscordLinkCallbackResult(false, "The Discord link request is missing or expired.");

        var pending = state.Length == 43 ? await ConsumePendingAsync(state, cancellationToken) : null;
        if (pending is null)
            return new DiscordLinkCallbackResult(false, "The Discord link request is missing or expired. Start the connection again from the launcher.");

        if (!string.IsNullOrWhiteSpace(error))
            return new DiscordLinkCallbackResult(false, "Discord authorization was cancelled or denied.");
        if (string.IsNullOrWhiteSpace(code))
            return new DiscordLinkCallbackResult(false, "Discord did not return an authorization code.");

        string? accessToken = null;
        try
        {
            var client = _httpClients.CreateClient("discord-oauth");
            using var tokenBody = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = _options.RedirectUri.Trim()
            });
            using var tokenRequest = new HttpRequestMessage(HttpMethod.Post, TokenEndpoint) { Content = tokenBody };
            tokenRequest.Headers.Authorization = ClientAuthorization();
            using var tokenResponse = await client.SendAsync(tokenRequest, cancellationToken);
            if (!tokenResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("Discord OAuth token exchange failed with HTTP {StatusCode}.", (int)tokenResponse.StatusCode);
                return new DiscordLinkCallbackResult(false, "Discord authorization could not be completed. Start the connection again from the launcher.");
            }

            await using (var stream = await tokenResponse.Content.ReadAsStreamAsync(cancellationToken))
            using (var tokenJson = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken))
            {
                if (!tokenJson.RootElement.TryGetProperty("access_token", out var tokenElement))
                    return new DiscordLinkCallbackResult(false, "Discord did not return an access token.");
                accessToken = tokenElement.GetString();
            }

            if (string.IsNullOrWhiteSpace(accessToken))
                return new DiscordLinkCallbackResult(false, "Discord did not return an access token.");

            using var userRequest = new HttpRequestMessage(HttpMethod.Get, CurrentUserEndpoint);
            userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            using var userResponse = await client.SendAsync(userRequest, cancellationToken);
            if (!userResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("Discord current-user request failed with HTTP {StatusCode}.", (int)userResponse.StatusCode);
                return new DiscordLinkCallbackResult(false, "Discord account details could not be read.");
            }

            string? discordId;
            string? username;
            string? globalName = null;
            await using (var stream = await userResponse.Content.ReadAsStreamAsync(cancellationToken))
            using (var userJson = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken))
            {
                var root = userJson.RootElement;
                discordId = root.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
                username = root.TryGetProperty("username", out var usernameElement) ? usernameElement.GetString() : null;
                if (root.TryGetProperty("global_name", out var globalElement) && globalElement.ValueKind == JsonValueKind.String)
                    globalName = globalElement.GetString();
            }

            if (!ValidDiscordId(discordId) || string.IsNullOrWhiteSpace(username) || username.Length > 128 || globalName?.Length > 128)
                return new DiscordLinkCallbackResult(false, "Discord returned an invalid account identity.");

            return await SaveLinkAsync(pending.AccountId, discordId!, username, globalName, cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Discord OAuth request timed out.");
            return new DiscordLinkCallbackResult(false, "Discord did not respond in time. Start the connection again from the launcher.");
        }
        catch (MySqlException exception) when (exception.Number == 1062)
        {
            return new DiscordLinkCallbackResult(false, "This Discord or Conquest account was linked by another request. Refresh your account page.");
        }
        catch (HttpRequestException exception)
        {
            _logger.LogWarning(exception, "Discord OAuth HTTP request failed.");
            return new DiscordLinkCallbackResult(false, "Discord could not be reached. Start the connection again from the launcher.");
        }
        catch (JsonException exception)
        {
            _logger.LogWarning(exception, "Discord OAuth returned malformed JSON.");
            return new DiscordLinkCallbackResult(false, "Discord returned an invalid response.");
        }
        finally
        {
            if (!string.IsNullOrWhiteSpace(accessToken))
                await TryRevokeAsync(accessToken);
        }
    }

    public async Task<bool> UnlinkAsync(uint accountId, CancellationToken cancellationToken)
    {
        if (!Enabled) return false;
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await using (var cancelPending = new MySqlCommand("DELETE FROM coa_discord_pending WHERE account_id=@accountId", connection, transaction))
        {
            cancelPending.Parameters.AddWithValue("@accountId", accountId);
            await cancelPending.ExecuteNonQueryAsync(cancellationToken);
        }

        StoredLink? link = null;
        await using (var select = new MySqlCommand("SELECT discord_user_id,discord_username,discord_global_name FROM coa_discord_link WHERE account_id=@accountId FOR UPDATE", connection, transaction))
        {
            select.Parameters.AddWithValue("@accountId", accountId);
            await using var reader = await select.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
                link = new StoredLink(reader.GetString(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2));
        }

        if (link is null)
        {
            await transaction.CommitAsync(cancellationToken);
            return false;
        }

        await InsertLogAsync(connection, transaction, accountId, link.DiscordUserId, link.Username, link.GlobalName, "unlinked", cancellationToken);
        await using (var delete = new MySqlCommand("DELETE FROM coa_discord_link WHERE account_id=@accountId", connection, transaction))
        {
            delete.Parameters.AddWithValue("@accountId", accountId);
            await delete.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    private async Task<DiscordLinkCallbackResult> SaveLinkAsync(uint accountId, string discordUserId, string username, string? globalName, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        var sameLink = false;
        var conflict = false;
        await using (var select = new MySqlCommand("SELECT account_id,discord_user_id FROM coa_discord_link WHERE account_id=@accountId OR discord_user_id=@discordUserId FOR UPDATE", connection, transaction))
        {
            select.Parameters.AddWithValue("@accountId", accountId);
            select.Parameters.AddWithValue("@discordUserId", discordUserId);
            await using var reader = await select.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var existingAccount = reader.GetUInt32(0);
                var existingDiscord = reader.GetString(1);
                if (existingAccount == accountId && string.Equals(existingDiscord, discordUserId, StringComparison.Ordinal)) sameLink = true;
                else conflict = true;
            }
        }

        if (conflict)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new DiscordLinkCallbackResult(false, "That Discord account is already linked to another Conquest account, or this Conquest account is already linked to another Discord account.");
        }

        if (sameLink)
        {
            await using var update = new MySqlCommand("UPDATE coa_discord_link SET discord_username=@username,discord_global_name=@globalName WHERE account_id=@accountId", connection, transaction);
            update.Parameters.AddWithValue("@username", username);
            update.Parameters.AddWithValue("@globalName", (object?)globalName ?? DBNull.Value);
            update.Parameters.AddWithValue("@accountId", accountId);
            await update.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new DiscordLinkCallbackResult(true, "This Discord account is already connected. You can return to the launcher.");
        }

        await using (var insert = new MySqlCommand("INSERT INTO coa_discord_link (account_id,discord_user_id,discord_username,discord_global_name,linked_at) VALUES (@accountId,@discordUserId,@username,@globalName,UTC_TIMESTAMP(6))", connection, transaction))
        {
            insert.Parameters.AddWithValue("@accountId", accountId);
            insert.Parameters.AddWithValue("@discordUserId", discordUserId);
            insert.Parameters.AddWithValue("@username", username);
            insert.Parameters.AddWithValue("@globalName", (object?)globalName ?? DBNull.Value);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
        await InsertLogAsync(connection, transaction, accountId, discordUserId, username, globalName, "linked", cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new DiscordLinkCallbackResult(true, "Discord account connected successfully. You can close this tab and return to the launcher.");
    }

    private static async Task InsertLogAsync(MySqlConnection connection, MySqlTransaction transaction, uint accountId, string discordUserId, string username, string? globalName, string eventType, CancellationToken cancellationToken)
    {
        await using var command = new MySqlCommand("INSERT INTO coa_discord_link_log (account_id,discord_user_id,discord_username,discord_global_name,event_type,event_at) VALUES (@accountId,@discordUserId,@username,@globalName,@eventType,UTC_TIMESTAMP(6))", connection, transaction);
        command.Parameters.AddWithValue("@accountId", accountId);
        command.Parameters.AddWithValue("@discordUserId", discordUserId);
        command.Parameters.AddWithValue("@username", username);
        command.Parameters.AddWithValue("@globalName", (object?)globalName ?? DBNull.Value);
        command.Parameters.AddWithValue("@eventType", eventType);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task TryRevokeAsync(string accessToken)
    {
        try
        {
            var client = _httpClients.CreateClient("discord-oauth");
            using var body = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["token"] = accessToken,
                ["token_type_hint"] = "access_token"
            });
            using var request = new HttpRequestMessage(HttpMethod.Post, RevokeEndpoint) { Content = body };
            request.Headers.Authorization = ClientAuthorization();
            using var response = await client.SendAsync(request, CancellationToken.None);
            if (!response.IsSuccessStatusCode)
                _logger.LogDebug("Discord OAuth token revocation returned HTTP {StatusCode}.", (int)response.StatusCode);
        }
        catch (Exception exception)
        {
            _logger.LogDebug(exception, "Discord OAuth token revocation failed.");
        }
    }

    private AuthenticationHeaderValue ClientAuthorization()
    {
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_options.ClientId.Trim()}:{_options.ClientSecret}"));
        return new AuthenticationHeaderValue("Basic", credentials);
    }

    private static bool ValidRedirectUri(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || !string.IsNullOrEmpty(uri.UserInfo)) return false;
        if (uri.Scheme == Uri.UriSchemeHttps) return true;
        return uri.Scheme == Uri.UriSchemeHttp && IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address);
    }

    private static bool ValidDiscordId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length is < 16 or > 20) return false;
        foreach (var character in value)
            if (character is < '0' or > '9') return false;
        return true;
    }

    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string StateHash(string state) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(state)));

    private async Task<PendingLink?> ConsumePendingAsync(string state, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var hash = StateHash(state);
        uint accountId;
        await using (var find = new MySqlCommand("SELECT account_id FROM coa_discord_pending WHERE state_hash=@hash AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE", connection, transaction))
        {
            find.Parameters.AddWithValue("@hash", hash);
            await using var reader = await find.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return null;
            accountId = reader.GetFieldValue<uint>(0);
        }
        await using (var consume = new MySqlCommand("DELETE FROM coa_discord_pending WHERE state_hash=@hash", connection, transaction))
        {
            consume.Parameters.AddWithValue("@hash", hash);
            await consume.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
        return new PendingLink(accountId);
    }

    private sealed record PendingLink(uint AccountId);
    private sealed record StoredLink(string DiscordUserId, string Username, string? GlobalName);
}
