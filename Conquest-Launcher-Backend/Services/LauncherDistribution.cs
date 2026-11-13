// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Text.RegularExpressions;
using Microsoft.Net.Http.Headers;

namespace Conquest.Launcher.Backend.Services;

public static partial class LauncherDistribution
{
    public static void MapLauncherDistribution(this WebApplication app)
    {
        // Publishing runs as the server owner. The web process only needs read access.
        var root = app.Configuration["Launcher:PublishedRoot"];

        IResult Serve(HttpContext context, string relative, string contentType, string? hash = null)
        {
            if (relative.StartsWith("client/", StringComparison.Ordinal))
            {
                var required = app.Configuration["Launcher:RequiredClientVersion"] ?? "0.8.1";
                var supplied = context.Request.Headers["X-CoA-Launcher-Version"].ToString();
                if (!Regex.IsMatch(required, @"^\d+\.\d+\.\d+$", RegexOptions.CultureInvariant))
                    return Results.Json(new { message = "Client download policy is not configured correctly." }, statusCode: 503);
                if (!string.Equals(supplied, required, StringComparison.Ordinal))
                    return Results.Json(new { requiredLauncherVersion = required, message = $"Update your launcher to version {required} to download, install or repair the client." }, statusCode: 426);
            }
            if (string.IsNullOrWhiteSpace(root) || !Path.IsPathFullyQualified(root))
                return Results.Json(new { message = "Launcher downloads have not been configured." }, statusCode: 503);
            var fullPath = Path.GetFullPath(Path.Combine(root, relative));
            if (!fullPath.StartsWith(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                return Results.BadRequest();
            // Never serve links into private application/configuration folders.
            for (var item = new FileInfo(fullPath) as FileSystemInfo; item is not null; item = item is FileInfo file ? file.Directory : (item as DirectoryInfo)?.Parent)
                if (item.Exists && (item.Attributes & FileAttributes.ReparsePoint) != 0)
                    return Results.NotFound();
            if (!File.Exists(fullPath)) return Results.NotFound(new { message = "No release has been published yet." });
            context.Response.Headers.CacheControl = relative.StartsWith("client/", StringComparison.Ordinal) || hash is null ? "no-store" : "public,max-age=31536000,immutable";
            return Results.File(fullPath, contentType, enableRangeProcessing: true,
                entityTag: hash is null ? null : new EntityTagHeaderValue('"' + hash + '"'));
        }

        app.MapGet("/downloads/client/latest.json", (HttpContext context) => Serve(context, "client/latest.json", "application/json"));
        app.MapGet("/downloads/client/objects/{hash}", (HttpContext context, string hash) =>
            HashPattern().IsMatch(hash) ? Serve(context, "client/objects/" + hash, "application/octet-stream", hash) : Results.NotFound());
        app.MapGet("/downloads/launcher/{name}", (HttpContext context, string name) =>
            name == "latest.yml" ? Serve(context, "launcher/latest.yml", "text/yaml") :
            name == "ConquestOfAzerothSetup.exe" || InstallerPattern().IsMatch(name) ? Serve(context, "launcher/" + name, "application/octet-stream") : Results.NotFound());
        app.MapGet("/api/launcher/config", () => Results.Ok(new
        {
            schema = 1,
            realmlist = "logon.coa-development.org",
            clientManifest = "/downloads/client/latest.json",
            launcherUpdates = "/downloads/launcher/",
            downloadsConfigured = !string.IsNullOrWhiteSpace(root)
        }));
    }

    [GeneratedRegex("^[a-f0-9]{64}$", RegexOptions.CultureInvariant)]
    private static partial Regex HashPattern();
    [GeneratedRegex(@"^ConquestOfAzerothSetup-\d+\.\d+\.\d+\.exe(?:\.blockmap)?$", RegexOptions.CultureInvariant)]
    private static partial Regex InstallerPattern();
}
