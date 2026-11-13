// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Conquest.Launcher.Backend.Configuration;
using Microsoft.Extensions.Options;

namespace Conquest.Launcher.Backend.Services;

public sealed class TurnstileService(
    HttpClient httpClient,
    IOptions<TurnstileOptions> options,
    ILogger<TurnstileService> logger)
{
    private const int MaxTokenLength = 2048;
    private readonly HttpClient _httpClient = httpClient;
    private readonly TurnstileOptions _options = options.Value;
    private readonly ILogger<TurnstileService> _logger = logger;

    public bool Enabled => _options.Enabled;
    public string SiteKey => _options.Enabled ? _options.SiteKey : string.Empty;
    public string ExpectedAction => _options.ExpectedAction;

    public async Task<bool> ValidateAsync(string? token, string? remoteIp, CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
            return false;

        if (string.IsNullOrWhiteSpace(_options.SecretKey) || string.IsNullOrWhiteSpace(token) || token.Length > MaxTokenLength)
            return false;

        var fields = new Dictionary<string, string>
        {
            ["secret"] = _options.SecretKey,
            ["response"] = token
        };

        if (!string.IsNullOrWhiteSpace(remoteIp))
            fields["remoteip"] = remoteIp;

        try
        {
            using var content = new FormUrlEncodedContent(fields);
            using var response = await _httpClient.PostAsync(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                content,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Turnstile Siteverify returned HTTP {StatusCode}.", (int)response.StatusCode);
                return false;
            }

            var payload = await response.Content.ReadFromJsonAsync<TurnstileResponse>(cancellationToken: cancellationToken);
            if (payload is null || !payload.Success)
            {
                _logger.LogInformation("Turnstile rejected a registration challenge. Errors: {Errors}",
                    payload?.ErrorCodes is { Length: > 0 } errors ? string.Join(',', errors) : "none");
                return false;
            }

            if (!string.Equals(payload.Action, _options.ExpectedAction, StringComparison.Ordinal))
            {
                _logger.LogWarning("Turnstile action mismatch. Received {Action}.", payload.Action ?? "<null>");
                return false;
            }

            if (!IsAllowedHostname(payload.Hostname))
            {
                _logger.LogWarning("Turnstile hostname mismatch. Received {Hostname}.", payload.Hostname ?? "<null>");
                return false;
            }

            return true;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Turnstile validation timed out.");
            return false;
        }
        catch (HttpRequestException exception)
        {
            _logger.LogWarning(exception, "Turnstile validation request failed.");
            return false;
        }
    }

    private bool IsAllowedHostname(string? hostname)
    {
        if (string.IsNullOrWhiteSpace(hostname) || _options.AllowedHostnames.Length == 0)
            return false;

        foreach (var allowed in _options.AllowedHostnames)
        {
            if (string.Equals(hostname, allowed.Trim(), StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    private sealed record TurnstileResponse(
        [property: JsonPropertyName("success")] bool Success,
        [property: JsonPropertyName("hostname")] string? Hostname,
        [property: JsonPropertyName("action")] string? Action,
        [property: JsonPropertyName("error-codes")] string[]? ErrorCodes);
}
