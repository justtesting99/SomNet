using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SomNet.API.Data;

public sealed class SomNetDbContextFactory : IDesignTimeDbContextFactory<SomNetDbContext>
{
    public SomNetDbContext CreateDbContext(string[] args)
    {
        var contentRoot = Directory.GetCurrentDirectory();
        var dataDirectory = Path.GetFullPath(Path.Combine(contentRoot, "..", "data"));
        Directory.CreateDirectory(dataDirectory);

        var databaseFilePath = Path.Combine(dataDirectory, "SomNet.mdf");
        var connectionString =
            $"Server=(localdb)\\MSSQLLocalDB;AttachDbFilename={databaseFilePath};Database=SomNet;Trusted_Connection=True;TrustServerCertificate=True";

        var optionsBuilder = new DbContextOptionsBuilder<SomNetDbContext>();
        optionsBuilder.UseSqlServer(connectionString);

        return new SomNetDbContext(optionsBuilder.Options);
    }
}
