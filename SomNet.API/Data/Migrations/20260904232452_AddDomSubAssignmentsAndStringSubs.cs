using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDomSubAssignmentsAndStringSubs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Sessions_DomTarget_SubTarget_StartedAt",
                table: "Sessions");

            migrationBuilder.DropIndex(
                name: "IX_Notifications_DomTarget_SubTarget_SentAt",
                table: "Notifications");

            migrationBuilder.DropPrimaryKey(
                name: "PK_DomSubSettings",
                table: "DomSubSettings");

            migrationBuilder.AddColumn<string>(
                name: "SubTarget_New",
                table: "Sessions",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE [Sessions]
                SET [SubTarget_New] = CASE [SubTarget]
                    WHEN 0 THEN N'Slv66'
                    WHEN 1 THEN N'Slv67'
                    WHEN 2 THEN N'Slv68'
                    ELSE N'Slv66'
                END
                """);

            migrationBuilder.DropColumn(
                name: "SubTarget",
                table: "Sessions");

            migrationBuilder.RenameColumn(
                name: "SubTarget_New",
                table: "Sessions",
                newName: "SubTarget");

            migrationBuilder.AlterColumn<string>(
                name: "SubTarget",
                table: "Sessions",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubTarget_New",
                table: "Notifications",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE [Notifications]
                SET [SubTarget_New] = CASE [SubTarget]
                    WHEN 0 THEN N'Slv66'
                    WHEN 1 THEN N'Slv67'
                    WHEN 2 THEN N'Slv68'
                    ELSE N'Slv66'
                END
                """);

            migrationBuilder.DropColumn(
                name: "SubTarget",
                table: "Notifications");

            migrationBuilder.RenameColumn(
                name: "SubTarget_New",
                table: "Notifications",
                newName: "SubTarget");

            migrationBuilder.AlterColumn<string>(
                name: "SubTarget",
                table: "Notifications",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubName",
                table: "DomSubSettings",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE [DomSubSettings]
                SET [SubName] = CASE [SubTarget]
                    WHEN 0 THEN N'Slv66'
                    WHEN 1 THEN N'Slv67'
                    WHEN 2 THEN N'Slv68'
                    ELSE N'Slv66'
                END
                """);

            migrationBuilder.DropColumn(
                name: "SubTarget",
                table: "DomSubSettings");

            migrationBuilder.AlterColumn<string>(
                name: "SubName",
                table: "DomSubSettings",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_DomSubSettings",
                table: "DomSubSettings",
                columns: new[] { "DomTarget", "SubName" });

            migrationBuilder.CreateTable(
                name: "DomSubAssignments",
                columns: table => new
                {
                    DomTarget = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SubName = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DomSubAssignments", x => new { x.DomTarget, x.SubName });
                });

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_DomTarget_SubTarget_StartedAt",
                table: "Sessions",
                columns: new[] { "DomTarget", "SubTarget", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_DomTarget_SubTarget_SentAt",
                table: "Notifications",
                columns: new[] { "DomTarget", "SubTarget", "SentAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DomSubAssignments");

            migrationBuilder.DropIndex(
                name: "IX_Sessions_DomTarget_SubTarget_StartedAt",
                table: "Sessions");

            migrationBuilder.DropIndex(
                name: "IX_Notifications_DomTarget_SubTarget_SentAt",
                table: "Notifications");

            migrationBuilder.DropPrimaryKey(
                name: "PK_DomSubSettings",
                table: "DomSubSettings");

            migrationBuilder.AddColumn<int>(
                name: "SubTarget",
                table: "DomSubSettings",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                UPDATE [DomSubSettings]
                SET [SubTarget] = CASE [SubName]
                    WHEN N'Slv66' THEN 0
                    WHEN N'Slv67' THEN 1
                    WHEN N'Slv68' THEN 2
                    ELSE 0
                END
                """);

            migrationBuilder.DropColumn(
                name: "SubName",
                table: "DomSubSettings");

            migrationBuilder.AddPrimaryKey(
                name: "PK_DomSubSettings",
                table: "DomSubSettings",
                columns: new[] { "DomTarget", "SubTarget" });

            migrationBuilder.AddColumn<int>(
                name: "SubTarget_Old",
                table: "Sessions",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                UPDATE [Sessions]
                SET [SubTarget_Old] = CASE [SubTarget]
                    WHEN N'Slv66' THEN 0
                    WHEN N'Slv67' THEN 1
                    WHEN N'Slv68' THEN 2
                    ELSE 0
                END
                """);

            migrationBuilder.DropColumn(
                name: "SubTarget",
                table: "Sessions");

            migrationBuilder.RenameColumn(
                name: "SubTarget_Old",
                table: "Sessions",
                newName: "SubTarget");

            migrationBuilder.AddColumn<int>(
                name: "SubTarget_Old",
                table: "Notifications",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                UPDATE [Notifications]
                SET [SubTarget_Old] = CASE [SubTarget]
                    WHEN N'Slv66' THEN 0
                    WHEN N'Slv67' THEN 1
                    WHEN N'Slv68' THEN 2
                    ELSE 0
                END
                """);

            migrationBuilder.DropColumn(
                name: "SubTarget",
                table: "Notifications");

            migrationBuilder.RenameColumn(
                name: "SubTarget_Old",
                table: "Notifications",
                newName: "SubTarget");

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_DomTarget_SubTarget_StartedAt",
                table: "Sessions",
                columns: new[] { "DomTarget", "SubTarget", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_DomTarget_SubTarget_SentAt",
                table: "Notifications",
                columns: new[] { "DomTarget", "SubTarget", "SentAt" });
        }
    }
}
