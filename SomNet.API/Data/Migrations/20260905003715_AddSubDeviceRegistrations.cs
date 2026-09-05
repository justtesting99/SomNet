using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSubDeviceRegistrations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SubDeviceRegistrations",
                columns: table => new
                {
                    DomTarget = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SubName = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DeviceId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    AccessToken = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: false),
                    TokenJti = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PairedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    TokenExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    LastConnectedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    IsRevoked = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubDeviceRegistrations", x => new { x.DomTarget, x.SubName });
                });

            migrationBuilder.CreateIndex(
                name: "IX_SubDeviceRegistrations_DeviceId",
                table: "SubDeviceRegistrations",
                column: "DeviceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SubDeviceRegistrations");
        }
    }
}
