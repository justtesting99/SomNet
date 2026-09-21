using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionActionSnapshotSummary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActionSummary",
                table: "SessionActionSnapshots",
                type: "nvarchar(512)",
                maxLength: 512,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActionSummary",
                table: "SessionActionSnapshots");
        }
    }
}
