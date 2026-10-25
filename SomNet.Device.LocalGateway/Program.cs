using SomNet.Device.LocalClient;
using SomNet.Device.LocalGateway.Configuration;
using SomNet.Device.LocalGateway.Middleware;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddOptions<GatewaySettings>()
    .Bind(builder.Configuration.GetSection(GatewaySettings.SectionName));

builder.Services.AddSomEspLocalClient();

var app = builder.Build();

app.UseMiddleware<GatewayApiKeyMiddleware>();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();
