using System.Text.Json.Serialization;
using SomNet.Device.LocalClient;
using SomNet.Device.LocalGateway.Configuration;
using SomNet.Device.LocalGateway.Endpoints;
using SomNet.Device.LocalGateway.Middleware;
using SomNet.Device.LocalGateway.Services;
using SomNet.Shared.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddOptions<GatewaySettings>()
    .Bind(builder.Configuration.GetSection(GatewaySettings.SectionName));

builder.Services.AddSomEspLocalClient();
builder.Services.AddSingleton<AutomaticRunCoordinator>();
builder.Services.AddSingleton<DeviceGatewayStatusService>();

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    SomNetJsonOptions.Configure(options.SerializerOptions);
});

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new() { Title = "SomNet Device Local Gateway", Version = "v1" });
    });
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "SomNet Device Local Gateway v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseMiddleware<GatewayCorrelationMiddleware>();
app.UseMiddleware<GatewayApiKeyMiddleware>();

app.MapGatewayEndpoints();

app.Run();

public partial class Program;
