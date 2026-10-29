using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSubDeviceActuatorKind : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActuatorKind",
                table: "SubDeviceRegistrations",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Relay");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActuatorKind",
                table: "SubDeviceRegistrations");
        }
    }
}
