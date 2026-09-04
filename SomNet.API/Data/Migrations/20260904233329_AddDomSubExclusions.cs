using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDomSubExclusions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DomSubExclusions",
                columns: table => new
                {
                    DomTarget = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SubName = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DomSubExclusions", x => new { x.DomTarget, x.SubName });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DomSubExclusions");
        }
    }
}
