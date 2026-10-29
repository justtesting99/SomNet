using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class SubDeviceRegistrationCompositeKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_SubDeviceRegistrations",
                table: "SubDeviceRegistrations");

            migrationBuilder.AddPrimaryKey(
                name: "PK_SubDeviceRegistrations",
                table: "SubDeviceRegistrations",
                columns: new[] { "DomTarget", "SubName", "DeviceId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_SubDeviceRegistrations",
                table: "SubDeviceRegistrations");

            migrationBuilder.AddPrimaryKey(
                name: "PK_SubDeviceRegistrations",
                table: "SubDeviceRegistrations",
                columns: new[] { "DomTarget", "SubName" });
        }
    }
}
