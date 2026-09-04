using Microsoft.Extensions.FileProviders;
using SomNet.API.Services;
using SomNet.Shared.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddSingleton<IMockDataStore, MockDataStore>();

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

var uiDistPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "SomNet.UI", "dist"));
var uiDistExists = Directory.Exists(uiDistPath);

// Configure the HTTP request pipeline.
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

app.UseHttpsRedirection();

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
