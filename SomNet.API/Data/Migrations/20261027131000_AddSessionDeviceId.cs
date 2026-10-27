using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionDeviceId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DeviceId",
                table: "Sessions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_DomTarget_SubTarget_DeviceId_StartedAt",
                table: "Sessions",
                columns: new[] { "DomTarget", "SubTarget", "DeviceId", "StartedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Sessions_DomTarget_SubTarget_DeviceId_StartedAt",
                table: "Sessions");

            migrationBuilder.DropColumn(
                name: "DeviceId",
                table: "Sessions");
        }
    }
}
