using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Notifications",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SentAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    DomTarget = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SubTarget = table.Column<int>(type: "int", nullable: false),
                    Subject = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    SessionDateTime = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Sessions",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    DomTarget = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SubTarget = table.Column<int>(type: "int", nullable: false),
                    Mode = table.Column<int>(type: "int", nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserOptions",
                columns: table => new
                {
                    Username = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    EnableSoundAlerts = table.Column<bool>(type: "bit", nullable: false),
                    ConfirmBeforeCommands = table.Column<bool>(type: "bit", nullable: false),
                    AutoExpandVideoOnMobile = table.Column<bool>(type: "bit", nullable: false),
                    MobileVideoExpandDefault = table.Column<int>(type: "int", nullable: false),
                    ShowSessionTimestamps = table.Column<bool>(type: "bit", nullable: false),
                    OperatorDisplayName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    DefaultNotesPrefix = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ReconnectIntervalSeconds = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserOptions", x => x.Username);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_DomTarget_SubTarget_SentAt",
                table: "Notifications",
                columns: new[] { "DomTarget", "SubTarget", "SentAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_DomTarget_SubTarget_StartedAt",
                table: "Sessions",
                columns: new[] { "DomTarget", "SubTarget", "StartedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Notifications");

            migrationBuilder.DropTable(
                name: "Sessions");

            migrationBuilder.DropTable(
                name: "UserOptions");
        }
    }
}
