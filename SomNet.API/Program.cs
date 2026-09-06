using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using SomNet.API.Configuration;
using SomNet.API.Data;
using SomNet.API.Hubs;
using SomNet.API.Services;
using SomNet.Shared.Serialization;

var builder = WebApplication.CreateBuilder(args);

var showSql = builder.Configuration.GetValue("Logging:ShowSql", false);
if (showSql)
{
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Information);
}
else
{
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);
}

var dataDirectory = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "data"));
Directory.CreateDirectory(dataDirectory);

var databaseFilePath = Path.Combine(dataDirectory, "SomNet.mdf");
var connectionString =
    $"Server=(localdb)\\MSSQLLocalDB;AttachDbFilename={databaseFilePath};Database=SomNet;Trusted_Connection=True;TrustServerCertificate=True";

builder.Services.AddDbContext<SomNetDbContext>(options =>
{
    options.UseSqlServer(connectionString);
    if (showSql && builder.Environment.IsDevelopment())
    {
        options.EnableSensitiveDataLogging();
        options.EnableDetailedErrors();
    }
});

builder.Services.AddScoped<ISomNetDataStore, SomNetDataStore>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddSingleton<IDeviceConnectionRegistry, DeviceConnectionRegistry>();
builder.Services.AddScoped<IDeviceTokenService, DeviceTokenService>();
builder.Services.AddScoped<IHardwareCommandDispatcher, HardwareCommandDispatcher>();
builder.Services.Configure<HardwareReachabilityOptions>(
    builder.Configuration.GetSection(HardwareReachabilityOptions.SectionName));

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddHostedService<DeviceReachabilityBackgroundService>();
}

builder.Services
    .AddOptions<JwtSettings>()
    .Bind(builder.Configuration.GetSection(JwtSettings.SectionName))
    .Validate(settings => !string.IsNullOrWhiteSpace(settings.Key), "Jwt:Key is required.")
    .Validate(settings => settings.Key.Length >= 32, "Jwt:Key must be at least 32 characters.")
    .Validate(settings => !string.IsNullOrWhiteSpace(settings.DeviceAudience), "Jwt:DeviceAudience is required.")
    .ValidateOnStart();

var jwtSettings = builder.Configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>()
    ?? throw new InvalidOperationException("Jwt configuration is missing.");

if (string.IsNullOrWhiteSpace(jwtSettings.DeviceAudience))
{
    jwtSettings = new JwtSettings
    {
        Key = jwtSettings.Key,
        Issuer = jwtSettings.Issuer,
        Audience = jwtSettings.Audience,
        DeviceAudience = "SomNet.Device",
        ExpireMinutes = jwtSettings.ExpireMinutes,
        DeviceExpireDays = jwtSettings.DeviceExpireDays > 0 ? jwtSettings.DeviceExpireDays : 365,
    };
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudiences = [jwtSettings.Audience, jwtSettings.DeviceAudience],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Key)),
            NameClaimType = JwtRegisteredClaimNames.Sub,
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddControllers()
    .AddJsonOptions(options => SomNetJsonOptions.Configure(options.JsonSerializerOptions));

builder.Services.AddSignalR(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(10);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    options.HandshakeTimeout = TimeSpan.FromSeconds(15);
})
    .AddJsonProtocol(options => SomNetJsonOptions.Configure(options.PayloadSerializerOptions));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new()
    {
        Title = "SomNet API",
        Version = "v1",
        Description = "SomNet session control, history, notifications, and configuration API.",
    });
    options.DescribeAllParametersInCamelCase();
    options.AddSecurityDefinition("bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Operator JWT from POST /api/auth/login (paste token.accessToken).",
    });
    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("bearer", document)] = [],
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.Services.GetRequiredService<IHostApplicationLifetime>().ApplicationStarted.Register(() =>
    {
        var reachability = app.Configuration
            .GetSection(HardwareReachabilityOptions.SectionName)
            .Get<HardwareReachabilityOptions>();
        if (reachability?.Enabled == true)
        {
            app.Logger.LogInformation(
                "LAN tip: if ESP32 only connects after you open http://<device-ip>/, enable reachability ping " +
                "and/or run scripts/Allow-SomNetApiFirewall.ps1 — often AP/client isolation, not SQL or SignalR.");
        }
    });
}

app.Logger.LogInformation("SQL console logging is {SqlLoggingState}", showSql ? "enabled" : "disabled");

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<SomNetDbContext>();
    db.Database.Migrate();
    SomNetDbSeeder.SeedIfEmpty(db);
}

var uiDistPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "SomNet.UI", "dist"));
var uiDistExists = Directory.Exists(uiDistPath);

if (app.Environment.IsDevelopment())
{
    app.Use(async (context, next) =>
    {
        if (context.Request.Path.StartsWithSegments("/hubs/hardware/negotiate"))
        {
            app.Logger.LogInformation(
                "Hub negotiate from {RemoteIp}",
                context.Connection.RemoteIpAddress);
        }

        await next();
    });

    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "SomNet API v1");
        options.RoutePrefix = "swagger";
        options.DocumentTitle = "SomNet API";
    });
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

if (uiDistExists)
{
    var uiFileProvider = new PhysicalFileProvider(uiDistPath);

    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = uiFileProvider,
    });

    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = uiFileProvider,
    });
}
else if (app.Environment.IsDevelopment())
{
    app.Logger.LogWarning(
        "UI build output not found at {UiDistPath}. Run `npm run build` in SomNet.UI or build SomNet.API to generate it.",
        uiDistPath);
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<HardwareHub>("/hubs/hardware");

if (uiDistExists)
{
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(uiDistPath),
    });
}

app.Run();
