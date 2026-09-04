using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using SomNet.API.Configuration;
using SomNet.API.Data;
using SomNet.API.Services;
using SomNet.Shared.Serialization;

var builder = WebApplication.CreateBuilder(args);

var dataDirectory = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "data"));
Directory.CreateDirectory(dataDirectory);

var databaseFilePath = Path.Combine(dataDirectory, "SomNet.mdf");
var connectionString =
    $"Server=(localdb)\\MSSQLLocalDB;AttachDbFilename={databaseFilePath};Database=SomNet;Trusted_Connection=True;TrustServerCertificate=True";

builder.Services.AddDbContext<SomNetDbContext>(options =>
    options.UseSqlServer(connectionString));

builder.Services.AddScoped<ISomNetDataStore, SomNetDataStore>();
builder.Services.AddScoped<IAuthService, AuthService>();

builder.Services
    .AddOptions<JwtSettings>()
    .Bind(builder.Configuration.GetSection(JwtSettings.SectionName))
    .Validate(settings => !string.IsNullOrWhiteSpace(settings.Key), "Jwt:Key is required.")
    .Validate(settings => settings.Key.Length >= 32, "Jwt:Key must be at least 32 characters.")
    .ValidateOnStart();

var jwtSettings = builder.Configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>()
    ?? throw new InvalidOperationException("Jwt configuration is missing.");

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
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Key)),
            NameClaimType = JwtRegisteredClaimNames.Sub,
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddControllers()
    .AddJsonOptions(options => SomNetJsonOptions.Configure(options.JsonSerializerOptions));

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
});

var app = builder.Build();

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

if (uiDistExists)
{
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(uiDistPath),
    });
}

app.Run();
