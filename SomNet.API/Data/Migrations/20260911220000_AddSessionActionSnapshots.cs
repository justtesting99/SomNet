using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SomNet.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionActionSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SessionActionSnapshots",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DomTarget = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ActionIndex = table.Column<int>(type: "int", nullable: false),
                    Feed = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    RelativePath = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                    CapturedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CommandKey = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    CorrelationId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SessionActionSnapshots", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SessionActionSnapshots_DomTarget_SessionId",
                table: "SessionActionSnapshots",
                columns: new[] { "DomTarget", "SessionId" });

            migrationBuilder.CreateIndex(
                name: "IX_SessionActionSnapshots_SessionId_ActionIndex_Feed",
                table: "SessionActionSnapshots",
                columns: new[] { "SessionId", "ActionIndex", "Feed" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SessionActionSnapshots");
        }
    }
}
