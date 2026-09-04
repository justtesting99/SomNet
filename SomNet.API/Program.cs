using SomNet.API.Services;
using SomNet.Shared.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddSingleton<IMockDataStore, MockDataStore>();

builder.Services.AddControllers()
    .AddJsonOptions(options => SomNetJsonOptions.Configure(options.JsonSerializerOptions));

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:56761")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

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

app.UseCors();

app.UseAuthorization();

app.MapControllers();

app.Run();
