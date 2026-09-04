using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDomSubSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserOptions");

            migrationBuilder.CreateTable(
                name: "DomSubSettings",
                columns: table => new
                {
                    DomTarget = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SubTarget = table.Column<int>(type: "int", nullable: false),
                    SettingsJson = table.Column<string>(type: "nvarchar(max)", maxLength: 8000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DomSubSettings", x => new { x.DomTarget, x.SubTarget });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DomSubSettings");

            migrationBuilder.CreateTable(
                name: "UserOptions",
                columns: table => new
                {
                    Username = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    AutoExpandVideoOnMobile = table.Column<bool>(type: "bit", nullable: false),
                    ConfirmBeforeCommands = table.Column<bool>(type: "bit", nullable: false),
                    DefaultNotesPrefix = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    EnableSoundAlerts = table.Column<bool>(type: "bit", nullable: false),
                    MobileVideoExpandDefault = table.Column<int>(type: "int", nullable: false),
                    OperatorDisplayName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    ReconnectIntervalSeconds = table.Column<int>(type: "int", nullable: false),
                    ShowSessionTimestamps = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserOptions", x => x.Username);
                });
        }
    }
}
