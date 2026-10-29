using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDomSubDeviceSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DomSubDeviceSettings",
                columns: table => new
                {
                    DomTarget = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SubName = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DeviceId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SettingsJson = table.Column<string>(type: "nvarchar(max)", maxLength: 8000, nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DomSubDeviceSettings", x => new { x.DomTarget, x.SubName, x.DeviceId });
                });

            migrationBuilder.Sql(
                """
                INSERT INTO DomSubDeviceSettings (DomTarget, SubName, DeviceId, SettingsJson)
                SELECT r.DomTarget, r.SubName, r.DeviceId, s.SettingsJson
                FROM SubDeviceRegistrations r
                INNER JOIN DomSubSettings s
                    ON s.DomTarget = r.DomTarget AND s.SubName = r.SubName
                WHERE r.IsRevoked = 0
                  AND NOT EXISTS (
                    SELECT 1
                    FROM DomSubDeviceSettings d
                    WHERE d.DomTarget = r.DomTarget
                      AND d.SubName = r.SubName
                      AND d.DeviceId = r.DeviceId
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DomSubDeviceSettings");
        }
    }
}
