// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Text.Json;

namespace Conquest.Launcher.Backend.Services;

public sealed class DiscordCommunity(IHttpClientFactory clients)
{
    public const string GuildId = "1546991088751874168";
    public const string Invite = "https://discord.gg/UV4engmU96";
    private readonly SemaphoreSlim _gate = new(1, 1);
    private DateTimeOffset _nextCheck;
    private CommunityStatus _cached = new(GuildId, Invite, false, null, null, null);

    public async Task<CommunityStatus> GetAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (DateTimeOffset.UtcNow < _nextCheck) return _cached;
            _nextCheck = DateTimeOffset.UtcNow.AddMinutes(3);
            try
            {
                using var response = await clients.CreateClient("discord").GetAsync("https://discord.com/api/v10/invites/UV4engmU96?with_counts=true");
                response.EnsureSuccessStatusCode();
                using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
                var data = document.RootElement;
                if (!data.TryGetProperty("guild", out var guild) || !guild.TryGetProperty("id", out var id) || id.GetString() != GuildId)
                    return _cached = new(GuildId, Invite, false, null, null, null);
                int? Count(string name) => data.TryGetProperty(name, out var number) && number.TryGetInt32(out var count) && count >= 0 ? count : null;
                return _cached = new(GuildId, Invite, true, guild.TryGetProperty("name", out var name) ? name.GetString() : null, Count("approximate_presence_count"), Count("approximate_member_count"));
            }
            catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
            { return _cached = new(GuildId, Invite, false, null, null, null); }
        }
        finally { _gate.Release(); }
    }
}
public sealed record CommunityStatus(string GuildId, string InviteUrl, bool Available, string? Name, int? Online, int? Members);
