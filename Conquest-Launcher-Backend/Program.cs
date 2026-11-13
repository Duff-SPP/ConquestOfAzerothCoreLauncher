// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Net;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Conquest.Launcher.Backend.Configuration;
using Conquest.Launcher.Backend.Models;
using Conquest.Launcher.Backend.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using MySqlConnector;

var builder = WebApplication.CreateBuilder(args);
// Separate operator-owned policy survives application updates and can be changed without SQL.
builder.Configuration.AddJsonFile("/etc/coa-launcher-backend/download-policy.json", optional: true, reloadOnChange: true);
// Private local settings are never included in published output. Env/CLI take precedence.
if (builder.Environment.IsDevelopment())
    builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true).AddEnvironmentVariables().AddCommandLine(args);
var local = builder.Configuration.GetValue<bool>("LocalTesting");
if (local && !builder.Environment.IsDevelopment()) throw new InvalidOperationException("LocalTesting is only allowed in Development.");
if (builder.Configuration.GetValue<bool>("Registration:PreviewMode")) throw new InvalidOperationException("This backend has real accounts only. PreviewMode must be false.");
if (local)
{
    var urls = builder.Configuration["urls"] ?? "";
    foreach (var url in urls.Split(';', StringSplitOptions.RemoveEmptyEntries))
        if (!Uri.TryCreate(url, UriKind.Absolute, out var address) || !IPAddress.TryParse(address.Host, out var ip) || !IPAddress.IsLoopback(ip))
            throw new InvalidOperationException("LocalTesting must bind only to numeric loopback addresses.");
}
var portal = builder.Configuration.GetSection("Portal").Get<PortalOptions>() ?? new();
var registrations = builder.Configuration.GetValue<bool>("Accounts:RegistrationEnabled");
if (!local && (!Uri.TryCreate(portal.PublicBaseUrl, UriKind.Absolute, out var publicUrl) || publicUrl.Scheme != "https"))
    throw new InvalidOperationException("Portal:PublicBaseUrl must be your launcher's public HTTPS address.");
builder.Services.Configure<RegistrationOptions>(builder.Configuration.GetSection("Registration"));
builder.Services.Configure<PortalOptions>(builder.Configuration.GetSection("Portal"));
builder.Services.Configure<TurnstileOptions>(builder.Configuration.GetSection("Turnstile"));
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.Configure<DiscordOAuthOptions>(builder.Configuration.GetSection(DiscordOAuthOptions.SectionName));
builder.Services.AddSingleton<RegistrationValidator>();
builder.Services.AddScoped<AccountAuthService>();
builder.Services.AddScoped<AccountRegistrationService>();
builder.Services.AddScoped<CharacterPortalService>();
builder.Services.AddScoped<PasswordResetService>();
builder.Services.AddScoped<SmtpEmailService>();
builder.Services.AddHttpClient<TurnstileService>(client => client.Timeout = TimeSpan.FromSeconds(8));
builder.Services.AddHttpClient("discord", client => { client.Timeout = TimeSpan.FromSeconds(6); client.DefaultRequestHeaders.UserAgent.ParseAdd("ConquestLauncher/0.5.0"); });
builder.Services.AddHttpClient("discord-oauth", client => { client.Timeout = TimeSpan.FromSeconds(10); client.DefaultRequestHeaders.UserAgent.ParseAdd("ConquestLauncher/0.5.0"); });
builder.Services.AddSingleton<DiscordCommunity>();
builder.Services.AddSingleton<DiscordAccountLinkService>();
var protection = builder.Services.AddDataProtection().SetApplicationName("Conquest.Launcher.Backend");
var keyDirectory = builder.Configuration["DataProtection:KeysPath"];
if (!string.IsNullOrWhiteSpace(keyDirectory)) protection.PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 65536);
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "coa_launcher";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = local ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(Math.Clamp(portal.SessionHours, 1, 24));
    options.SlidingExpiration = true;
    options.Events.OnValidatePrincipal = async context =>
    {
        var principal = context.Principal;
        var auth = context.HttpContext.RequestServices.GetRequiredService<AccountAuthService>();
        if (!uint.TryParse(principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var accountId)
            || !await auth.ValidateSessionAsync(accountId, principal?.FindFirst("coa:credentials")?.Value, context.HttpContext.RequestAborted))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }
    };
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownProxies.Add(IPAddress.Loopback); options.KnownProxies.Add(IPAddress.IPv6Loopback);
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", context => Rate(context, 10, 10));
    options.AddPolicy("register", context => Rate(context, 5, 10));
    options.AddPolicy("reset", context => Rate(context, 5, 60));
    options.AddPolicy("discord-link", context => Rate(context, 10, 10));
});

if (args.Contains("--check-database"))
{
    try
    {
        foreach (var (name, query) in new[] {
            ("AuthDatabase", "SELECT id,username,salt,verifier,email,expansion,joindate,last_login FROM account LIMIT 0"),
            ("CharactersDatabase", "SELECT guid,account,name,race,class,gender,level,money,totaltime,online,logout_time,deleteDate FROM characters LIMIT 0") })
        {
            await using var connection = new MySqlConnection(builder.Configuration.GetConnectionString(name));
            await connection.OpenAsync();
            await using var command = new MySqlCommand(query, connection);
            await using var reader = await command.ExecuteReaderAsync();
            Console.WriteLine($"{name}: connected; required columns are present. No rows read or changed.");
        }
    }
    catch (Exception) { Console.Error.WriteLine("Database check failed. Check the private connection settings, running MySQL instance, permissions and schema."); Environment.ExitCode = 1; }
    return;
}

var app = builder.Build();
app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    if (local && (context.Connection.RemoteIpAddress is not { } ip || !IPAddress.IsLoopback(ip))) { context.Response.StatusCode = 403; return; }
    if (!local && !context.Request.IsHttps) { context.Response.StatusCode = 400; await context.Response.WriteAsync("HTTPS is required."); return; }
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    try { await next(); }
    catch (MySqlException) { if (!context.Response.HasStarted) { context.Response.StatusCode = 503; await context.Response.WriteAsJsonAsync(new { message = "Account database is unavailable. Please try again later." }); } }
});
app.UseDefaultFiles(); app.UseStaticFiles(); app.UseRateLimiter(); app.UseAuthentication(); app.UseAuthorization();
app.MapLauncherDistribution();
app.MapGet("/health", () => Results.Ok(new { service = "conquest-launcher-backend", version = "0.8.1", status = "ok" }));
app.MapGet("/api/site-config", (TurnstileService turnstile) => Results.Ok(new
{
    previewMode = false, registrationEnabled = registrations, passwordResetEnabled = portal.PasswordResetEnabled,
    turnstileEnabled = !local && turnstile.Enabled, turnstileSiteKey = turnstile.SiteKey, turnstileAction = turnstile.ExpectedAction
}));
app.MapGet("/api/community/discord", (DiscordCommunity discord) => discord.GetAsync());
app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context, AccountAuthService auth, CancellationToken ct) =>
{
    if (!Mutation(context) || string.IsNullOrWhiteSpace(request.Login) || request.Login.Length > 254 || string.IsNullOrEmpty(request.Password) || request.Password.Length > 128) return Results.BadRequest(new { message = "Enter your account name/email and password." });
    if (!Configured("AuthDatabase")) return Unavailable();
    var account = await auth.AuthenticateAsync(request.Login, request.Password, ct);
    if (account is null) return Results.Unauthorized();
    var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, account.Id.ToString()), new Claim(ClaimTypes.Name, account.Username), new Claim("coa:credentials", account.CredentialStamp) }, CookieAuthenticationDefaults.AuthenticationScheme);
    await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = false, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(Math.Clamp(portal.SessionHours, 1, 24)) });
    return Results.Ok(new { accountId = account.Id, username = account.Username });
}).RequireRateLimiting("login");
app.MapGet("/api/auth/session", (HttpContext context) => Id(context) is { } id ? Results.Ok(new { accountId = id, username = context.User.Identity?.Name }) : Results.Unauthorized());
app.MapPost("/api/auth/logout", async (HttpContext context) =>
{
    if (!Mutation(context)) return Results.BadRequest();
    await context.SignOutAsync(); return Results.Ok(new { message = "Signed out." });
}).RequireAuthorization();
app.MapGet("/api/account/overview", async (HttpContext context, AccountAuthService auth, CancellationToken ct) =>
{
    if (Id(context) is not { } accountId) return Results.Unauthorized();
    return Results.Ok(await auth.GetOverviewAsync(accountId, ct));
}).RequireAuthorization();
app.MapGet("/api/account/characters", async (HttpContext context, CharacterPortalService characters, CancellationToken ct) =>
{
    if (Id(context) is not { } accountId) return Results.Unauthorized();
    return Configured("CharactersDatabase") ? Results.Ok(await characters.GetCharactersAsync(accountId, ct)) : Unavailable();
}).RequireAuthorization();
app.MapGet("/api/account/discord", async (HttpContext context, DiscordAccountLinkService links, CancellationToken ct) =>
{
    if (Id(context) is not { } accountId) return Results.Unauthorized();
    return Results.Ok(await links.GetStatusAsync(accountId, ct));
}).RequireAuthorization();
app.MapPost("/api/account/discord/start", async (HttpContext context, DiscordAccountLinkService links, CancellationToken ct) =>
{
    if (!Mutation(context)) return Results.BadRequest();
    if (Id(context) is not { } accountId) return Results.Unauthorized();
    var status = await links.GetStatusAsync(accountId, ct);
    if (!status.Available) return Results.Json(new { message = status.Message ?? "Discord account linking is not configured." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    if (status.Linked) return Results.Conflict(new { message = "A Discord account is already connected. Disconnect it before linking another account." });
    return Results.Ok(await links.BeginAsync(accountId, ct));
}).RequireAuthorization().RequireRateLimiting("discord-link");
app.MapPost("/api/account/discord/unlink", async (HttpContext context, DiscordAccountLinkService links, CancellationToken ct) =>
{
    if (!Mutation(context)) return Results.BadRequest();
    if (Id(context) is not { } accountId) return Results.Unauthorized();
    var status = await links.GetStatusAsync(accountId, ct);
    if (!status.Available) return Results.Json(new { message = status.Message ?? "Discord account linking is not configured." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    var removed = await links.UnlinkAsync(accountId, ct);
    return Results.Ok(new { linked = false, message = removed ? "Discord account disconnected." : "No Discord account is linked." });
}).RequireAuthorization().RequireRateLimiting("discord-link");
app.MapGet("/api/account/discord/callback", async (HttpContext context, DiscordAccountLinkService links, CancellationToken ct) =>
{
    var result = await links.CompleteAsync(context.Request.Query["code"].ToString(), context.Request.Query["state"].ToString(), context.Request.Query["error"].ToString(), ct);
    var title = result.Success ? "Discord connected" : "Discord connection failed";
    var message = WebUtility.HtmlEncode(result.Message);
    context.Response.StatusCode = result.Success ? StatusCodes.Status200OK : StatusCodes.Status400BadRequest;
    context.Response.ContentType = "text/html; charset=utf-8";
    await context.Response.WriteAsync($"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{title}</title></head><body><main><h1>{title}</h1><p>{message}</p><p>You can close this tab and return to the Conquest launcher.</p></main></body></html>", ct);
});
app.MapPost("/api/register", async (RegisterRequest request, HttpContext context, RegistrationValidator validator, TurnstileService turnstile, AccountRegistrationService accounts, CancellationToken ct) =>
{
    if (!registrations || !Configured("AuthDatabase")) return Unavailable();
    if (!Mutation(context)) return Results.BadRequest();
    var invalid = validator.Validate(request); if (invalid is not null) return Results.BadRequest(new { message = invalid.Message });
    if (!local && turnstile.Enabled && !await turnstile.ValidateAsync(request.TurnstileToken, context.Connection.RemoteIpAddress?.ToString(), ct)) return Results.BadRequest(new { message = "Please complete the human verification challenge." });
    var result = await accounts.CreateAsync(request, ct);
    return result.Status switch {
        RegistrationStatus.Success => Results.Ok(new { message = "Account created. You can now sign in." }),
        RegistrationStatus.DuplicateUsername or RegistrationStatus.DuplicateEmail => Results.Conflict(new { message = result.Message }),
        RegistrationStatus.InvalidRequest => Results.BadRequest(new { message = result.Message }),
        _ => Unavailable()
    };
}).RequireRateLimiting("register");
app.MapPost("/api/password/forgot", async (ForgotPasswordRequest request, HttpContext context, PasswordResetService resets, CancellationToken ct) =>
{
    if (!portal.PasswordResetEnabled || !Configured("AuthDatabase")) return Unavailable();
    if (!Mutation(context) || (request.Email?.Length ?? 0) > 255) return Results.BadRequest();
    await resets.RequestAsync(request.Email ?? "", context.Connection.RemoteIpAddress?.ToString(), false, ct);
    return Results.Ok(new { message = "If the email matches an account, reset instructions will be sent." });
}).RequireRateLimiting("reset");
app.MapPost("/api/password/reset", async (ResetPasswordRequest request, HttpContext context, RegistrationValidator validator, PasswordResetService resets, CancellationToken ct) =>
{
    if (!portal.PasswordResetEnabled || !Configured("AuthDatabase")) return Unavailable();
    if (!Mutation(context) || string.IsNullOrWhiteSpace(request.Token) || request.Token.Length > 256) return Results.BadRequest();
    var invalid = validator.ValidatePassword(request.Password ?? "", request.ConfirmPassword ?? "");
    if (invalid is not null) return Results.BadRequest(new { message = invalid.Message });
    return await resets.ResetAsync(request.Token, request.Password!, ct) ? Results.Ok(new { message = "Password updated." }) : Results.BadRequest(new { message = "Reset link is invalid or expired." });
}).RequireRateLimiting("reset");
app.Run();

bool Configured(string name) => !string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString(name));
static IResult Unavailable() => Results.Json(new { message = "This account service is not configured yet." }, statusCode: 503);
static bool Mutation(HttpContext context) => context.Request.Headers["X-CoA-Request"] == "1";
static uint? Id(HttpContext context) => uint.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
static RateLimitPartition<string> Rate(HttpContext context, int permits, int minutes) => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(minutes), QueueLimit = 0 });
